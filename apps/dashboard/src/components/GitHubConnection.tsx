import { useEffect, useState } from "react";
import * as api from "../api/client";
import type { GitHubStatus } from "../types";

interface GitHubConnectionProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function GitHubConnection({ onConnectionChange }: GitHubConnectionProps) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await api.getGitHubStatus();
        if (!cancelled) {
          setStatus(next);
          onConnectionChange?.(next.connected);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          onConnectionChange?.(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [onConnectionChange]);

  if (loading) {
    return <p className="github-connection github-connection--loading">Checking GitHub connection…</p>;
  }

  if (error) {
    return <p className="github-connection github-connection--error" role="alert">{error}</p>;
  }

  if (!status?.configured) {
    return (
      <p className="github-connection github-connection--muted">
        Configure the GitHub App on the factory server to enable repository selection.
      </p>
    );
  }

  if (!status.connected) {
    return (
      <div className="github-connection">
        <p className="github-connection__text">Connect GitHub to choose which repository the factory should work on.</p>
        <a className="btn btn-secondary" href={api.githubInstallUrl()}>
          Connect GitHub
        </a>
      </div>
    );
  }

  const accounts = status.installations.map((installation) => installation.accountLogin).join(", ");
  return (
    <div className="github-connection github-connection--connected">
      <span className="github-connection__badge">Connected</span>
      <span className="github-connection__text">{accounts}</span>
    </div>
  );
}
