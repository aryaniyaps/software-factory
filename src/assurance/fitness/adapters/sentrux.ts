import {
  createFinding,
  supportsTypeScript,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, rawSubScore, runAdapterCommand } from "./base.js";

interface SentruxGateResult {
  pass?: boolean;
  quality_signal?: number;
  signal_before?: number;
  signal_after?: number;
  summary?: string;
  dimensions?: Record<string, number>;
  bottleneck?: string;
}

function parseSentrux(parsed: unknown): SentruxGateResult {
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as SentruxGateResult;
}

export function createSentruxAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "sentrux",
    version: "1.0.0",
    capability: "modularity_graph",
    async supports(context: RepositoryContext): Promise<boolean> {
      if (!supportsTypeScript(context)) return false;
      return options.runner.isAvailable(options.command.command, ["--version"]);
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const baselineResult = input.baselineRoot
        ? await runAdapterCommand(options, input.baselineRoot)
        : undefined;
      const candidateResult = await runAdapterCommand(options, input.candidateRoot);
      const baselineGate = parseSentrux(baselineResult?.parsed);
      const candidateGate = parseSentrux(candidateResult.parsed);

      const baselineSignal = baselineGate.signal_after ?? baselineGate.quality_signal;
      const candidateSignal = candidateGate.signal_after ?? candidateGate.quality_signal;

      if (baselineSignal !== undefined && candidateSignal !== undefined) {
        const delta = candidateSignal - baselineSignal;
        findings.push(createFinding({
          adapterId: "sentrux",
          ruleId: "sentrux-aggregate",
          dimension: "modularity",
          severity: "warn",
          confidence: 0.8,
          baseline: baselineSignal,
          candidate: candidateSignal,
          delta,
          locations: [],
          evidenceRefs: evidenceRef(input.evidenceManifestId, "sentrux:aggregate"),
          explanation: `Sentrux aggregate quality signal changed by ${delta}`,
          shadowOnly: true,
        }));
      }

      const baselineDimensions = baselineGate.dimensions ?? {};
      const candidateDimensions = candidateGate.dimensions ?? {};
      for (const [dimension, candidateValue] of Object.entries(candidateDimensions)) {
        const baselineValue = baselineDimensions[dimension];
        if (baselineValue === undefined) continue;
        const delta = candidateValue - baselineValue;
        if (delta >= 0) continue;
        findings.push(createFinding({
          adapterId: "sentrux",
          ruleId: "sentrux-dimension",
          dimension: "modularity",
          severity: "warn",
          confidence: 0.7,
          baseline: baselineValue,
          candidate: candidateValue,
          delta,
          locations: [],
          evidenceRefs: evidenceRef(input.evidenceManifestId, `sentrux:${dimension}`),
          explanation: `Sentrux dimension ${dimension} regressed by ${Math.abs(delta)}`,
          shadowOnly: true,
        }));
      }

      rawSubScore("sentrux", "quality_signal", {
        baseline: baselineGate,
        candidate: candidateGate,
      }, baselineSignal, candidateSignal);

      if (candidateGate.bottleneck) {
        rawSubScore("sentrux", "bottleneck", candidateGate.bottleneck);
      }

      return findings;
    },
  };
}
