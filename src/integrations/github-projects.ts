import type { FactoryTask, TaskProvider } from "../tasks/task-provider.js";
import { ProjectRegistry } from "../tasks/project-registry.js";

interface ProjectItem {
  id: string;
  content?: {
    __typename: "Issue" | "PullRequest" | "DraftIssue";
    title?: string;
    body?: string;
    repository?: { nameWithOwner: string };
  };
  fieldValues: Array<{ name: string; value: string }>;
}

interface GithubGraphqlClient {
  request(query: string, variables: Record<string, unknown>): Promise<unknown>;
}

export class GithubGraphqlClientImpl implements GithubGraphqlClient {
  constructor(private readonly token: string, private readonly endpoint = "https://api.github.com/graphql") {}

  async request(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`GitHub GraphQL failed: ${response.status}`);
    const body = await response.json() as { data?: unknown; errors?: Array<{ message: string }> };
    if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
    return body.data;
  }
}

export class GithubProjectProvider implements TaskProvider {
  private readonly items = new Map<string, FactoryTask>();

  constructor(
    private readonly client: GithubGraphqlClient,
    private readonly config: {
      projectId: string;
      fieldNames?: Partial<Record<"status" | "repository" | "baseBranch" | "workflow" | "deploymentProfile" | "sandboxProfile", string>>;
      readyStatus?: string;
      statusFieldId?: string;
      statusOptions?: Record<string, string>;
      registry: ProjectRegistry;
    },
  ) {}

  async listReady(): Promise<FactoryTask[]> {
    const data = await this.client.request(
      `query($projectId:ID!){ node(id:$projectId){ ... on ProjectV2 { items(first:100){ nodes { id content { __typename ... on Issue { title body repository { nameWithOwner } } ... on PullRequest { title body repository { nameWithOwner } } ... on DraftIssue { title body } } fieldValues(first:50){ nodes { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } } } } } } } } }`,
      { projectId: this.config.projectId },
    ) as { node?: { items?: { nodes: ProjectItem[] } } };
    const ready = (data.node?.items?.nodes ?? []).flatMap((item) => {
      try {
        const task = this.normalize(item);
        return task.workflow === "" || this.value(item, "status") !== (this.config.readyStatus ?? "Ready") ? [] : [task];
      } catch {
        return [];
      }
    });
    for (const task of ready) this.items.set(task.id, task);
    return ready;
  }

  async get(id: string): Promise<FactoryTask | null> {
    return this.items.get(id) ?? null;
  }

  async updateStatus(taskId: string, status: string, runId?: string): Promise<void> {
    const task = this.items.get(taskId);
    if (!task) throw new Error(`unknown GitHub Project item: ${taskId}`);
    const optionId = this.config.statusOptions?.[status];
    if (!this.config.statusFieldId || !optionId) throw new Error(`missing status option configuration: ${status}`);
    await this.client.request(
      `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){ updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){ projectV2Item { id } } }`,
      { projectId: this.config.projectId, itemId: task.projectItemId, fieldId: this.config.statusFieldId, optionId },
    );
    if (runId) this.items.set(task.id, task);
  }

  private normalize(item: ProjectItem): FactoryTask {
    const repository = item.content?.repository?.nameWithOwner ?? this.value(item, "repository");
    if (!repository) throw new Error("Repository field is required for draft issues");
    const taskBase = {
      id: `github-project:${this.config.projectId}:${item.id}`,
      projectId: this.config.projectId,
      projectItemId: item.id,
      title: item.content?.title ?? "",
      description: item.content?.body ?? "",
      workflow: this.value(item, "workflow") || "feature",
    };
    return this.config.registry.resolve(repository, taskBase);
  }

  private value(item: ProjectItem, key: keyof NonNullable<typeof this.config.fieldNames>): string {
    const fieldName = this.config.fieldNames?.[key] ?? key;
    return item.fieldValues.find((field) => field.name === fieldName)?.value ?? "";
  }
}
