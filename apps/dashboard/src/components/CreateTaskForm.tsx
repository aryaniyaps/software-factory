import { useState, type FormEvent } from "react";
import { GitHubConnection } from "./GitHubConnection";
import { RepositoryPicker } from "./RepositoryPicker";

interface CreateTaskFormProps {
  onSubmit: (input: { repository: string; prompt: string }) => Promise<void>;
}

export function CreateTaskForm({ onSubmit }: CreateTaskFormProps) {
  const [repository, setRepository] = useState("");
  const [prompt, setPrompt] = useState("");
  const [connected, setConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!repository) {
      setError("Select a repository before starting a factory run.");
      return;
    }
    if (!prompt.trim()) {
      setError("Describe the task to start a factory run.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ repository, prompt: prompt.trim() });
      setPrompt("");
      setRepository("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="create-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <GitHubConnection onConnectionChange={setConnected} />
      <RepositoryPicker
        value={repository}
        onChange={setRepository}
        disabled={submitting}
        connected={connected}
      />
      <label>
        Task
        <textarea
          name="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the feature, constraints, and desired outcome. Title and acceptance context are inferred."
          disabled={submitting}
          required
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting || !connected || !repository}
      >
        {submitting ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}
