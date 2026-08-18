const requiredByMode: Record<string, string[]> = {
  local: ["APP_URL", "NEXT_PUBLIC_WORKSPACE_ID", "NEXT_PUBLIC_USER_ID", "LOCAL_STORAGE_ROOT"],
  production: ["APP_URL", "DATABASE_URL", "REDIS_URL", "AUTH_SESSION_SECRET", "CONNECTION_ENCRYPTION_KEY", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
};
const mode = process.env.CREOZENTIC_ENV_MODE ?? (process.env.NODE_ENV === "production" ? "production" : "local");
const required = requiredByMode[mode] ?? requiredByMode.local;
const missing = required.filter((name) => !process.env[name]);
const weak = ["AUTH_SESSION_SECRET", "CONNECTION_ENCRYPTION_KEY", "LOCAL_STORAGE_SIGNING_SECRET"].filter((name) => {
  const value = process.env[name];
  return value && (value.includes("change-me") || value.includes("replace-with") || value.length < 32);
});
console.log(JSON.stringify({ mode, requiredCount: required.length, configuredCount: required.length - missing.length, missing, weakPlaceholders: weak, productionReady: missing.length === 0 && weak.length === 0 }, null, 2));
if (mode === "production" && (missing.length || weak.length)) process.exitCode = 1;
