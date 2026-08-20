export type SecurityDecision = {
  workspaceId: string;
  subjectId: string;
  decision: "ALLOW" | "REVIEW" | "BLOCK";
  reasons: string[];
};
export const securityBoundary = {
  tenantIsolation: true,
  rights: true,
  consent: true,
  abuse: true,
} as const;
