import type { ProductLockBrief } from "../domain";

const workspaceId = process.env.NEXT_PUBLIC_WORKSPACE_ID ?? "workspace-autozentic-demo";

type ApiResponse<T> = { data: T; error?: { code: string; message: string } };

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-workspace-id": workspaceId,
      "x-user-id": process.env.NEXT_PUBLIC_USER_ID ?? "user-autozentic-owner",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok) throw new Error(body.error?.message ?? "The server request failed.");
  return body.data;
}

export type ServerState = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    region: string;
    role?: string;
  };
  brand: {
    id: string;
    name: string;
    version: number;
    approvalStatus?: string;
    profile: Record<string, unknown>;
  } | null;
  runs: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  credits: { balance: number; reserved: number } | null;
  ledger: Array<Record<string, unknown>>;
  assets: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    mimeType: string;
    objectKey: string;
    productId?: string | null;
    contentHash: string;
  }>;
  products: Array<{
    id: string;
    sku: string;
    title: string;
    sourceAssetIds: unknown;
    lockMode: string;
    brandId?: string | null;
  }>;
};

export async function getServerState() {
  return request<ServerState>(`/api/v1/workspaces/${workspaceId}/state`);
}

export type ServerCampaign = Record<string, unknown> & {
  id: string;
  name: string;
  objective: string;
  lifecycleStatus: string;
};

export async function getServerCampaigns() {
  return request<ServerCampaign[]>("/api/v1/campaigns");
}

export async function getServerCampaign(campaignId: string) {
  return request<ServerCampaign>(`/api/v1/campaigns/${campaignId}`);
}

export async function createServerCampaignDirections(campaignId: string) {
  return request<Array<Record<string, unknown>>>(`/api/v1/campaigns/${campaignId}/directions`, {
    method: "POST",
    body: "{}",
  });
}

export async function selectServerCampaignDirection(campaignId: string, directionId: string) {
  return request<ServerCampaign>(`/api/v1/campaigns/${campaignId}/directions`, {
    method: "POST",
    body: JSON.stringify({ directionId }),
  });
}

export async function getServerCampaignEvents(campaignId: string) {
  return request<Array<Record<string, unknown>>>(`/api/v1/campaigns/${campaignId}/events`);
}

export async function createServerDeliveryRule(
  campaignId: string,
  input: {
    what: string;
    source: Record<string, unknown>;
    maxCostMinor?: number;
    approvalMode?: string;
    schedule?: Record<string, unknown>;
    fallback?: string;
  },
) {
  return request<Record<string, unknown>>(`/api/v1/campaigns/${campaignId}/delivery-rules`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateServerDeliveryRule(
  campaignId: string,
  ruleId: string,
  input: { paused?: boolean; maxCostMinor?: number; approvalMode?: string; fallback?: string },
) {
  return request<Record<string, unknown>>(
    `/api/v1/campaigns/${campaignId}/delivery-rules/${ruleId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function createServerCampaign(input: {
  name: string;
  objective: string;
  brandId?: string;
  productIds: string[];
  channels: string[];
  offer?: Record<string, unknown>;
  audience?: Record<string, unknown>;
  legalCopy?: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateServerCampaignFacts(
  campaignId: string,
  facts: Array<{
    field: string;
    value: unknown;
    source?: string;
    state?: string;
    expiresAt?: string;
  }>,
) {
  return request<Record<string, unknown>>(`/api/v1/campaigns/${campaignId}/facts`, {
    method: "POST",
    body: JSON.stringify({ facts }),
  });
}

export async function createServerRevisionRequest(
  campaignId: string,
  input: {
    scope: string;
    intent: string;
    targetAssetId?: string;
    targetFrame?: string;
    affectedFields: string[];
    parentVersion: string;
  },
) {
  return request<Record<string, unknown>>(`/api/v1/campaigns/${campaignId}/revisions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function attachServerRunToCampaign(campaignId: string, runId: string) {
  return request<Record<string, unknown>>(`/api/v1/campaigns/${campaignId}/attach-run`, {
    method: "POST",
    body: JSON.stringify({ runId }),
  });
}

export async function getServerUsage() {
  return request<{
    account: { balance: number; reserved: number } | null;
    summary: {
      creditsConsumed: number;
      creditsPurchased: number;
      providerCostMinor: number;
      providerCostCurrency: string;
    };
  }>("/api/v1/usage");
}

export async function getServerCapabilities() {
  return request<{
    configuredProviders: Array<{
      id: string;
      model?: string | null;
      modelVersion?: string | null;
      capabilities?: string[];
      health?: string;
      region?: string | null;
      supportedRatios?: string[] | null;
      costMinorPerOutput?: number | null;
    }>;
    routes: Array<Record<string, unknown>>;
  }>("/api/v1/capabilities");
}

export async function getServerWorkflows() {
  return request<Array<Record<string, unknown>>>("/api/v1/workflows");
}

export async function createServerWorkflow(input: {
  name: string;
  category: string;
  graph: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  costFormula?: Record<string, unknown>;
}) {
  return request<{
    template: Record<string, unknown>;
    version: Record<string, unknown>;
  }>("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createServerWorkflowVersion(
  templateId: string,
  input: {
    version: string;
    graph: Record<string, unknown>;
    inputSchema?: Record<string, unknown>;
    permissions?: Record<string, unknown>;
    costFormula?: Record<string, unknown>;
  },
) {
  return request<Record<string, unknown>>(`/api/v1/workflows/${templateId}/versions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function publishServerWorkflowVersion(templateId: string, versionId: string) {
  return request<Record<string, unknown>>(`/api/v1/workflows/${templateId}/publish`, {
    method: "POST",
    body: JSON.stringify({ versionId }),
  });
}

export async function getServerAssets() {
  return request<Array<Record<string, unknown>>>("/api/v1/assets?limit=500");
}

export async function createServerUploadIntent(input: {
  name: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  type?: string;
}) {
  return request<{
    asset: Record<string, unknown>;
    uploadUrl: string | null;
    expiresIn: number;
    method: "PUT";
    headers: Record<string, string>;
    duplicate?: boolean;
  }>("/api/v1/assets/upload-intent", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function completeServerAsset(assetId: string) {
  return request<Record<string, unknown>>(`/api/v1/assets/${assetId}/complete`, {
    method: "POST",
    body: "{}",
  });
}

export async function purgeServerAsset(assetId: string) {
  return request<Record<string, unknown>>(
    `/api/v1/assets/${assetId}/complete?purge=true&confirm=PURGE_ASSET`,
    { method: "DELETE" },
  );
}

export async function getServerAssetDownload(assetId: string) {
  return request<{ assetId: string; url: string; expiresIn: number }>(
    `/api/v1/assets/${assetId}/download`,
  );
}

export async function getServerProducts() {
  return request<Array<Record<string, unknown>>>("/api/v1/products?limit=1000");
}

export async function startServerRun(input: {
  title: string;
  brief: ProductLockBrief;
  idempotencyKey: string;
  workflowVersionId?: string;
}) {
  return request<{
    run: Record<string, unknown>;
    quote: Record<string, unknown>;
    queue: { accepted: boolean; driver: string };
  }>("/api/v1/runs", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function getServerRun(runId: string) {
  return request<Record<string, unknown>>(`/api/v1/runs/${runId}`);
}

export async function decideServerReview(
  reviewId: string,
  decision: "approve" | "reject" | "refine",
  reason?: string,
  approvedOutputIds?: string[],
) {
  return request(`/api/v1/reviews/${reviewId}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reason, approvedOutputIds }),
  });
}

export async function exportServerRun(runId: string) {
  return request<{ manifest: Record<string, unknown>; deduplicated: boolean }>(`/api/v1/exports`, {
    method: "POST",
    headers: { "idempotency-key": `export:${runId}` },
    body: JSON.stringify({ runId }),
  });
}

export async function saveServerBrand(input: {
  name: string;
  profile: Record<string, unknown>;
  rules?: Array<Record<string, unknown>>;
  referenceAssetIds?: string[];
}) {
  return request<{ id: string; name: string; version: number; profile: Record<string, unknown> }>(
    "/api/v1/brands",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function approveServerBrand(brandId: string) {
  return request<Record<string, unknown>>(`/api/v1/brands/${brandId}/approve`, {
    method: "POST",
    body: "{}",
  });
}

export async function testServerBrand(brandId: string) {
  return request<{
    ready: boolean;
    approved: boolean;
    version: number;
    summary: string;
    checks: Array<{ label: string; valid: boolean }>;
    missing: string[];
    samplePack: {
      status: string;
      explanation: string;
      referenceAssetIds: string[];
      verifiedReferenceCount: number;
      formats: string[];
      deliverables: Array<{ type: string; label: string; state: string }>;
      content: {
        headline: string;
        caption: string;
        cta: string;
        hashtags: string[];
        altText: string;
      };
      rulesApplied: string[];
    };
  }>(`/api/v1/brands/${brandId}/test`, { method: "POST", body: "{}" });
}

export async function createServerReviewLink(reviewId: string) {
  return request<{ token: string; url: string; expiresAt: string }>(
    `/api/v1/reviews/${reviewId}/link`,
    { method: "POST", body: JSON.stringify({ expiresInHours: 72, maxViews: 25 }) },
  );
}

export async function addServerReviewComment(
  reviewId: string,
  input: {
    text: string;
    region?: string;
    assetId?: string;
    anchor?: { x?: number; y?: number; t?: number };
  },
) {
  return request<Record<string, unknown>>(`/api/v1/reviews/${reviewId}/comments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createServerBatch(input: {
  title: string;
  rows: Array<Record<string, unknown>>;
  briefDefaults: Record<string, unknown>;
  dryRun?: boolean;
  idempotencyKey: string;
}) {
  return request<Record<string, unknown>>(`/api/v1/batches`, {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function getServerBatch(batchId: string) {
  return request<Record<string, unknown>>(`/api/v1/batches/${batchId}`);
}

export async function retryServerBatchRow(batchId: string, rowId: string) {
  return request<Record<string, unknown>>(`/api/v1/batches/${batchId}/rows/${rowId}/retry`, {
    method: "POST",
    headers: { "idempotency-key": `batch-row-retry:${batchId}:${rowId}:${Date.now()}` },
    body: "{}",
  });
}

export async function updateServerBatchState(
  batchId: string,
  state: "PAUSED" | "RUNNING" | "CANCELLED",
) {
  return request<Record<string, unknown>>(`/api/v1/batches/${batchId}`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
}

export async function createServerLocalization(input: {
  sourceOutputId?: string;
  sourceText: string;
  sourceCta?: string;
  locales: string[];
  lockedTerms: string[];
  idempotencyKey: string;
}) {
  return request<{ job: Record<string, unknown>; deduplicated: boolean }>("/api/v1/localizations", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function getServerLocalizationJob(jobId: string) {
  return request<Record<string, unknown>>(`/api/v1/localizations/${jobId}`);
}

export async function createServerUGCProject(input: {
  name: string;
  campaignId?: string;
  productId?: string;
  sourceAssetIds: string[];
  audience: string;
  problem: string;
  proof: string;
  offer: string;
  forbiddenClaims?: string[];
  language?: string;
  channel?: string;
  durationSec?: number;
  persona?: string;
  consentSubject?: string;
}) {
  return request<Record<string, unknown>>(`/api/v1/ugc/projects`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getServerUGCProject(projectId: string) {
  return request<Record<string, unknown>>(`/api/v1/ugc/projects/${projectId}`);
}

export async function analyzeServerUGCProject(projectId: string, sourceAssetIds?: string[]) {
  return request<Record<string, unknown>>(`/api/v1/ugc/projects/${projectId}/analyze`, {
    method: "POST",
    body: JSON.stringify({ sourceAssetIds }),
  });
}

export async function planServerUGCProject(projectId: string) {
  return request<Record<string, unknown>>(`/api/v1/ugc/projects/${projectId}/plan`, {
    method: "POST",
    body: "{}",
  });
}

export async function updateServerUGCShot(
  projectId: string,
  shotId: string,
  input: { script?: string; startMs?: number; endMs?: number; status?: "LOCKED" | "EDITED" },
) {
  return request<Record<string, unknown>>(`/api/v1/ugc/projects/${projectId}/shots/${shotId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function renderServerUGCProject(
  projectId: string,
  input: {
    sourceAssetIds: string[];
    captions?: string[];
    bRollAssetIds?: string[];
    musicAssetId?: string;
    voiceAssetId?: string;
    coverShotId?: string;
    consentSubject?: string;
    syntheticAvatar?: boolean;
    outputDurationsSec?: number[];
    idempotencyKey: string;
  },
) {
  return request<Record<string, unknown>>(`/api/v1/ugc/projects/${projectId}/render`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function evaluateServerConsistency(input: {
  referencePackId: string;
  runId?: string;
  outputAssetId?: string;
  sourceAssetId?: string;
  idempotencyKey: string;
}) {
  return request<Record<string, unknown>>("/api/v1/consistency-checks", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function getServerSchedules() {
  return request<Array<Record<string, unknown>>>("/api/v1/schedules");
}

export async function createServerSchedule(input: {
  name: string;
  cadence: "daily" | "weekly" | "monthly" | "once";
  nextRunAt?: string;
  costCeiling: number;
  payload: Record<string, unknown>;
  approvalRequired?: boolean;
  brandId?: string;
  autonomyMode?: string;
}) {
  return request<{
    schedule: Record<string, unknown>;
    triggerSecret: string;
    estimate: Record<string, unknown>;
  }>("/api/v1/schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateServerSchedule(
  scheduleId: string,
  patch: { status?: "ACTIVE" | "PAUSED" | "DISABLED" | "BLOCKED"; costCeiling?: number },
) {
  return request<Record<string, unknown>>(`/api/v1/schedules/${scheduleId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function triggerServerSchedule(scheduleId: string, triggerKey: string) {
  return request<Record<string, unknown>>(`/api/v1/schedules/${scheduleId}/trigger`, {
    method: "POST",
    headers: { "idempotency-key": `schedule-trigger:${scheduleId}:${triggerKey}` },
    body: JSON.stringify({ triggerKey }),
  });
}

export async function getServerDailyPlans() {
  return request<Array<Record<string, unknown>>>("/api/v1/daily-plans");
}

export async function getServerCalendar(weekStart?: string) {
  return request<Array<Record<string, unknown>>>(
    `/api/v1/content-calendar${weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : ""}`,
  );
}

export async function generateServerCalendar(input: {
  weekStart: string;
  contentTypes?: string[];
  channel?: string;
}) {
  return request<{ weekStart: string; entries: Array<Record<string, unknown>> }>(
    "/api/v1/content-calendar",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function getServerAgencyMetrics() {
  return request<Record<string, number>>("/api/v1/agency/metrics");
}

export async function getServerAgencyQueue(input?: { status?: string; brandId?: string }) {
  const query = new URLSearchParams();
  if (input?.status) query.set("status", input.status);
  if (input?.brandId) query.set("brandId", input.brandId);
  return request<Array<Record<string, unknown>>>(
    `/api/v1/agency/queue${query.toString() ? `?${query.toString()}` : ""}`,
  );
}

export async function updateServerAgencyItem(
  itemId: string,
  input: {
    status?: string;
    deadline?: string;
    revisionCount?: number;
    revenueMinor?: number;
    providerSpendMinor?: number;
  },
) {
  return request<Record<string, unknown>>(`/api/v1/agency/queue/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createServerDailyPlan(input: {
  brandId?: string;
  planDate: string;
  autonomyMode: "DRAFT" | "APPROVAL" | "GUARDED_AUTOPUBLISH" | "CAMPAIGN";
  channel?: string;
  language?: string;
  contentTypes?: string[];
  productIds?: string[];
  campaignIds?: string[];
}) {
  return request<{ plan: Record<string, unknown>; deduplicated: boolean }>("/api/v1/daily-plans", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getServerDailyPlan(planId: string) {
  return request<Record<string, unknown>>(`/api/v1/daily-plans/${planId}`);
}

export async function runServerDailyPlan(planId: string) {
  return request<{ plan: Record<string, unknown>; deduplicated: boolean }>(
    `/api/v1/daily-plans/${planId}/run`,
    { method: "POST", body: "{}" },
  );
}

export async function exportServerDailyPlan(planId: string) {
  return request<{
    plan: Record<string, unknown>;
    manifest: Record<string, unknown>;
    deduplicated: boolean;
  }>(`/api/v1/daily-plans/${planId}/export`, { method: "POST", body: "{}" });
}

export async function approveServerDailyPlan(planId: string, gateIds?: string[]) {
  return request<Record<string, unknown>>(`/api/v1/daily-plans/${planId}/approve`, {
    method: "POST",
    body: JSON.stringify({ gateIds }),
  });
}

export async function reviseServerDailyPlan(
  planId: string,
  input: { gateId?: string; instruction: string; category?: string },
) {
  return request<Record<string, unknown>>(`/api/v1/daily-plans/${planId}/revise`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createServerCreativeRequest(input: {
  rawMessage: string;
  source?: string;
  brandId?: string;
  channel?: string;
  requestedDate?: string;
}) {
  return request<{ request: Record<string, unknown>; deduplicated: boolean }>(
    "/api/v1/creative-requests",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function getServerCreativeRequests() {
  return request<Array<Record<string, unknown>>>("/api/v1/creative-requests");
}

export async function getServerAutonomyPolicies() {
  return request<Array<Record<string, unknown>>>("/api/v1/autonomy-policies");
}

export async function saveServerAutonomyPolicy(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/v1/autonomy-policies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createServerTopup(input: {
  units: number;
  provider: "razorpay" | "stripe";
  idempotencyKey: string;
}) {
  return request<{ checkoutUrl?: string; provider: string; units: number }>(
    "/api/v1/billing/topup-intent",
    {
      method: "POST",
      headers: { "idempotency-key": input.idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

export async function createServerCheckout(input: {
  provider: "razorpay" | "stripe";
  plan?: string;
  units?: number;
  amountMinor?: number;
  idempotencyKey: string;
}) {
  return request<Record<string, unknown>>("/api/v1/billing/checkout", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function getServerBilling() {
  return request<{
    subscriptions: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
  }>("/api/v1/billing");
}

export async function getServerRefunds() {
  return request<Array<Record<string, unknown>>>("/api/v1/billing/refunds");
}

export async function requestServerRefund(input: {
  provider: "razorpay" | "stripe";
  invoiceId?: string;
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
}) {
  return request<Record<string, unknown>>("/api/v1/billing/refunds", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function updateServerSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean) {
  return request<Record<string, unknown>>(`/api/v1/billing/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({ cancelAtPeriodEnd }),
  });
}

export type ServerConnection = {
  id: string;
  provider: string;
  scopes: string[];
  health: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function getServerConnections() {
  return request<ServerConnection[]>("/api/v1/connections");
}

export async function startServerConnectorOAuth(provider: string) {
  return request<{ provider: string; authorizeUrl: string; expiresAt: string }>(
    `/api/v1/connections/${encodeURIComponent(provider)}/oauth/start`,
  );
}

export async function disconnectServerConnection(connectionId: string) {
  return request(`/api/v1/connections/${connectionId}`, { method: "DELETE" });
}

export type ServerChannelIdentity = {
  id: string;
  provider: string;
  externalSubject: string;
  userId?: string | null;
  displayName?: string | null;
  status: string;
  verifiedAt?: string | null;
};

export async function getServerChannelIdentities() {
  return request<ServerChannelIdentity[]>("/api/v1/channel-identities");
}

export async function verifyServerChannelIdentity(
  identityId: string,
  input: { status: "VERIFIED" | "REVOKED"; userId?: string },
) {
  return request<ServerChannelIdentity>(`/api/v1/channel-identities/${identityId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function sendServerConnectorMessage(input: {
  provider: string;
  externalSubject: string;
  text: string;
  idempotencyKey: string;
}) {
  return request<Record<string, unknown>>("/api/v1/connectors/messages", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function createServerDriveSync(input: {
  direction: "PULL" | "PUSH";
  inputFolderId?: string;
  outputFolderId?: string;
  outputAssetIds?: string[];
  idempotencyKey: string;
}) {
  return request<Record<string, unknown>>("/api/v1/drive/sync", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({ ...input, provider: "google-drive" }),
  });
}

export async function getServerDriveSyncJobs() {
  return request<Array<Record<string, unknown>>>("/api/v1/drive/sync");
}

export async function createServerMediaJob(input: {
  kind: string;
  sourceAssetIds: string[];
  runId?: string;
  config?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return request<Record<string, unknown>>("/api/v1/media-jobs", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function getServerMediaJobs() {
  return request<Array<Record<string, unknown>>>("/api/v1/media-jobs");
}

export async function getServerPerformance() {
  return request<
    Array<{ metric: string; _avg: { value: number | null }; _count: { _all: number } }>
  >("/api/v1/performance");
}

export async function getServerPerformanceRecommendations() {
  return request<Array<Record<string, unknown>>>("/api/v1/performance/recommendations");
}

export async function refreshServerPerformanceRecommendations() {
  return request<Array<Record<string, unknown>>>("/api/v1/performance/recommendations", {
    method: "POST",
    body: "{}",
  });
}

export async function updateServerPerformanceRecommendation(
  recommendationId: string,
  input: { status: "OPEN" | "APPLIED" | "DISMISSED"; optOut?: boolean; action?: string },
) {
  return request<Record<string, unknown>>(
    `/api/v1/performance/recommendations/${recommendationId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function compareServerQuotes(input: Record<string, unknown>) {
  return request<Array<Record<string, unknown>>>("/api/v1/quotes/compare", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createServerComparison(input: {
  prompt: string;
  modelRefs: string[];
  inputAssetIds?: string[];
  constraints?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return request<{ comparison: Record<string, unknown>; deduplicated: boolean }>(
    "/api/v1/comparisons",
    {
      method: "POST",
      headers: { "idempotency-key": input.idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

export async function commitServerComparison(comparisonId: string, outputId: string) {
  return request<Record<string, unknown>>(`/api/v1/comparisons/${comparisonId}/commit`, {
    method: "POST",
    body: JSON.stringify({ outputId }),
  });
}

export async function createServerReferencePack(input: {
  name: string;
  productId?: string;
  mode: "PRODUCT_LOCK" | "CREATIVE";
  seed?: string;
  referenceAssetIds: string[];
  identityRules: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/reference-packs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveServerReferencePack(packId: string) {
  return request<Record<string, unknown>>(`/api/v1/reference-packs/${packId}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getServerReferencePacks() {
  return request<Array<Record<string, unknown>>>("/api/v1/reference-packs");
}

export async function getServerPolicies() {
  return request<Array<Record<string, unknown>>>("/api/v1/policies");
}
export async function createServerPolicy(input: {
  kind: string;
  content: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/policies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function approveServerPolicy(policyId: string) {
  return request<Record<string, unknown>>(`/api/v1/policies/${policyId}/approve`, {
    method: "POST",
    body: "{}",
  });
}
export async function getServerBenchmarks() {
  return request<Array<Record<string, unknown>>>("/api/v1/benchmarks");
}
export async function createServerBenchmark(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/v1/benchmarks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function runServerBenchmark(
  suiteId: string,
  modelRef?: string,
  outputs?: Record<string, unknown>,
) {
  return request<Record<string, unknown>>(`/api/v1/benchmarks/${suiteId}/run`, {
    method: "POST",
    body: JSON.stringify({ modelRef, outputs }),
  });
}
export async function getServerMarketplacePackages() {
  return request<Array<Record<string, unknown>>>("/api/v1/marketplace/packages");
}
export async function installServerMarketplacePackage(packageId: string, alias?: string) {
  return request<Record<string, unknown>>(`/api/v1/marketplace/packages/${packageId}/install`, {
    method: "POST",
    body: JSON.stringify({ alias }),
  });
}
export async function publishServerMarketplacePackage(packageId: string) {
  return request<Record<string, unknown>>(`/api/v1/marketplace/packages/${packageId}/publish`, {
    method: "POST",
    body: "{}",
  });
}
export async function getServerCompetitorSources() {
  return request<Array<Record<string, unknown>>>("/api/v1/competitor-sources");
}
export async function createServerCompetitorSource(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/v1/competitor-sources", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function refreshServerCompetitorSource(sourceId: string) {
  return request<Record<string, unknown>>(`/api/v1/competitor-sources/${sourceId}/refresh`, {
    method: "POST",
    body: "{}",
  });
}
export async function deleteServerCompetitorSource(sourceId: string) {
  return request<Record<string, unknown>>(`/api/v1/competitor-sources/${sourceId}`, {
    method: "DELETE",
  });
}
export async function getServerWhiteLabel() {
  return request<Record<string, unknown> | null>("/api/v1/white-label");
}
export async function updateServerWhiteLabel(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/v1/white-label", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
export async function getServerEnterpriseControls() {
  return request<Record<string, unknown> | null>("/api/v1/enterprise/controls");
}
export async function updateServerEnterpriseControls(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/v1/enterprise/controls", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
export async function getServerCustomModels() {
  return request<Array<Record<string, unknown>>>("/api/v1/custom-models");
}
export async function exportServerCustomModel(projectId: string) {
  return request<Record<string, unknown>>(`/api/v1/custom-models/${projectId}/export`);
}
export async function createServerCustomModel(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/v1/custom-models", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function createServerCustomModelDataset(
  projectId: string,
  input: Record<string, unknown>,
) {
  return request<Record<string, unknown>>(`/api/v1/custom-models/${projectId}/dataset`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function evaluateServerCustomModel(projectId: string, input: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/api/v1/custom-models/${projectId}/evaluate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function releaseServerCustomModel(projectId: string, input: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/api/v1/custom-models/${projectId}/release`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function disableServerCustomModel(projectId: string) {
  return request<Record<string, unknown>>(`/api/v1/custom-models/${projectId}/disable`, {
    method: "POST",
    body: "{}",
  });
}
export async function deleteServerCustomModel(projectId: string) {
  return request<Record<string, unknown>>(`/api/v1/custom-models/${projectId}/delete`, {
    method: "POST",
    body: "{}",
  });
}

export type EditorProject = Record<string, unknown> & {
  id: string;
  state: string;
  activePlanVersion: number;
};
export async function createEditorProject(input: {
  name: string;
  objective: string;
  audience: string;
  platform: string;
  constraints?: Record<string, unknown>;
  references?: unknown[];
  memorySnapshot?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return request<EditorProject>("/api/editor/projects", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(input),
  });
}
export async function getEditorProject(projectId: string) {
  return request<EditorProject>(`/api/editor/projects/${projectId}`);
}
export async function analyzeEditorProject(projectId: string, assetIds: string[]) {
  return request<Record<string, unknown>>(`/api/editor/projects/${projectId}/analyze`, {
    method: "POST",
    body: JSON.stringify({ assetIds }),
  });
}
export async function planEditorProject(projectId: string) {
  return request<Record<string, unknown>>(`/api/editor/projects/${projectId}/plan`, {
    method: "POST",
    body: "{}",
  });
}
export async function editorAction(
  projectId: string,
  action: string,
  body: Record<string, unknown> = {},
) {
  return request<Record<string, unknown>>(`/api/editor/projects/${projectId}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PlatformIntegrationKind = "experiment" | "notification" | "billing" | "webhook";
export async function runPlatformIntegration(
  kind: PlatformIntegrationKind,
  input: Record<string, unknown>,
) {
  return request<Record<string, unknown>>(`/api/v1/integrations/${kind}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
