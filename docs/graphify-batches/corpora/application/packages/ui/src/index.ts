export type DesignToken = { name: string; value: string };
export const designSystemBoundary = {
  preservesExistingTokens: true,
  primitives: ["PageHeader", "Panel", "Btn", "PhaseTag", "Stat"] as const,
} as const;
