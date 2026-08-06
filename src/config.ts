export interface FactoryConfig {
  databaseUrl: string;
  evidenceObjectStoreRoot: string;
  evidenceMaxInlineBytes: number;
}

export function loadFactoryConfig(env: NodeJS.ProcessEnv = process.env): FactoryConfig {
  const databaseUrl = env.DATABASE_URL ?? "";
  const evidenceObjectStoreRoot = env.EVIDENCE_OBJECT_STORE_ROOT ?? "/tmp/software-factory-evidence";
  const evidenceMaxInlineBytes = Number(env.EVIDENCE_MAX_INLINE_BYTES ?? "0");
  return { databaseUrl, evidenceObjectStoreRoot, evidenceMaxInlineBytes };
}
