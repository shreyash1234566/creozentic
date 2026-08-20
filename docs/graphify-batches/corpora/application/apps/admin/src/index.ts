export type AdminSurface =
  | "tenant-operations"
  | "provider-health"
  | "audit"
  | "billing"
  | "deployment";

export const adminSurfaces: readonly AdminSurface[] = [
  "tenant-operations",
  "provider-health",
  "audit",
  "billing",
  "deployment",
];

export function assertAdminSurface(surface: string): asserts surface is AdminSurface {
  if (!adminSurfaces.includes(surface as AdminSurface))
    throw new Error(`Unknown admin surface: ${surface}`);
}
