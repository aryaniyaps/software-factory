import { describe, expect, it } from "vitest";
import { correlationToAgentMetadata, correlationToLiteLLMMetadata, litellmTags } from "../../src/integrations/correlation.js";

describe("correlation metadata", () => {
  it("maps CorrelationContext into LiteLLM metadata for Phoenix grouping", () => {
    const metadata = correlationToLiteLLMMetadata({
      factoryRunId: "run-1",
      initiativeId: "init-1",
      ticketId: "ticket-1",
      attemptId: "attempt-1",
      phaseId: "implement",
      agentRole: "implement",
      worktreeId: "/tmp/wt",
      organization: "acme",
      project: "platform",
      repository: "/repo/app",
    });

    expect(metadata).toMatchObject({
      session_id: "run-1",
      trace_id: "run-1:ticket-1:attempt-1",
      generation_name: "implement",
      trace_name: "implement",
      factory_run_id: "run-1",
      ticket_id: "ticket-1",
      attempt_id: "attempt-1",
      phase_id: "implement",
      agent_role: "implement",
      worktree_id: "/tmp/wt",
      organization: "acme",
      project: "platform",
      repository: "/repo/app",
    });
    expect(metadata.tags).toEqual([
      "org:acme",
      "project:platform",
      "repository:/repo/app",
      "run:run-1",
      "initiative:init-1",
      "role:implement",
      "phase:implement",
      "worktree:/tmp/wt",
    ]);
  });

  it("flattens metadata for agent runners", () => {
    const metadata = correlationToAgentMetadata({
      factoryRunId: "run-1",
      ticketId: "ticket-1",
      attemptId: "attempt-1",
      phaseId: "implement",
      agentRole: "implement",
      organization: "acme",
      project: "platform",
    });

    expect(metadata.session_id).toBe("run-1");
    expect(metadata.tags).toBe("org:acme,project:platform,run:run-1,role:implement,phase:implement");
  });

  it("omits optional correlation fields when absent", () => {
    const metadata = correlationToLiteLLMMetadata({
      factoryRunId: "run-2",
      ticketId: "ticket-2",
      attemptId: "1",
      phaseId: "scout",
    });

    expect(metadata.session_id).toBe("run-2");
    expect(metadata.trace_name).toBe("scout");
    expect(metadata.initiative_id).toBeUndefined();
    expect(litellmTags({
      factoryRunId: "run-2",
      ticketId: "ticket-2",
      attemptId: "1",
      phaseId: "scout",
    })).toEqual(["run:run-2", "phase:scout"]);
  });
});
