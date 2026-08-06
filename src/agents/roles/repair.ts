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

