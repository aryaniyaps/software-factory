import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface ApiStore {
  createTask(input: { repository: string; title: string; description: string; dependencies?: string[] }): Promise<string>;
  getRun(id: string): Promise<unknown>;
  getEvents?(id: string): Promise<unknown[]>;
  cancelRun(id: string): Promise<void>;
  retryNode(id: string): Promise<void>;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error("invalid JSON"); }
}

export function createApiServer(store: ApiStore): Server {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://factory.local");
      const parts = url.pathname.split("/").filter(Boolean);
      if (request.method === "POST" && parts[0] === "tasks" && parts.length === 1) {
        const input = await body(request) as Partial<{ repository: string; title: string; description: string; dependencies: string[] }>;
        if (!input.repository || !input.title || !input.description) return json(response, 422, { error: "repository, title, and description are required" });
        const id = await store.createTask(input as { repository: string; title: string; description: string; dependencies?: string[] });
        return json(response, 201, { id });
      }
      if (request.method === "GET" && parts[0] === "runs" && parts[1] && parts.length === 2) {
        const run = await store.getRun(parts[1]);
        return run ? json(response, 200, run) : json(response, 404, { error: "run not found" });
      }
      if (request.method === "GET" && parts[0] === "runs" && parts[1] && parts[2] === "events") {
        const events = await store.getEvents?.(parts[1]);
        return json(response, 200, events ?? []);
      }
      if (request.method === "POST" && parts[0] === "runs" && parts[1] && parts[2] === "cancel") {
        await store.cancelRun(parts[1]);
        return json(response, 200, { status: "cancelled" });
      }
      if (request.method === "POST" && parts[0] === "nodes" && parts[1] && parts[2] === "retry") {
        await store.retryNode(parts[1]);
        return json(response, 200, { status: "retrying" });
      }
      return json(response, 404, { error: "not found" });
    } catch (error) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}
