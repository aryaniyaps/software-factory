import {
  graphNodeKindForId,
  type ChangeTraceInput,
  type CoverageFinding,
  type ProductGraph,
} from "../contracts/product-graph.js";

export function analyzeCoverage(
  graph: ProductGraph,
  input: ChangeTraceInput = {
    changedFiles: [],
    changedSymbols: [],
    changedTests: [],
    telemetryKeys: [],
  },
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const scenarioEvidence = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    if (node.kind !== "scn") continue;
    for (const ref of node.refs) {
      if (graphNodeKindForId(ref) !== "ac") continue;
      const evidence = scenarioEvidence.get(ref) ?? new Set<string>();
      evidence.add(node.id);
      scenarioEvidence.set(ref, evidence);
    }
  }

  for (const node of graph.nodes) {
    if (node.kind !== "ac") continue;
    if ((scenarioEvidence.get(node.id)?.size ?? 0) === 0) {
      findings.push({
        code: "uncovered_acceptance",
        message: `Acceptance criterion '${node.id}' has no scenario evidence`,
        nodeId: node.id,
        path: node.path,
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind !== "req") continue;
    const acceptanceRefs = node.refs.filter((ref) => graphNodeKindForId(ref) === "ac");
    if (acceptanceRefs.length === 0) {
      findings.push({
        code: "missing_requirement_trace",
        message: `Requirement '${node.id}' has no acceptance criteria`,
        nodeId: node.id,
        path: node.path,
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind !== "inv") continue;
    const requirementRefs = node.refs.filter((ref) => graphNodeKindForId(ref) === "req");
    if (requirementRefs.length === 0) {
      findings.push({
        code: "stale_blueprint_link",
        message: `Blueprint '${node.id}' is not linked to any requirement`,
        nodeId: node.id,
        path: node.path,
      });
      continue;
    }
    for (const requirementId of requirementRefs) {
      if (!nodesById.has(requirementId)) {
        findings.push({
          code: "stale_blueprint_link",
          message: `Blueprint '${node.id}' references missing requirement '${requirementId}'`,
          nodeId: node.id,
          path: node.path,
        });
      }
    }
  }

  if (input.repairFinding) return findings.sort(compareFindings);

  const tracedPatterns = graph.nodes
    .filter((node) => node.kind === "inv" || node.kind === "req")
    .flatMap((node) => node.traces);

  const productionChanges = [
    ...input.changedFiles,
    ...input.changedSymbols,
    ...input.telemetryKeys,
  ].filter((entry) => isConsequentialProductionPath(entry));

  for (const changedPath of productionChanges) {
    if (tracedPatterns.some((pattern) => matchesTrace(pattern, changedPath))) continue;
    findings.push({
      code: "untraced_change",
      message: `Change '${changedPath}' is not traced to a requirement or invariant`,
      path: changedPath,
    });
  }

  return findings.sort(compareFindings);
}

export function mapChangesToNodes(graph: ProductGraph, input: ChangeTraceInput): Map<string, string[]> {
  const matches = new Map<string, string[]>();
  const candidates = [
    ...input.changedFiles.map((value) => ({ kind: "file" as const, value })),
    ...input.changedSymbols.map((value) => ({ kind: "symbol" as const, value })),
    ...input.changedTests.map((value) => ({ kind: "test" as const, value })),
    ...input.telemetryKeys.map((value) => ({ kind: "telemetry" as const, value })),
  ];

  for (const node of graph.nodes) {
    if (node.traces.length === 0) continue;
    const linked: string[] = [];
    for (const candidate of candidates) {
      if (node.traces.some((pattern) => matchesTrace(pattern, candidate.value))) {
        linked.push(`${candidate.kind}:${candidate.value}`);
      }
    }
    if (linked.length > 0) matches.set(node.id, linked.sort());
  }

  return matches;
}

function matchesTrace(pattern: string, value: string): boolean {
  if (pattern === value) return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return value === prefix || value.startsWith(`${prefix}/`);
  }
  if (pattern.includes("*")) {
    const regex = new RegExp(`^${pattern.replaceAll("/", "\\/").replaceAll("*", ".*")}$`);
    return regex.test(value);
  }
  return value.startsWith(pattern);
}

function isTestOnlyPath(value: string): boolean {
  return value.startsWith("tests/") || value.includes(".test.") || value.includes("/fixtures/");
}

function isConsequentialProductionPath(value: string): boolean {
  if (value.startsWith("src/")) return !isTestOnlyPath(value);
  if (value.startsWith("packages/") && value.includes("/src/")) return !isTestOnlyPath(value);
  return false;
}

function compareFindings(left: CoverageFinding, right: CoverageFinding): number {
  return left.code.localeCompare(right.code)
    || (left.nodeId ?? "").localeCompare(right.nodeId ?? "")
    || (left.path ?? "").localeCompare(right.path ?? "");
}
