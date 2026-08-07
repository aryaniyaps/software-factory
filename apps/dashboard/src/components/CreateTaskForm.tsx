import { useState, type FormEvent } from "react";

interface CreateTaskFormProps {
  onSubmit: (input: { prompt: string }) => Promise<void>;
}

export function CreateTaskForm({ onSubmit }: CreateTaskFormProps) {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) {
      setError("Describe the task to start a factory run.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ prompt: prompt.trim() });
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="create-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <label>
        Task
        <textarea
          name="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the feature, constraints, and desired outcome. Title, repository, and acceptance criteria are inferred."
          disabled={submitting}
          required
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}
