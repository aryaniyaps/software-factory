import type {
  CreateTaskInput,
  CreateTaskResponse,
  DeploymentList,
  EvidenceContentView,
  EvidenceItemView,
  FactoryRunSummary,
  GateDecisionView,
  GitHubRepositoriesResponse,
  GitHubStatus,
  OperationResponse,
  PageResult,
  ProbeRunView,
  RunEvent,
  RunGraph,
  ScenarioRunView,
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
    if (response.status === 502 || response.status === 503 || response.status === 504 || response.status >= 500) {
      throw new Error("Factory API unavailable. Start `npm run dev` on port 8787 and retry.");
    }
    const body = await response.json().catch(() => ({ error: "" }));
    const raw = typeof body.error === "string" ? body.error.trim() : "";
    const looksRawStatus = /^(internal server error|bad gateway|service unavailable|gateway timeout)$/i.test(raw);
    if (raw && raw.length < 200 && !looksRawStatus) {
      throw new Error(raw);
    }
    throw new Error(`Request failed (${response.status}). Check the factory API and retry.`);
  }

  return response.json() as Promise<T>;
}

export function createTask(input: CreateTaskInput): Promise<CreateTaskResponse> {
  return request<CreateTaskResponse>("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
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

export function listRuns(limit = 50): Promise<PageResult<FactoryRunSummary>> {
  return request<PageResult<FactoryRunSummary>>(`/factory/runs?limit=${limit}`);
}

export function getRun(runId: string): Promise<FactoryRunSummary> {
  return request<FactoryRunSummary>(`/factory/runs/${runId}`);
}

export function getRunGraph(runId: string): Promise<RunGraph> {
  return request<RunGraph>(`/factory/runs/${runId}/graph`);
}

export function getRunEvents(runId: string): Promise<RunEvent[]> {
  return request<RunEvent[]>(`/runs/${runId}/events`);
}

export function cancelRun(runId: string): Promise<OperationResponse> {
  return request<OperationResponse>(`/factory/runs/${runId}/cancel`, { method: "POST" });
}

export function rerunNode(runId: string, node: string): Promise<OperationResponse> {
  return request<OperationResponse>(`/factory/runs/${runId}/rerun`, {
    method: "POST",
    body: JSON.stringify({ node }),
  });
}

export function answerClarification(
  runId: string,
  requestId: string,
  answer: string,
  stateRevision: number,
): Promise<OperationResponse> {
  return request<OperationResponse>(
    `/factory/runs/${runId}/clarifications/${requestId}/answer`,
    {
      method: "POST",
      body: JSON.stringify({ answer, stateRevision }),
    },
  );
}

export function getRunGates(runId: string, limit = 100): Promise<PageResult<GateDecisionView>> {
  return request<PageResult<GateDecisionView>>(`/factory/runs/${runId}/gates?limit=${limit}`);
}

export function listEvidence(runId: string, limit = 100): Promise<PageResult<EvidenceItemView>> {
  return request<PageResult<EvidenceItemView>>(`/factory/runs/${runId}/evidence?limit=${limit}`);
}

export function getEvidenceContent(
  runId: string,
  itemId: string,
  expires: string,
  signature: string,
): Promise<EvidenceContentView> {
  const params = new URLSearchParams({ expires, signature });
  return request<EvidenceContentView>(
    `/factory/runs/${runId}/evidence/${itemId}/content?${params.toString()}`,
  );
}

/** Fetch evidence content using the API-signed URL from an evidence item view. */
export async function getEvidenceContentFromSignedUrl(signedUrl: string): Promise<EvidenceContentView> {
  const url = new URL(signedUrl, window.location.origin);
  const path = `/api${url.pathname}${url.search}`;
  let response: Response;
  try {
    response = await fetch(path, { headers: { ...authHeaders() } });
  } catch {
    throw new Error("Factory API unreachable. Start the API (`npm run dev`) and retry.");
  }
  if (!response.ok) {
    throw new Error(`Evidence content request failed (${response.status}).`);
  }
  return response.json() as Promise<EvidenceContentView>;
}

export function getRunScenarios(runId: string, limit = 100): Promise<PageResult<ScenarioRunView>> {
  return request<PageResult<ScenarioRunView>>(`/factory/runs/${runId}/scenarios?limit=${limit}`);
}

export function getRunProbes(runId: string, limit = 100): Promise<PageResult<ProbeRunView>> {
  return request<PageResult<ProbeRunView>>(`/factory/runs/${runId}/probes?limit=${limit}`);
}

export function getRunDeployments(runId: string): Promise<DeploymentList> {
  return request<DeploymentList>(`/factory/runs/${runId}/deployments`);
}
