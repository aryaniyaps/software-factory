import { useState, type FormEvent } from "react";

interface CreateTaskFormProps {
  onSubmit: (input: { repository: string; title: string; description: string }) => Promise<void>;
}

export function CreateTaskForm({ onSubmit }: CreateTaskFormProps) {
  const [repository, setRepository] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!repository.trim() || !title.trim() || !description.trim()) {
      setError("Repository, title, and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        repository: repository.trim(),
        title: title.trim(),
        description: description.trim(),
      });
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="create-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <label>
        Repository
        <input
          type="url"
          name="repository"
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
          placeholder="https://github.com/org/repo.git"
          disabled={submitting}
          autoComplete="off"
          required
        />
      </label>
      <label>
        Title
        <input
          type="text"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add feature X"
          disabled={submitting}
          required
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Acceptance criteria and scope"
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
