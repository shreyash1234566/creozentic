export type AiRequest = {
  provider: string;
  model: string;
  workspaceId: string;
  promptVersion: string;
};
export const aiBoundary = {
  providers: ["gemini", "openai", "claude", "fal"] as const,
  routing: "policy-first",
  usage: "ledger-required",
} as const;
