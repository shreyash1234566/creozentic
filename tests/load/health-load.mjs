const baseUrl = process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3000";
const requests = Number(process.env.LOAD_REQUESTS ?? 25);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 5);
const samples = [];
let next = 0;
async function worker() {
  while (next < requests) {
    const index = next++;
    const started = performance.now();
    const response = await fetch(new URL("/api/v1/health/ready", baseUrl));
    samples[index] = { status: response.status, ms: performance.now() - started };
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
const ordered = samples
  .filter(Boolean)
  .map((sample) => sample.ms)
  .sort((a, b) => a - b);
const percentile = (p) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * p))];
if (samples.some((sample) => sample.status !== 200)) process.exitCode = 1;
console.log(
  JSON.stringify(
    {
      baseUrl,
      requests,
      concurrency,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: ordered.at(-1),
      failed: samples.filter((sample) => sample.status !== 200).length,
    },
    null,
    2,
  ),
);
