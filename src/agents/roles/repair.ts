export const REPAIR_ROLE = "repair" as const;

export const REPAIR_MODES = ["diagnostic", "maintainability_refactor"] as const;
export type RepairMode = (typeof REPAIR_MODES)[number];

export const MAINTAINABILITY_REFACTOR_FORBIDDEN_ACTIONS = [
  "downgrade findings",
  "change gate policy",
  "modify acceptance criteria",
  "modify hidden scenarios",
  "modify hidden evaluators",
] as const;

export const repairRole = {
  id: REPAIR_ROLE,
  description: "Repair failing checks or apply bounded maintainability refactors within scoped findings.",
  modes: REPAIR_MODES,
  maintainabilityRefactor: {
    immutableInputs: [
      "acceptanceIds",
      "hiddenEvaluatorRefs",
      "gatePolicyVersion",
    ],
    scopeFields: [
      "allowedPaths",
      "affectedSymbols",
      "minimumRepairs",
      "findingIds",
    ],
    forbiddenActions: [...MAINTAINABILITY_REFACTOR_FORBIDDEN_ACTIONS],
    requiresBehaviorReplay: true,
  },
} as const;

export const maintainabilityRefactorPrompt = [
  "You are refactoring only to address validated maintainability findings.",
  "Touch only allowed paths and symbols in the provided repair scope.",
  "Do not downgrade findings, change gate policy, or modify acceptance criteria or hidden evaluators.",
  "Make small reversible steps and preserve behavior; behavior replay follows each batch.",
].join(" ");
