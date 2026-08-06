import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export interface AgtGatewayPolicy {
  readonly denyByDefault: boolean;
  readonly audit: boolean;
  readonly allowedServers: readonly string[];
  readonly allowedTools: Record<string, readonly string[]>;
}

export interface AgtInvocation {
  readonly role: string;
  readonly serverId: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
  readonly invoke: () => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
}

const DEFAULT_POLICY: AgtGatewayPolicy = {
  denyByDefault: true,
  audit: true,
  allowedServers: [],
  allowedTools: {},
};

export async function loadGatewayPolicy(path: string): Promise<AgtGatewayPolicy> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parseYaml(raw) as Partial<AgtGatewayPolicy>;
    return {
      denyByDefault: parsed.denyByDefault ?? true,
      audit: parsed.audit ?? true,
      allowedServers: parsed.allowedServers ?? [],
      allowedTools: parsed.allowedTools ?? {},
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

export class AgtMcpGateway {
  private readonly auditLog: Array<{ role: string; serverId: string; toolName: string; allowed: boolean }> = [];

  constructor(private readonly policy: AgtGatewayPolicy) {}

  async invoke(input: AgtInvocation): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
    const allowed = this.isAllowed(input.serverId, input.toolName);
    if (this.policy.audit) {
      this.auditLog.push({
        role: input.role,
        serverId: input.serverId,
        toolName: input.toolName,
        allowed,
      });
    }
    if (!allowed) {
      throw new Error(`AGT gateway denied ${input.serverId}:${input.toolName}`);
    }
    const sanitizedArgs = sanitizeArguments(input.arguments);
    return input.invoke.call({ arguments: sanitizedArgs });
  }

  getAuditLog(): readonly { role: string; serverId: string; toolName: string; allowed: boolean }[] {
    return this.auditLog;
  }

  private isAllowed(serverId: string, toolName: string): boolean {
    if (this.policy.denyByDefault) {
      const allowedTools = this.policy.allowedTools[serverId];
      if (!allowedTools) return false;
      return allowedTools.includes(toolName);
    }
    return true;
  }
}

function sanitizeArguments(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") sanitized[key] = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    else sanitized[key] = value;
  }
  return sanitized;
}
