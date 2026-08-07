import type {
  CreateTaskInput,
  CreateTaskResponse,
  FactoryRunSummary,
  OperationResponse,
  PageResult,
  RunEvent,
  RunGraph,
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
