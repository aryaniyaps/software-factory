import { describe, expect, it } from "vitest";
import {
  parseClarificationAnswer,
  parseClarificationRequest,
} from "../../src/contracts/clarification.js";

describe("clarification contracts", () => {
  it("addresses another node without using a transient session id", () => {
    const request = {
      schemaVersion: "clarification-request.v1",
      requestId: "question-1",
      runId: "run-1",
      threadId: "thread-1",
      requestingNode: "implement",
      recipient: { type: "node", id: "discovery_plan" },
      question: "Which compatibility guarantee controls this endpoint?",
      stateRevision: 4,
      repositoryRevision: "abc123",
      contextRefs: ["artifact-discovery"],
      createdAt: "2026-08-07T12:00:00.000Z",
      deadlineAt: "2026-08-07T12:15:00.000Z",
    };

    expect(parseClarificationRequest(request)).toEqual(request);
  });

  it("requires idempotent, correlated answers", () => {
    const answer = {
      schemaVersion: "clarification-answer.v1",
      requestId: "question-1",
      answerId: "answer-1",
      idempotencyKey: "question-1:answer-1",
      responder: { type: "node", id: "discovery_plan" },
      body: "Maintain backwards compatibility.",
      stateRevision: 4,
      createdAt: "2026-08-07T12:01:00.000Z",
    };

    expect(parseClarificationAnswer(answer)).toEqual(answer);
    expect(() => parseClarificationAnswer({ ...answer, idempotencyKey: "" })).toThrow(
      /Invalid clarification contract/,
    );
  });
});
