export interface McpGatewayPolicy {
  readonly allow: readonly string[];
}

export interface McpGatewayAuditEntry {
  readonly tool: string;
  readonly allowed: boolean;
  readonly timestamp: string;
}

export class McpSecurityGateway {
  private readonly auditLog: McpGatewayAuditEntry[] = [];

  constructor(private readonly policy: McpGatewayPolicy) {}

  isAllowed(toolName: string): boolean {
    const allowed = this.policy.allow.includes(toolName);
    this.auditLog.push({ tool: toolName, allowed, timestamp: new Date().toISOString() });
    return allowed;
  }

  assertAllowed(toolName: string): void {
    if (!this.isAllowed(toolName)) {
      throw new Error(`MCP gateway denied tool: ${toolName}`);
    }
  }

  getAuditLog(): readonly McpGatewayAuditEntry[] {
    return this.auditLog;
  }
}

export function loadGatewayPolicyFromAllowlist(allow: readonly string[]): McpSecurityGateway {
  return new McpSecurityGateway({ allow });
}
