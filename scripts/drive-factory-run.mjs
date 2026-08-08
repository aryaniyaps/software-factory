#!/usr/bin/env node
/**
 * Keep factory API + Temporal worker alive and drive a run to completion.
 * Never kills a healthy worker mid-activity (that causes heartbeat timeouts).
 */
import { spawn, execSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Client } from "@temporalio/client";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.SF_API ?? "http://127.0.0.1:8787";
const TOKEN = process.env.FACTORY_API_TOKEN ?? "change-me";
const POLL_MS = Number(process.env.SF_POLL_MS ?? 30_000);

const DEFAULT_ANSWER = [
  "Use the Open Library Search API at https://openlibrary.org/search.json with query parameter q=isbn:<partial-isbn>.",
  "No authentication is required.",
  "Expose GraphQL query searchBooksByIsbn(isbn: String!, limit: Int = 10): [BookSuggestion!]! returning isbn, title, and authors.",
  "Suggestions are transient external results and must not be persisted to PostgreSQL.",
  "Use request context deadlines/timeouts and return typed errors for provider failures.",
].join(" ");

let apiChild = null;
let workerChild = null;

function log(...args) {
  console.log(`[drive]`, new Date().toISOString(), ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnManaged(name, args, logFile) {
  const out = createWriteStream(logFile, { flags: "a" });
  const child = spawn("npx", args, {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on("exit", (code, signal) => {
    log(`${name} exited code=${code} signal=${signal}`);
    if (name === "api") apiChild = null;
    if (name === "worker") workerChild = null;
  });
  return child;
}

function processAlive(pattern) {
  try {
    execSync(`pgrep -f '${pattern}' >/dev/null`);
    return true;
  } catch {
    return false;
  }
}

async function ensureApi() {
  try {
    const res = await fetch(`${API}/runs/00000000-0000-0000-0000-000000000000`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    if (res.status === 404 || res.ok) return;
  } catch {
    // down
  }
  if (apiChild?.exitCode === null) return;
  if (processAlive("tsx src/server.ts")) return;
  log("starting API");
  apiChild = spawnManaged("api", ["tsx", "src/server.ts"], "/tmp/sf-api.log");
  await sleep(8000);
}

async function ensureWorker() {
  if (workerChild?.exitCode === null) return;
  if (processAlive("worker-entry.ts")) return;
  log("starting worker");
  workerChild = spawnManaged("worker", ["tsx", "src/temporal/worker-entry.ts"], "/tmp/sf-worker.log");
  await sleep(25000);
}

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${path}: ${body.error ?? response.statusText}`);
  return body;
}

async function answerClarification(runId, request) {
  log(`answering clarification ${request.requestId}`);
  await api(`/factory/runs/${runId}/clarifications/${request.requestId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer: DEFAULT_ANSWER, stateRevision: request.stateRevision }),
  });
}

async function createRetry(runId, reason) {
  const run = await api(`/runs/${runId}`);
  const created = (run.events ?? []).find((e) => e.type === "task.created");
  const result = await api("/tasks", {
    method: "POST",
    body: JSON.stringify({
      repository: created?.payload?.repository ?? "https://github.com/aryaniyaps/go-book-store.git",
      title: `${(created?.payload?.title ?? "ISBN autocomplete").replace(/ \(retry\)/g, "")} (retry)`,
      description: `${created?.payload?.description ?? ""}\n\nPrevious run ${runId} failed: ${reason}. Continue with Open Library API integration.`,
    }),
  });
  log(`started retry ${result.id}`);
  return result.id;
}

async function main() {
  await ensureApi();
  await ensureWorker();

  let runId = process.env.SF_RUN_ID;
  if (!runId) {
    const created = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({
        repository: "https://github.com/aryaniyaps/go-book-store.git",
        title: "ISBN Open Library autocomplete",
        description:
          "Use Open Library Search API https://openlibrary.org/search.json. GraphQL searchBooksByIsbn(isbn: String!, limit: Int = 10) returning isbn, title, authors. No auth. Transient suggestions only.",
      }),
    });
    runId = created.id;
    log(`created run ${runId}`);
  }

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? "default" });

  for (;;) {
    await ensureApi();
    await ensureWorker();

    try {
      const handle = client.workflow.getHandle(`factory-${runId}`);
      const description = await handle.describe();
      const status = description.status.name;

      if (status === "COMPLETED") {
        log(`SUCCESS ${runId}`);
        process.exit(0);
      }
      if (status === "FAILED" || status === "TERMINATED" || status === "CANCELLED") {
        let reason = status;
        try {
          const hist = await handle.fetchHistory();
          for (let i = hist.events.length - 1; i >= 0; i -= 1) {
            const fail = hist.events[i].workflowExecutionFailedEventAttributes;
            if (fail) {
              reason = fail.failure?.message ?? status;
              break;
            }
          }
        } catch {
          // ignore
        }
        log(`${runId} ${status}: ${reason}`);
        runId = await createRetry(runId, reason);
        await sleep(10_000);
        continue;
      }

      try {
        const state = await handle.query("factoryStatus");
        if (state?.status === "input_required" && state.pendingClarification) {
          await answerClarification(runId, state.pendingClarification);
        } else {
          log(`${runId} ${status} node=${state?.currentNode ?? "?"} hist=${description.historyLength}`);
        }
      } catch {
        log(`${runId} ${status} hist=${description.historyLength} (query unavailable)`);
      }
    } catch (error) {
      log("poll error", error instanceof Error ? error.message : error);
    }

    await sleep(POLL_MS);
  }
}

main().catch((error) => {
  console.error("[drive] fatal", error);
  process.exit(1);
});
