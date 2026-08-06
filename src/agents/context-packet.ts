import type { AgentOutput } from "../contracts/nodes.js";
import { formatCompactedErrors, type CompactedError } from "./compact-error.js";
import { harnessForRole } from "./role-harness.js";

export interface ContextPacketInput {
  readonly role: string;
  readonly mode?: string;
  readonly payload: unknown;
  readonly memoryContext?: string;
  readonly predecessors?: readonly AgentOutput[];
  readonly errors?: readonly CompactedError[];
  readonly evidenceRefs?: readonly string[];
}

export function buildContextPacket(input: ContextPacketInput): string {
  const harness = harnessForRole(input.role);
  const taskJson = JSON.stringify(input.payload);
  const sections: string[] = [
    `<role_mission>${harness.mission}</role_mission>`,
    `<task>${truncate(taskJson, Math.floor(harness.contextBudgetChars * 0.45))}</task>`,
  ];
  if (input.predecessors?.length) {
    const body = input.predecessors.map((p) => JSON.stringify({
      role: p.role,
      status: p.status,
      summary: p.summary,
      evidenceRefs: p.evidenceRefs,
      data: p.data,
    })).join("\n");
    sections.push(`<predecessors>\n${truncate(body, Math.floor(harness.contextBudgetChars * 0.25))}\n</predecessors>`);
  }
  if (input.memoryContext?.trim()) {
    sections.push(`<memory>\n${truncate(input.memoryContext.trim(), Math.floor(harness.contextBudgetChars * 0.2))}\n</memory>`);
  }
  const errorText = formatCompactedErrors(input.errors ?? []);
  if (errorText) sections.push(`<errors>\n${errorText}\n</errors>`);
  if (input.evidenceRefs?.length) {
    sections.push(`<evidence_hints>${input.evidenceRefs.join(", ")}</evidence_hints>`);
  }
  if (input.mode) sections.push(`<mode>${input.mode}</mode>`);
  sections.push("Produce the final agent-output.v1 JSON envelope for this role.");
  return truncate(sections.join("\n\n"), harness.contextBudgetChars);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 20)}\n...[truncated]`;
}
