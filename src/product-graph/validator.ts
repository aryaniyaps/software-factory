import {
  graphNodeKindForId,
  isStableGraphId,
  type ProductGraph,
  type ValidationFinding,
} from "../contracts/product-graph.js";

export function validateProductGraph(graph: ProductGraph): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const nodesById = new Map<string, (typeof graph.nodes)[number]>();

  for (const node of graph.nodes) {
    if (!isStableGraphId(node.id)) {
      findings.push({
        code: "invalid_id_format",
        message: `Node id '${node.id}' does not match stable ${node.kind.toUpperCase()} format`,
        nodeId: node.id,
        path: node.path,
      });
    }

    const expectedKind = graphNodeKindForId(node.id);
    if (expectedKind !== undefined && expectedKind !== node.kind) {
      findings.push({
        code: "invalid_id_format",
        message: `Node id '${node.id}' kind '${node.kind}' does not match prefix '${expectedKind}'`,
        nodeId: node.id,
        path: node.path,
      });
    }

    const existing = nodesById.get(node.id);
    if (existing) {
      findings.push({
        code: "duplicate_id",
        message: `Duplicate node id '${node.id}' in ${node.path} and ${existing.path}`,
        nodeId: node.id,
        path: node.path,
      });
      continue;
    }
    nodesById.set(node.id, node);
  }

  for (const node of graph.nodes) {
    for (const ref of node.refs) {
      if (!nodesById.has(ref)) {
        findings.push({
          code: "dangling_ref",
          message: `Node '${node.id}' references missing id '${ref}'`,
          nodeId: node.id,
          path: node.path,
        });
      }
    }
  }

  return findings.sort(compareFindings);
}

function compareFindings(left: ValidationFinding, right: ValidationFinding): number {
  return left.code.localeCompare(right.code)
    || (left.nodeId ?? "").localeCompare(right.nodeId ?? "")
    || (left.path ?? "").localeCompare(right.path ?? "");
}
