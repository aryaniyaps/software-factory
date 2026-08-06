import type { FeedbackIngestInput } from "../ingest.js";

export interface GitHubIssueCommentEvent {
  action?: string;
  comment?: { id: number; body: string };
  issue?: { number: number; title: string };
}

export function parseGitHubFeedback(
  event: GitHubIssueCommentEvent,
  runId: string,
  deliveryId: string,
): FeedbackIngestInput | null {
  if (!event.comment?.body || !event.issue?.number) return null;
  const commentId = event.comment.id;
  const issueNumber = event.issue.number;
  return {
    source: "github",
    externalId: `issue-${issueNumber}-comment-${commentId}`,
    deliveryId,
    summary: event.issue.title ?? `GitHub issue #${issueNumber} feedback`,
    body: event.comment.body,
    runId,
    incidentId: `github-issue-${issueNumber}`,
  };
}
