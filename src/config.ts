export interface FactoryConfig {
  databaseUrl: string;
  evidenceObjectStoreRoot: string;
  evidenceMaxInlineBytes: number;
  apiToken?: string;
  signedUrlSecret: string;
  signedUrlTtlSeconds: number;
  evidenceRetentionDays: number;
  publicBaseUrl: string;
}

export function loadFactoryConfig(env: NodeJS.ProcessEnv = process.env): FactoryConfig {
  const databaseUrl = env.DATABASE_URL ?? "";
  const evidenceObjectStoreRoot = env.EVIDENCE_OBJECT_STORE_ROOT ?? "/tmp/software-factory-evidence";
  const evidenceMaxInlineBytes = Number(env.EVIDENCE_MAX_INLINE_BYTES ?? "0");
  const apiToken = env.FACTORY_API_TOKEN;
  const signedUrlSecret = env.FACTORY_SIGNED_URL_SECRET ?? "dev-signed-url-secret";
  const signedUrlTtlSeconds = Number(env.FACTORY_SIGNED_URL_TTL_SECONDS ?? "3600");
  const evidenceRetentionDays = Number(env.FACTORY_EVIDENCE_RETENTION_DAYS ?? "90");
  const publicBaseUrl = env.FACTORY_PUBLIC_BASE_URL ?? `http://127.0.0.1:${env.FACTORY_PORT ?? "8787"}`;
  return {
    databaseUrl,
    evidenceObjectStoreRoot,
    evidenceMaxInlineBytes,
    apiToken,
    signedUrlSecret,
    signedUrlTtlSeconds,
    evidenceRetentionDays,
    publicBaseUrl,
  };
}
