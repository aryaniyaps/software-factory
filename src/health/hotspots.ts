export const NON_PRODUCTION_PATH_SEGMENTS = [
  "node_modules/",
  "dist/",
  "build/",
  ".git/",
  "vendor/",
  "/generated/",
  "generated/",
  "coverage/",
  ".next/",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const;

export interface ChurnEntry {
  readonly file: string;
  readonly commits: number;
  readonly churn: number;
}

export interface CommitFileChanges {
  readonly commitId: string;
  readonly files: readonly string[];
}

export interface CoChangePair {
  readonly files: readonly [string, string];
  readonly coChangeCount: number;
}

export interface Hotspot {
  readonly file: string;
  readonly churn: number;
  readonly commits: number;
  readonly score: number;
  readonly rank: number;
}

export function isProductionPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return !NON_PRODUCTION_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

export function parseChurnEntries(stdout: string): ChurnEntry[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [file, commits, churn] = line.split("\t");
      return {
        file: file ?? "",
        commits: Number(commits ?? 0),
        churn: Number(churn ?? 0),
      };
    })
    .filter((entry) => entry.file.length > 0);
}

function hotspotScore(entry: ChurnEntry): number {
  return entry.churn + entry.commits * 5;
}

export function computeHotspots(entries: readonly ChurnEntry[], limit?: number): Hotspot[] {
  const production = entries
    .filter((entry) => isProductionPath(entry.file))
    .map((entry) => ({ entry, score: hotspotScore(entry) }))
    .sort((left, right) => right.score - left.score || left.entry.file.localeCompare(right.entry.file));

  const capped = limit === undefined ? production : production.slice(0, limit);
  return capped.map(({ entry, score }, index) => ({
    file: entry.file,
    churn: entry.churn,
    commits: entry.commits,
    score,
    rank: index + 1,
  }));
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function computeCoChangePairs(commits: readonly CommitFileChanges[]): CoChangePair[] {
  const counts = new Map<string, { files: [string, string]; coChangeCount: number }>();

  for (const commit of commits) {
    const files = [...new Set(commit.files.filter(isProductionPath))].sort();
    for (let index = 0; index < files.length; index += 1) {
      for (let other = index + 1; other < files.length; other += 1) {
        const left = files[index]!;
        const right = files[other]!;
        const key = pairKey(left, right);
        const existing = counts.get(key);
        if (existing) {
          existing.coChangeCount += 1;
        } else {
          counts.set(key, { files: [left, right], coChangeCount: 1 });
        }
      }
    }
  }

  return [...counts.values()].sort((left, right) => right.coChangeCount - left.coChangeCount);
}
