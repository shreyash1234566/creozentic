export type FeatureAssignment = {
  workspaceId: string;
  key: string;
  variant: string;
  source: "local" | "growthbook";
};
export const featureFlagBoundary = { deterministic: true, persistedExposure: true } as const;
