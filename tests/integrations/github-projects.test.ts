import { describe, expect, it } from "vitest";
import { GithubProjectProvider } from "../../src/integrations/github-projects.js";
import { ProjectRegistry } from "../../src/tasks/project-registry.js";

describe("GithubProjectProvider", () => {
  it("normalizes ready items from multiple repositories", async () => {
    const client = { request: async () => ({ node: { items: { nodes: [
      { id: "item-a", content: { __typename: "Issue", title: "A", body: "Do A", repository: { nameWithOwner: "org/a" } }, fieldValues: [{ name: "Status", value: "Ready" }, { name: "Workflow", value: "feature" }] },
      { id: "item-b", content: { __typename: "Issue", title: "B", body: "Do B", repository: { nameWithOwner: "org/b" } }, fieldValues: [{ name: "Status", value: "Ready" }] },
    ] } } }) };
    const provider = new GithubProjectProvider(client, { projectId: "project-1", fieldNames: { status: "Status", workflow: "Workflow" }, registry: new ProjectRegistry([
      { repository: "org/a", defaultBranch: "main", deploymentProfile: "a", sandboxProfile: "crabbox" },
      { repository: "org/b", defaultBranch: "trunk", deploymentProfile: "b", sandboxProfile: "crabbox" },
    ]) });
    await expect(provider.listReady()).resolves.toMatchObject([
      { repository: "org/a", baseBranch: "main" },
      { repository: "org/b", baseBranch: "trunk" },
    ]);
  });

  it("requires a repository field for draft issues", async () => {
    const client = { request: async () => ({ node: { items: { nodes: [{ id: "draft", content: { __typename: "DraftIssue", title: "Draft", body: "Do it" }, fieldValues: [{ name: "Status", value: "Ready" }] }] } } }) };
    const provider = new GithubProjectProvider(client, { projectId: "project-1", fieldNames: { status: "Status" }, registry: new ProjectRegistry([]) });
    await expect(provider.listReady()).resolves.toEqual([]);
  });
});
