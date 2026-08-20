export type LogContext = {
  requestId?: string;
  workspaceId?: string;
  jobId?: string;
  actorId?: string;
  [key: string]: unknown;
};
export function structuredLog(level: string, event: string, context: LogContext = {}) {
  return { level, event, timestamp: new Date().toISOString(), ...context };
}
