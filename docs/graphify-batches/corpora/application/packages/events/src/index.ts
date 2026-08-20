export type DomainEvent = {
  id: string;
  workspaceId: string;
  type: string;
  occurredAt: string;
  payload: unknown;
};
export const eventBoundary = { outbox: true, signedWebhooks: true, replay: true } as const;
