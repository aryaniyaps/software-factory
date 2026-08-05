import { createServer, type Server } from "node:http";
import type { ExecOptions, ExecResult, WorkspaceSpec } from "../../../src/workspaces/provider.js";

export interface SandboxBackend {
  create(spec: WorkspaceSpec): Promise<{ id: string }>;
  exec(id: string, command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  destroy(id: string): Promise<void>;
}

async function requestBody(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function createSandboxServer(backend: SandboxBackend): Server {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://sandbox.local");
      const parts = url.pathname.split("/").filter(Boolean);
      response.setHeader("content-type", "application/json");
      if (request.method === "POST" && parts[0] === "workspaces" && parts.length === 1) {
        const result = await backend.create(await requestBody(request) as WorkspaceSpec);
        response.writeHead(201).end(JSON.stringify(result));
        return;
      }
      if (request.method === "POST" && parts[0] === "workspaces" && parts[2] === "exec") {
        const input = await requestBody(request) as { command: string; args?: string[]; options?: ExecOptions };
        const result = await backend.exec(decodeURIComponent(parts[1]), input.command, input.args ?? [], input.options);
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      if (request.method === "DELETE" && parts[0] === "workspaces" && parts[1]) {
        await backend.destroy(decodeURIComponent(parts[1]));
        response.writeHead(204).end();
        return;
      }
      response.writeHead(404).end(JSON.stringify({ error: "not found" }));
    } catch (error) {
      response.writeHead(400).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
}
