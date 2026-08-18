export type StrategyRecommendation = {
  workspaceId: string;
  hypothesis: string;
  evidenceIds: string[];
  status: "DRAFT" | "APPROVED" | "REJECTED";
};
export const strategyBoundary = {
  experiments: true,
  recommendations: true,
  memoryFeedback: true,
} as const;
