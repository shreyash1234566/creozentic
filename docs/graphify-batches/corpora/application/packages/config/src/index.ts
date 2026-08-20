export type RuntimeConfig = {
  nodeEnv: string;
  appUrl: string;
  databaseUrl?: string;
  redisUrl?: string;
  storageProvider: "s3" | "r2" | "local";
  aiEnabled: boolean;
  gpuEnabled: boolean;
};

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    appUrl: env.APP_URL ?? "http://127.0.0.1:3000",
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    storageProvider:
      env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID ? "r2" : env.S3_ENDPOINT ? "s3" : "local",
    aiEnabled: env.AI_GATEWAY_ENABLED === "true",
    gpuEnabled: env.GPU_WORKER_ENABLED === "true",
  };
}

export function redactedConfig(config: RuntimeConfig) {
  return {
    ...config,
    databaseUrl: config.databaseUrl ? "[configured]" : "[missing]",
    redisUrl: config.redisUrl ? "[configured]" : "[missing]",
  };
}
