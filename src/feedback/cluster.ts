import type { FeedbackCluster, NormalizedFeedback } from "./types.js";

const STOP_WORDS = new Set(["on", "in", "the", "a", "an", "and", "or", "of", "for", "to", "is", "was"]);
const SYNONYMS: Record<string, string> = { prod: "production" };

export function normalizeTheme(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SYNONYMS[word] ?? word)
    .filter((word) => !STOP_WORDS.has(word))
    .slice(0, 4)
    .sort()
    .join(" ");
}

export function clusterFeedback(items: readonly NormalizedFeedback[]): FeedbackCluster[] {
  const clusters = new Map<string, FeedbackCluster>();

  for (const item of items) {
    const theme = normalizeTheme(item.summary);
    const existing = clusters.get(theme);
    if (existing) {
      clusters.set(theme, {
        ...existing,
        memberFeedbackIds: [...existing.memberFeedbackIds, item.feedbackId],
        verbatimEvidenceRefs: [...existing.verbatimEvidenceRefs, ...item.evidenceRefs],
      });
      continue;
    }

    clusters.set(theme, {
      clusterId: `cluster-${theme.replace(/\s+/g, "-")}`,
      theme,
      memberFeedbackIds: [item.feedbackId],
      verbatimEvidenceRefs: [...item.evidenceRefs],
    });
  }

  return [...clusters.values()];
}
