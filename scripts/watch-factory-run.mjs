#!/usr/bin/env node
import { Connection, Client } from "@temporalio/client";

const API = process.env.SF_API ?? "http://127.0.0.1:8787";
const TOKEN = process.env.FACTORY_API_TOKEN ?? "change-me";
const POLL_MS = Number(process.env.SF_POLL_MS ?? 30_000);

const DEFAULT_ANSWER = [
  "Use the Open Library Search API at https://openlibrary.org/search.json with query parameter q=isbn:<partial-isbn>.",
  "No authentication is required.",
  "Expose GraphQL query searchBooksByIsbn(isbn: String!, limit: Int = 10): [BookSuggestion!]! returning isbn, title, and authors.",
  "Suggestions are transient external results and must not be persisted to PostgreSQL.",
  "Use request context deadlines/timeouts and return typed errors for provider failures.",
].join(" ");

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${path}: ${body.error ?? response.statusText}`);
  return body;
}

async function answerClarification(runId, request) {
  console.log(`[watch] answering clarification ${request.requestId} on ${runId}`);
  await api(`/factory/runs/${runId}/clarifications/${request.requestId}/answer`, {
    method: "POST",
    body: JSON.stringify({
      answer: DEFAULT_ANSWER,
      stateRevision: request.stateRevision,
    }),
  });
}

async function createRetry(runId, description) {
  const run = await api(`/runs/${runId}`);
  const created = (run.events ?? []).find((e) => e.type === "task.created");
  const result = await api("/tasks", {
    method: "POST",
    body: JSON.stringify({
      repository: created?.payload?.repository ?? "https://github.com/aryaniyaps/go-book-store.git",
      title: `${created?.payload?.title ?? "ISBN autocomplete"} (retry)`,
      description,
    }),
  });
  console.log(`[watch] started retry run ${result.id}`);
  return result.id;
}

async function latestFailureReason(handle) {
  const history = await handle.fetchHistory();
  for (let i = history.events.length - 1; i >= 0; i -= 1) {
    const event = history.events[i];
    if (event.workflowExecutionFailedEventAttributes) {
      return event.workflowExecutionFailedEventAttributes.failure?.message ?? "workflow failed";
    }
    if (event.activityTaskTimedOutEventAttributes) {
      return "activity timeout";
    }
  }
  return "unknown failure";
}

async function monitorOnce(client, runId) {
  const handle = client.workflow.getHandle(`factory-${runId}`);
  const description = await handle.describe();
  const temporalStatus = description.status.name;

  if (temporalStatus === "COMPLETED") {
    console.log(`[watch] ${runId} completed successfully`);
    return { done: true, success: true };
  }
  if (temporalStatus === "FAILED") {
    const reason = await latestFailureReason(handle);
    console.log(`[watch] ${runId} failed: ${reason}`);
    return { done: true, failed: true, reason };
  }
  if (temporalStatus === "CANCELLED") {
    return { done: true, cancelled: true };
  }

  if (handle.query) {
    const state = await handle.query("factoryStatus");
    if (state?.status === "input_required" && state.pendingClarification) {
      await answerClarification(runId, state.pendingClarification);
      return { done: false, acted: "answered" };
    }
    if (state?.currentNode) {
      console.log(`[watch] ${runId} node=${state.currentNode} status=${state.status}`);
    }
  }

  const run = await api(`/runs/${runId}`);
  const pending = [...(run.events ?? [])].reverse().find((e) => e.type === "clarification.requested");
  if (pending?.payload?.requestId) {
    const answered = (run.events ?? []).some(
      (e) => e.type === "clarification.answered" && e.payload?.requestId === pending.payload.requestId,
    );
    if (!answered) {
      await answerClarification(runId, pending.payload);
      return { done: false, acted: "answered-from-events" };
    }
  }

  return { done: false };
}

async function main() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? "default" });

  let activeRunId = process.env.SF_RUN_ID ?? "1b7b816b-a5f8-468d-95ab-d682f1f9afda";

  for (;;) {
    try {
      const outcome = await monitorOnce(client, activeRunId);
      if (outcome.done) {
        if (outcome.success) process.exit(0);
        if (outcome.failed) {
          const prior = await api(`/runs/${activeRunId}`);
          const created = prior.events?.find((e) => e.type === "task.created");
          const nextId = await createRetry(
            activeRunId,
            `${created?.payload?.description ?? ""}\n\nPrevious run ${activeRunId} failed: ${outcome.reason}. Continue with Open Library API integration and make all tests pass.`,
          );
          activeRunId = nextId;
          await new Promise((r) => setTimeout(r, 10_000));
          continue;
        }
        process.exit(outcome.cancelled ? 2 : 1);
      }
    } catch (error) {
      console.error("[watch] poll error", error instanceof Error ? error.message : error);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((error) => {
  console.error("[watch] fatal", error);
  process.exit(1);
});
