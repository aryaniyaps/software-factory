import { createFitnessAdapters } from "./adapters/index.js";
import { defaultFitnessPolicyPath, loadFitnessPolicy } from "./policy.js";
import { ProcessRunner } from "./process-runner.js";
import {
  type FitnessAdapter,
  type FitnessCapability,
  type FitnessFinding,
  type FitnessInput,
  type FitnessPolicy,
  type FitnessRawSubScore,
  type FitnessRunResult,
} from "./types.js";

export interface FitnessRunnerOptions {
  readonly policy?: FitnessPolicy;
  readonly policyPath?: string;
  readonly runner?: ProcessRunner;
  readonly adapters?: readonly FitnessAdapter[];
}

function deriveRawSubScores(findings: readonly FitnessFinding[]): FitnessRawSubScore[] {
  return findings
    .filter((finding) => finding.baseline !== undefined || finding.candidate !== undefined)
    .map((finding) => ({
      adapterId: finding.adapterId,
      metric: finding.ruleId,
      baseline: finding.baseline,
      candidate: finding.candidate,
      delta: finding.delta,
      raw: {
        explanation: finding.explanation,
        locations: finding.locations,
      },
    }));
}

function applyShadowMode(
  findings: readonly FitnessFinding[],
  policy: FitnessPolicy,
): FitnessFinding[] {
  if (!policy.shadowMode.enabled) return [...findings];
  return findings.map((finding) => {
    if (policy.shadowRuleIds.includes(finding.ruleId) || finding.shadowOnly) {
      return {
        ...finding,
        severity: finding.severity === "block" ? "warn" : finding.severity,
        shadowOnly: true,
      };
    }
    return finding;
  });
}

function hasBlockingFinding(findings: readonly FitnessFinding[], policy: FitnessPolicy): boolean {
  return findings.some((finding) =>
    finding.severity === "block" && policy.hardRuleIds.includes(finding.ruleId));
}

export class FitnessRunner {
  private readonly policy: FitnessPolicy;
  private readonly adapters: readonly FitnessAdapter[];
  private readonly processRunner: ProcessRunner;

  constructor(options: FitnessRunnerOptions = {}) {
    this.processRunner = options.runner ?? new ProcessRunner();
    this.policy = options.policy ?? { schemaVersion: "fitness-policy.v1", policyVersion: "inline" } as FitnessPolicy;
    if (options.adapters) {
      this.adapters = options.adapters;
    } else if (options.policy) {
      this.adapters = createFitnessAdapters(
        options.policy.adapters,
        this.processRunner,
        options.policy.execution,
      );
    } else {
      this.adapters = [];
    }
  }

  static async create(options: Omit<FitnessRunnerOptions, "policy"> & { policyPath?: string } = {}) {
    const policyPath = options.policyPath ?? defaultFitnessPolicyPath();
    const policy = await loadFitnessPolicy(policyPath);
    const processRunner = options.runner ?? new ProcessRunner();
    const adapters = options.adapters ?? createFitnessAdapters(
      policy.adapters,
      processRunner,
      policy.execution,
    );
    return new FitnessRunner({ ...options, policy, runner: processRunner, adapters });
  }

  getPolicy(): FitnessPolicy {
    return this.policy;
  }

  async run(input: FitnessInput): Promise<FitnessRunResult> {
    const findings: FitnessFinding[] = [];
    const missingCapabilities: FitnessCapability[] = [];
    const adaptersByCapability = new Map<FitnessCapability, FitnessAdapter>();

    for (const adapter of this.adapters) {
      adaptersByCapability.set(adapter.capability, adapter);
    }

    for (const capability of this.policy.requiredCapabilities) {
      const adapter = adaptersByCapability.get(capability);
      if (!adapter) {
        missingCapabilities.push(capability);
        continue;
      }
      const supported = await adapter.supports(input.context);
      if (!supported) {
        missingCapabilities.push(capability);
        continue;
      }
      const adapterFindings = await adapter.measure(input);
      findings.push(...adapterFindings);
    }

    const adjustedFindings = applyShadowMode(findings, this.policy);
    const rawSubScores = deriveRawSubScores(adjustedFindings);

    if (missingCapabilities.length > 0) {
      return {
        outcome: "insufficient_evidence",
        policyVersion: this.policy.policyVersion,
        shadowMode: this.policy.shadowMode.enabled,
        findings: adjustedFindings,
        rawSubScores,
        missingCapabilities,
      };
    }

    if (hasBlockingFinding(adjustedFindings, this.policy)) {
      return {
        outcome: "policy_block",
        policyVersion: this.policy.policyVersion,
        shadowMode: this.policy.shadowMode.enabled,
        findings: adjustedFindings,
        rawSubScores,
        missingCapabilities,
      };
    }

    return {
      outcome: "pass",
      policyVersion: this.policy.policyVersion,
      shadowMode: this.policy.shadowMode.enabled,
      findings: adjustedFindings,
      rawSubScores,
      missingCapabilities,
    };
  }
}

export async function runFitnessAssessment(
  input: FitnessInput,
  options: FitnessRunnerOptions = {},
): Promise<FitnessRunResult> {
  const runner = options.policy || options.adapters
    ? new FitnessRunner(options)
    : await FitnessRunner.create(options);
  return runner.run(input);
}
