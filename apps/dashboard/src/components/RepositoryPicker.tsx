import { useEffect, useMemo, useState } from "react";
import * as api from "../api/client";
import type { GitHubRepository } from "../types";

interface RepositoryPickerProps {
  value: string;
  onChange: (repository: string) => void;
  disabled?: boolean;
  connected: boolean;
}

export function RepositoryPicker({ value, onChange, disabled = false, connected }: RepositoryPickerProps) {
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<GitHubRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) {
      setRepos([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const result = await api.listGitHubRepos(search);
          if (!cancelled) setRepos(result.items);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [connected, search]);

  const selectedLabel = useMemo(
    () => repos.find((repo) => repo.fullName === value)?.fullName ?? value,
    [repos, value],
  );

  return (
    <div className="repository-picker">
      <label>
        Repository
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={connected ? "Search connected repositories" : "Connect GitHub first"}
          disabled={disabled || !connected}
        />
      </label>
      <label>
        Selected repository
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || !connected || loading}
          required
        >
          <option value="">Select a repository…</option>
          {value && !repos.some((repo) => repo.fullName === value) ? (
            <option value={value}>{selectedLabel}</option>
          ) : null}
          {repos.map((repo) => (
            <option key={repo.fullName} value={repo.fullName}>
              {repo.fullName}{repo.private ? " (private)" : ""}
            </option>
          ))}
        </select>
      </label>
      {loading && <p className="repository-picker__hint">Loading repositories…</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
