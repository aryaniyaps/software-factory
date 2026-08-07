import { describe, expect, it } from "vitest";
import {
  parseClaimRevision,
  parseConversationMessage,
  parseNodeContext,
} from "../../src/contracts/conversation.js";

const artifact = {
  schemaVersion: "artifact-ref.v1" as const,
  id: "artifact-discovery",
  kind: "discovery_plan",
  mediaType: "application/json",
  uri: "evidence://run/discovery",
  sha256: "a".repeat(64),
  producer: { node: "discovery_plan", attemptId: "attempt-1" },
};

describe("conversation contracts", () => {
  it("round-trips a non-lossy node context", () => {
    const context = {
      schemaVersion: "node-context.v1",
      stateRevision: 3,
      task: {
        prompt: "Add durable agent conversations",
        title: "Durable conversations",
        description: "Record and route agent questions.",
        repository: "/repo",
      },
      repository: { revision: "abc123", worktreePath: "/worktree" },
      predecessors: [{
        node: "discovery_plan",
        attemptId: "attempt-1",
        outputRef: artifact,
        evidenceRefs: ["ev-1"],
      }],
      conversationRefs: [{ threadId: "thread-1", throughSequence: 4 }],
      claimRefs: [{ claimId: "requirements", revision: 2 }],
    };

    expect(parseNodeContext(JSON.parse(JSON.stringify(context)))).toEqual(context);
  });

  it("requires content-addressed predecessor artifacts", () => {
    expect(() => parseNodeContext({
      schemaVersion: "node-context.v1",
      stateRevision: 0,
      task: { prompt: "x" },
      predecessors: [{
        node: "discovery_plan",
        attemptId: "attempt-1",
        outputRef: { ...artifact, sha256: "not-a-digest" },
        evidenceRefs: [],
      }],
      conversationRefs: [],
      claimRefs: [],
    })).toThrow(/Invalid conversation contract/);
  });

  it("preserves addressed request/reply causality", () => {
    const message = {
      schemaVersion: "conversation-message.v1",
      messageId: "message-2",
      threadId: "thread-1",
      sequence: 2,
      kind: "answer",
      sender: { type: "node", id: "discovery_plan" },
      recipients: [{ type: "node", id: "implement" }],
      body: "The API must remain backwards compatible.",
      replyTo: "message-1",
      requestId: "request-1",
      stateRevision: 3,
      repositoryRevision: "abc123",
      artifactRefs: [artifact],
      createdAt: "2026-08-07T12:00:00.000Z",
    };

    expect(parseConversationMessage(message)).toEqual(message);
  });

  it("tracks immutable claim revisions and dependencies", () => {
    const claim = {
      schemaVersion: "claim-revision.v1",
      claimId: "api-compatibility",
      revision: 2,
      status: "accepted",
      author: { type: "node", id: "discovery_plan" },
      valueRef: artifact,
      dependsOn: [{ claimId: "requirements", revision: 1 }],
      createdAt: "2026-08-07T12:00:00.000Z",
    };

    expect(parseClaimRevision(claim)).toEqual(claim);
  });
});
