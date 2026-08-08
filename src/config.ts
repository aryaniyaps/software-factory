export interface FactoryConfig {
  apiToken?: string;
}

export function loadFactoryConfig(env: NodeJS.ProcessEnv = process.env): FactoryConfig {
  return { apiToken: env.FACTORY_API_TOKEN };
}
