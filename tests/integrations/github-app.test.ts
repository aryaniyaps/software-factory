import { describe, expect, it } from "vitest";
import {
  createGitHubAppService,
  loadGitHubAppConfig,
  repositoryFullNameFromCloneUrl,
} from "../../src/integrations/github-app.js";

describe("github app integration", () => {
  it("loads config when required env vars are present", async () => {
    const config = await loadGitHubAppConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_SLUG: "software-factory",
      GITHUB_APP_WEBHOOK_SECRET: "secret",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      GITHUB_APP_INSTALLATION_ID: "456",
    });
    expect(config).toMatchObject({
      appId: "123",
      slug: "software-factory",
      bootstrapInstallationId: 456,
    });
  });

  it("parses repository full names from clone URLs", () => {
    expect(repositoryFullNameFromCloneUrl("https://github.com/acme/app.git")).toBe("acme/app");
  });

  it("reports disconnected status when no installations are stored", async () => {
    const store = {
      upsert: async () => {},
      remove: async () => {},
      listActive: async () => [],
    };
    const service = createGitHubAppService({
      appId: "1",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      webhookSecret: "secret",
      slug: "software-factory",
    }, store);
    expect(await service.getStatus()).toMatchObject({
      configured: true,
      connected: false,
      installations: [],
    });
    expect(service.getInstallUrl()).toBe("https://github.com/apps/software-factory/installations/new");
  });

  it("upserts installations from webhook payloads", async () => {
    const rows: Array<{ installationId: number; accountLogin: string; accountType: string; suspendedAt: Date | null }> = [];
    const store = {
      async upsert(input: { installationId: number; accountLogin: string; accountType: string; suspendedAt: Date | null }) {
        rows.push(input);
      },
      async remove(installationId: number) {
        const index = rows.findIndex((row) => row.installationId === installationId);
        if (index >= 0) rows.splice(index, 1);
      },
      async listActive() {
        return rows.filter((row) => row.suspendedAt == null).map((row) => ({
          ...row,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      },
    };
    const service = createGitHubAppService({
      appId: "1",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      webhookSecret: "secret",
      slug: "software-factory",
    }, store);
    await service.handleWebhookEvent("installation", {
      action: "created",
      installation: {
        id: 99,
        suspended_at: null,
        account: { login: "acme", type: "Organization" },
      },
    });
    expect(await service.getStatus()).toMatchObject({
      connected: true,
      installations: [{ installationId: 99, accountLogin: "acme" }],
    });
  });
});
