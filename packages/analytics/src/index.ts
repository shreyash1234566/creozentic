export type AnalyticsObservation = {
  workspaceId: string;
  event: string;
  occurredAt: string;
  value: number;
};
export const analyticsBoundary = {
  normalized: true,
  deduplicated: true,
  strategyFeedback: true,
} as const;
