import type { ObservationResult } from "./observation.js";

export const RELEASE_STATES = [
  "built",
  "provenance_verified",
  "preview",
  "release_verified",
  "canary",
  "observing",
  "promoted",
  "rolling_back",
  "rolled_back",
] as const;

export type ReleaseState = (typeof RELEASE_STATES)[number];

export type ReleaseEvent =
  | "provenance_passed"
  | "preview_deployed"
  | "release_verified"
  | "canary_deployed"
  | "observation_started"
  | "observation_failed"
  | "promotion_completed"
  | "rollback_completed";

const TRANSITIONS: Record<ReleaseState, Partial<Record<ReleaseEvent, ReleaseState>>> = {
  built: { provenance_passed: "provenance_verified" },
  provenance_verified: { preview_deployed: "preview" },
  preview: { release_verified: "release_verified" },
  release_verified: { canary_deployed: "canary" },
  canary: { observation_started: "observing", observation_failed: "rolling_back" },
  observing: { promotion_completed: "promoted", observation_failed: "rolling_back" },
  promoted: {},
  rolling_back: { rollback_completed: "rolled_back" },
  rolled_back: {},
};

export function isLegalTransition(state: ReleaseState, event: ReleaseEvent): boolean {
  return TRANSITIONS[state][event] !== undefined;
}

export function transition(state: ReleaseState, event: ReleaseEvent): ReleaseState | null {
  return TRANSITIONS[state][event] ?? null;
}

export function canPromote(state: ReleaseState, observation: ObservationResult): boolean {
  return state === "observing" && observation.decision === "pass";
}
