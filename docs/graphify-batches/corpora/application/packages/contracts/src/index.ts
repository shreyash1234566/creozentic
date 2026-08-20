export type TenantScope = { workspaceId: string; actorId?: string };
export type ApiEnvelope<T> = { data: T; requestId: string };
export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type MediaJobContract = {
  id: string;
  workspaceId: string;
  kind: string;
  status: JobStatus;
  idempotencyKey: string;
};
export type EditorPlanContract = {
  projectId: string;
  version: number;
  status: string;
  beats: unknown[];
  hooks: unknown[];
  evidenceIds: string[];
};
export type ProviderHealthContract = {
  provider: string;
  healthy: boolean;
  checkedAt: string;
  latencyMs?: number;
  errorCode?: string;
};
export type PageRequest = { cursor?: string; limit?: number; query?: string };
export type Page<T> = { items: T[]; nextCursor: string | null; total?: number };

export function requireTenantScope(scope: TenantScope) {
  if (!scope.workspaceId.trim()) throw new Error("workspaceId is required");
  return scope;
}
