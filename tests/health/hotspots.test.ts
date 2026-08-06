import { describe, expect, it } from "vitest";
import {
  computeCoChangePairs,
  computeHotspots,
  isProductionPath,
  parseChurnEntries,
} from "../../src/health/hotspots.js";
import {
  generateDebtWorkOrders,
  joinReleaseOutcomes,
  requiredCleanupGates,
} from "../../src/health/repository-health.js";

describe("hotspots", () => {
  it("excludes generated and vendor paths from production hotspots", () => {
    expect(isProductionPath("src/app.ts")).toBe(true);
    expect(isProductionPath("node_modules/lodash/index.js")).toBe(false);
    expect(isProductionPath("dist/bundle.js")).toBe(false);
    expect(isProductionPath("vendor/protobuf/wire.go")).toBe(false);
    expect(isProductionPath("src/generated/client.ts")).toBe(false);
    expect(isProductionPath(".next/server/app.js")).toBe(false);
  });

  it("parses git churn output into entries", () => {
    const entries = parseChurnEntries("src/app.ts\t12\t240\nnode_modules/x.js\t99\t9999");
    expect(entries).toEqual([
      { file: "src/app.ts", commits: 12, churn: 240 },
      { file: "node_modules/x.js", commits: 99, churn: 9999 },
    ]);
  });

  it("ranks production hotspots by churn score", () => {
    const hotspots = computeHotspots([
      { file: "src/stable.ts", commits: 2, churn: 10 },
      { file: "src/hot.ts", commits: 8, churn: 400 },
      { file: "node_modules/pkg/index.js", commits: 50, churn: 5000 },
      { file: "src/warm.ts", commits: 5, churn: 120 },
    ]);

    expect(hotspots.map((entry) => entry.file)).toEqual(["src/hot.ts", "src/warm.ts", "src/stable.ts"]);
    expect(hotspots[0]?.rank).toBe(1);
    expect(hotspots[0]?.score).toBeGreaterThan(hotspots[1]?.score ?? 0);
  });

  it("computes co-change pairs from commit file sets", () => {
    const pairs = computeCoChangePairs([
      { commitId: "c1", files: ["src/a.ts", "src/b.ts", "src/c.ts"] },
      { commitId: "c2", files: ["src/a.ts", "src/b.ts"] },
      { commitId: "c3", files: ["src/a.ts", "src/d.ts"] },
    ]);

    const ab = pairs.find((pair) => pair.files[0] === "src/a.ts" && pair.files[1] === "src/b.ts");
    expect(ab?.coChangeCount).toBe(2);
  });
});

describe("repository health outcomes", () => {
  it("joins releases to later maintenance outcomes", () => {
    const joins = joinReleaseOutcomes(
      [{ runId: "run-1", releasedAt: "2026-01-01T00:00:00.000Z", artifactDigest: "sha256:aaa" }],
      new Map([
        ["run-1", {
          leadTimeMs: 3_600_000,
          attemptCount: 2,
          incidents: 1,
          reverts: 0,
          repeatFindings: ["git-hotspot:src/hot.ts"],
          probeCostDelta: 0.2,
          hotspotDelta: 15,
        }],
      ]),
    );

    expect(joins).toHaveLength(1);
    expect(joins[0]?.outcome.incidents).toBe(1);
    expect(joins[0]?.outcome.repeatFindings).toContain("git-hotspot:src/hot.ts");
  });

  it("creates small targeted cleanup work orders for top hotspots", () => {
    const workOrders = generateDebtWorkOrders({
      hotspots: [
        { file: "src/hot.ts", churn: 400, commits: 8, score: 90, rank: 1 },
        { file: "src/warm.ts", churn: 120, commits: 5, score: 40, rank: 2 },
      ],
      joins: [],
      sequence: 1,
      maxOrders: 1,
    });

    expect(workOrders).toHaveLength(1);
    expect(workOrders[0]?.id).toBe("WO-RH-001");
    expect(workOrders[0]?.scope.files).toEqual(["src/hot.ts"]);
    expect(workOrders[0]?.requirements).toContain("REQ-REPO-HEALTH");
  });

  it("requires cleanup work orders to use normal behavioral and release gates", () => {
    const gates = requiredCleanupGates("T1");
    expect(gates).toContain("deterministic_checks");
    expect(gates).toContain("maintainability_assess");
    expect(gates).not.toContain("waive_behavioral_verify");
    expect(gates).not.toContain("skip_release");
  });
});
