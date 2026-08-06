export const MAINTAINABILITY_CRITIC_ROLE = "maintainability_critic" as const;

export const CRITIC_READONLY_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "context7",
] as const;

export const CRITIC_FORBIDDEN_TOOLS = [
  "bash",
  "edit",
  "write",
  "web_search",
] as const;

export const maintainabilityCriticRole = {
  id: MAINTAINABILITY_CRITIC_ROLE,
  description: "Read-only semantic architecture critic evaluating maintainability smells and invariants.",
  immutableInputs: [
    "workOrderId",
    "acceptanceIds",
    "blueprintRefs",
    "fitnessFindingRefs",
    "diffRefs",
    "graphRefs",
    "behavioralEvidenceRefs",
  ],
  forbiddenInputs: [
    "implementerSummary",
    "implementerReasoning",
    "implementerNarrative",
    "implementerRationale",
    "persuasiveNarrative",
  ],
  outputSchema: "critic-report.v1",
} as const;

