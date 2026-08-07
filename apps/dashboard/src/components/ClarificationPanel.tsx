import { useState, type FormEvent } from "react";
import type { ClarificationRequest } from "../types";

interface ClarificationPanelProps {
  request: ClarificationRequest;
  onAnswer: (answer: string) => Promise<void>;
}

export function ClarificationPanel({ request, onAnswer }: ClarificationPanelProps) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAnswer(answer.trim());
      setAnswer("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="clarification-panel" aria-labelledby="clarification-title">
      <div>
        <span className="status-badge status-input_required">Input required</span>
        <h2 id="clarification-title">{request.requestingNode} needs clarification</h2>
        <p>{request.question}</p>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <textarea
          aria-label="Clarification answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Provide the missing intent or constraint"
          disabled={submitting}
          required
        />
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={submitting || !answer.trim()}>
          {submitting ? "Sending…" : "Answer and resume"}
        </button>
      </form>
    </section>
  );
}
