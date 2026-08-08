import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../../src/api/server.js";
import type { GitHubAppService } from "../../src/integrations/github-app.js";

function githubService(overrides: Partial<GitHubAppService> = {}): GitHubAppService {
  return {
    isConfigured: () => true,
    getInstallUrl: () => "https://github.com/apps/software-factory/installations/new",
    async handleWebhookEvent() {},
    async getStatus() {
      return {
        configured: true,
        connected: true,
        installations: [{ installationId: 1, accountLogin: "acme", accountType: "Organization", suspended: false }],
      };
    },
    async listRepositories() {
      return {
        items: [{
          fullName: "acme/app",
          cloneUrl: "https://github.com/acme/app.git",
          private: false,
          defaultBranch: "main",
        }],
        hasMore: false,
      };
    },
    async installationTokenForRepo() { return "token"; },
    async validateRepositoryAccessible(fullName: string) { return fullName === "acme/app"; },
    async bootstrapFromEnv() {},
    ...overrides,
  };
}

describe("github integration routes", () => {
  it("returns github status and repository catalog", async () => {
    const app = createApiApp({
      store: {
        async createTask() { return "run-1"; },
        async getRun() { return null; },
        async cancelRun() {},
      },
      apiToken: "secret",
      github: githubService(),
      githubWebhookSecret: "whsec",
    });

    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("server did not bind"));
          return;
        }
        Promise.all([
          fetch(`http://127.0.0.1:${address.port}/integrations/github/status`, {
            headers: { authorization: "Bearer secret" },
          }),
          fetch(`http://127.0.0.1:${address.port}/integrations/github/repos`, {
            headers: { authorization: "Bearer secret" },
          }),
        ]).then(async ([statusResponse, reposResponse]) => {
          expect(statusResponse.status).toBe(200);
          expect(reposResponse.status).toBe(200);
          expect(await statusResponse.json()).toMatchObject({ connected: true });
          expect(await reposResponse.json()).toMatchObject({
            items: [{ fullName: "acme/app" }],
          });
          server.close((error) => error ? reject(error) : resolve());
        }).catch(reject);
      });
    });
  });

  it("accepts signed installation webhooks without API auth", async () => {
    const events: string[] = [];
    const app = createApiApp({
      store: {
        async createTask() { return "run-1"; },
        async getRun() { return null; },
        async cancelRun() {},
      },
      apiToken: "secret",
      github: githubService({
        async handleWebhookEvent(event) {
          events.push(event);
        },
      }),
      githubWebhookSecret: "whsec",
    });

    const body = JSON.stringify({
      action: "created",
      installation: {
        id: 1,
        suspended_at: null,
        account: { login: "acme", type: "Organization" },
      },
    });
    const signature = `sha256=${createHmac("sha256", "whsec").update(body).digest("hex")}`;

    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("server did not bind"));
          return;
        }
        fetch(`http://127.0.0.1:${address.port}/webhooks/github`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": signature,
            "x-github-event": "installation",
            "x-github-delivery": "delivery-1",
          },
          body,
        }).then(async (response) => {
          expect(response.status).toBe(202);
          expect(events).toEqual(["installation"]);
          server.close((error) => error ? reject(error) : resolve());
        }).catch(reject);
      });
    });
  });

  it("rejects task creation without repository", async () => {
    const app = createApiApp({
      store: {
        async createTask() { return "run-1"; },
        async getRun() { return null; },
        async cancelRun() {},
      },
      apiToken: "secret",
      github: githubService(),
      githubWebhookSecret: "whsec",
    });

    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("server did not bind"));
          return;
        }
        fetch(`http://127.0.0.1:${address.port}/tasks`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer secret",
          },
          body: JSON.stringify({ prompt: "Build it" }),
        }).then(async (response) => {
          expect(response.status).toBe(422);
          const payload = await response.json() as { error: string };
          expect(payload.error).toMatch(/repository is required/i);
          server.close((error) => error ? reject(error) : resolve());
        }).catch(reject);
      });
    });
  });
});
