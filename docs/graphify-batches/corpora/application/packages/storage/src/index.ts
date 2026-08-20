export type ObjectRef = { workspaceId: string; key: string; checksum?: string };
export function tenantObjectKey(ref: ObjectRef) {
  if (ref.key.includes("..")) throw new Error("unsafe object key");
  return `workspaces/${ref.workspaceId}/${ref.key.replace(/^\/+/, "")}`;
}
