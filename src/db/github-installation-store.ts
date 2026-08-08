import { eq, isNull } from "drizzle-orm";
import type { Database } from "./database.js";
import { githubInstallations } from "./schema.js";

export interface GitHubInstallationRecord {
  installationId: number;
  accountLogin: string;
  accountType: string;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitHubInstallationStore {
  upsert(input: {
    installationId: number;
    accountLogin: string;
    accountType: string;
    suspendedAt: Date | null;
  }): Promise<void>;
  remove(installationId: number): Promise<void>;
  listActive(): Promise<GitHubInstallationRecord[]>;
}

export function createGitHubInstallationStore(db: Database): GitHubInstallationStore {
  return {
    async upsert(input) {
      await db.insert(githubInstallations).values({
        installationId: input.installationId,
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        suspendedAt: input.suspendedAt,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: githubInstallations.installationId,
        set: {
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          suspendedAt: input.suspendedAt,
          updatedAt: new Date(),
        },
      });
    },

    async remove(installationId) {
      await db.delete(githubInstallations).where(eq(githubInstallations.installationId, installationId));
    },

    async listActive() {
      const rows = await db.select().from(githubInstallations).where(isNull(githubInstallations.suspendedAt));
      return rows.map((row) => ({
        installationId: row.installationId,
        accountLogin: row.accountLogin,
        accountType: row.accountType,
        suspendedAt: row.suspendedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },
  };
}
