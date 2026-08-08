import type {
  CreateExecutionInput,
  CreateExecutionResponse,
  FactoryExecutionView,
  GitHubRepositoriesResponse,
  GitHubStatus,
} from "../types";

const API_BASE = "/api";

function authHeaders(): HeadersInit {
  const token = import.meta.env.VITE_FACTORY_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Factory API unreachable. Start the API (`npm run dev`) and retry.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "" }));
    throw new Error(typeof body.error === "string" && body.error
      ? body.error
      : `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function createExecution(input: CreateExecutionInput): Promise<CreateExecutionResponse> {
  return request<CreateExecutionResponse>("/executions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listExecutions(): Promise<FactoryExecutionView[]> {
  return request<FactoryExecutionView[]>("/executions");
}

export function getExecution(workflowId: string): Promise<FactoryExecutionView> {
  return request<FactoryExecutionView>(`/executions/${encodeURIComponent(workflowId)}`);
}

export function commandExecution(workflowId: string, command: unknown): Promise<unknown> {
  return request(`/executions/${encodeURIComponent(workflowId)}/commands`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export function getGitHubStatus(): Promise<GitHubStatus> {
  return request<GitHubStatus>("/integrations/github/status");
}

export function githubInstallUrl(): string {
  return `${API_BASE}/integrations/github/install`;
}

export function listGitHubRepos(search = "", page = 1): Promise<GitHubRepositoriesResponse> {
  const params = new URLSearchParams({ page: String(page), perPage: "50" });
  if (search.trim()) params.set("search", search.trim());
  return request<GitHubRepositoriesResponse>(`/integrations/github/repos?${params.toString()}`);
}
