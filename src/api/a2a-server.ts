import { createServer, type Server } from "node:http";
import express from "express";
import {
  A2A_PROTOCOL_VERSION,
  AGENT_CARD_PATH,
  Role,
  TaskState,
  type AgentCard,
  type Message,
  type Task,
  type TaskStatus,
} from "@a2a-js/sdk";
import {
  AgentEvent,
  DefaultRequestHandler,
  InMemoryTaskStore,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from "@a2a-js/sdk/server";
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from "@a2a-js/sdk/server/express";
import type { ApiStore } from "./server.js";
import type { OperationsService } from "./operations-service.js";
import { normalizeTaskIntake } from "../tasks/intake-normalizer.js";
import type { FactoryA2ATaskStore } from "../db/a2a-task-store.js";

export interface A2AServerOptions {
  store: ApiStore;
  operations: OperationsService;
  publicUrl: string;
  apiToken: string;
  taskStore?: FactoryA2ATaskStore;
}

export function createA2AServer(options: A2AServerOptions): Server {
  const executor = new FactoryAgentExecutor(options);
  const card = factoryAgentCard(options.publicUrl);
  const handler = new DefaultRequestHandler(card, options.taskStore ?? new InMemoryTaskStore(), executor);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((request, response, next) => {
    if (request.headers.authorization !== `Bearer ${options.apiToken}`) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  });
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: handler }));
  app.use("/a2a", jsonRpcHandler({
    requestHandler: handler,
    userBuilder: UserBuilder.noAuthentication,
  }));
  return createServer(app);
}

class FactoryAgentExecutor implements AgentExecutor {
  private readonly runByTask = new Map<string, string>();

  constructor(private readonly options: A2AServerOptions) {}

  async execute(context: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const existingRunId = this.runByTask.get(context.taskId)
      ?? await this.options.taskStore?.runIdForTask(context.taskId)
      ?? stringMetadata(context.task?.metadata, "factoryRunId");
    let runId = existingRunId;

    if (runId) {
      const clarification = clarificationMetadata(context.task?.status?.message);
      if (clarification) {
        await this.options.operations.answerClarification(runId, {
          schemaVersion: "clarification-answer.v1",
          requestId: clarification.requestId,
          answerId: context.userMessage.messageId,
          idempotencyKey: `${clarification.requestId}:${context.userMessage.messageId}`,
          responder: { type: "a2a_agent", id: "upstream" },
          body: textFromMessage(context.userMessage),
          stateRevision: clarification.stateRevision,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      runId = await this.options.store.createTask(
        normalizeTaskIntake({ prompt: textFromMessage(context.userMessage) }),
      );
      this.runByTask.set(context.taskId, runId);
    }

    bus.publish(AgentEvent.task({
      id: context.taskId,
      contextId: context.contextId,
      status: status(TaskState.TASK_STATE_WORKING, context, "Software Factory is working"),
      artifacts: [],
      history: [context.userMessage],
      metadata: { factoryRunId: runId },
    }));

    const snapshot = await waitForObservableState(this.options.store, runId);
    bus.publish(AgentEvent.statusUpdate({
      taskId: context.taskId,
      contextId: context.contextId,
      status: statusForRun(snapshot, context),
      metadata: { factoryRunId: runId },
    }));
    bus.finished();
  }

  async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
    const runId = this.runByTask.get(taskId)
      ?? await this.options.taskStore?.runIdForTask(taskId);
    if (!runId) throw new Error("A2A task mapping is unavailable");
    await this.options.operations.cancelRun(runId);
    bus.publish(AgentEvent.statusUpdate({
      taskId,
      contextId: taskId,
      status: {
        state: TaskState.TASK_STATE_CANCELED,
        message: undefined,
        timestamp: new Date().toISOString(),
      },
      metadata: { factoryRunId: runId },
    }));
    bus.finished();
  }
}

function factoryAgentCard(publicUrl: string): AgentCard {
  return {
    name: "Software Factory",
    description: "Builds and verifies software changes with a durable Temporal pipeline.",
    version: "1.0.0",
    provider: { url: publicUrl, organization: "Software Factory" },
    supportedInterfaces: [{
      url: `${publicUrl.replace(/\/$/, "")}/a2a`,
      protocolBinding: "JSONRPC",
      protocolVersion: A2A_PROTOCOL_VERSION,
      tenant: "",
    }],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [],
    },
    securitySchemes: {
      bearer: {
        scheme: {
          $case: "httpAuthSecurityScheme",
          value: {
            scheme: "Bearer",
            bearerFormat: "token",
            description: "Software Factory API bearer token",
          },
        },
      },
    },
    securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [{
      id: "software-engineering",
      name: "Software engineering task",
      description: "Investigates, plans, implements, verifies, and releases a repository change.",
      tags: ["software-engineering", "code", "delivery"],
      examples: ["Add an authenticated health endpoint and verify its behavior."],
      inputModes: ["text/plain"],
      outputModes: ["text/plain", "application/json"],
      securityRequirements: [],
    }],
    signatures: [],
  };
}

type RunSnapshot = {
  status?: string;
  failureReason?: string;
  events?: Array<{ type?: string; payload?: unknown }>;
};

async function waitForObservableState(store: ApiStore, runId: string): Promise<RunSnapshot> {
  for (let attempt = 0; attempt < 172_800; attempt += 1) {
    const snapshot = (await store.getRun(runId) ?? {}) as RunSnapshot;
    if (
      snapshot.status === "input_required"
      || snapshot.status === "succeeded"
      || snapshot.status === "failed"
      || snapshot.status === "cancelled"
      || snapshot.status === "rolled_back"
    ) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return (await store.getRun(runId) ?? { status: "running" }) as RunSnapshot;
}

function statusForRun(snapshot: RunSnapshot, context: RequestContext): TaskStatus {
  if (snapshot.status === "input_required") {
    const request = [...(snapshot.events ?? [])]
      .reverse()
      .find((event) => event.type === "clarification.requested")?.payload as
      | { requestId?: string; question?: string; stateRevision?: number }
      | undefined;
    return status(
      TaskState.TASK_STATE_INPUT_REQUIRED,
      context,
      request?.question ?? "Additional input is required",
      request?.requestId && Number.isInteger(request.stateRevision)
        ? { clarification: request }
        : undefined,
    );
  }
  if (snapshot.status === "succeeded") {
    return status(TaskState.TASK_STATE_COMPLETED, context, "Factory run completed");
  }
  if (snapshot.status === "cancelled") {
    return status(TaskState.TASK_STATE_CANCELED, context, "Factory run cancelled");
  }
  if (snapshot.status === "failed" || snapshot.status === "rolled_back") {
    return status(TaskState.TASK_STATE_FAILED, context, snapshot.failureReason ?? snapshot.status);
  }
  return status(TaskState.TASK_STATE_WORKING, context, "Software Factory is working");
}

function status(
  state: TaskState,
  context: RequestContext,
  text: string,
  metadata?: Record<string, unknown>,
): TaskStatus {
  return {
    state,
    message: {
      messageId: `${context.taskId}:${state}:${Date.now()}`,
      contextId: context.contextId,
      taskId: context.taskId,
      role: Role.ROLE_AGENT,
      parts: [{ content: { $case: "text", value: text }, metadata: undefined, filename: "", mediaType: "text/plain" }],
      metadata,
      extensions: [],
      referenceTaskIds: [],
    },
    timestamp: new Date().toISOString(),
  };
}

function textFromMessage(message: Message): string {
  return message.parts
    .filter((part) => part.content?.$case === "text")
    .map((part) => part.content?.value)
    .join("\n")
    .trim();
}

function stringMetadata(metadata: Task["metadata"], key: string): string | undefined {
  return typeof metadata?.[key] === "string" ? metadata[key] : undefined;
}

function clarificationMetadata(message?: Message): { requestId: string; stateRevision: number } | undefined {
  const value = message?.metadata?.clarification as { requestId?: unknown; stateRevision?: unknown } | undefined;
  if (typeof value?.requestId !== "string" || !Number.isInteger(value.stateRevision)) return undefined;
  return { requestId: value.requestId, stateRevision: value.stateRevision as number };
}
