export type DbTenantKey = { workspaceId: string };
export const dbBoundary = {
  provider: "prisma-postgres",
  vectorExtension: "pgvector",
  tenantKey: "workspaceId",
} as const;
