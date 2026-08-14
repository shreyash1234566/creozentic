"use client";

import { use, useEffect, useState } from "react";

type ReviewLinkData = {
  id: string;
  title: string;
  status: string;
  verdicts: Record<string, { verdict?: string; repair?: string }>;
  outputs: Array<{
    id: string;
    name: string;
    format: string;
    width?: number | null;
    height?: number | null;
    downloadUrl?: string | null;
  }>;
  comments: Array<{ id: string; text: string; region?: string | null; createdAt: string }>;
};

export default function PublicReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [review, setReview] = useState<ReviewLinkData | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [commentRegion, setCommentRegion] = useState("asset");
  const [busy, setBusy] = useState(false);
  const [selectedOutputIds, setSelectedOutputIds] = useState<string[]>([]);

  useEffect(() => {
    void fetch(`/api/v1/review-links/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message ?? "This review link is unavailable.");
        const loaded = body.data as ReviewLinkData;
        setReview(loaded);
        setSelectedOutputIds(loaded.outputs.map((output) => output.id));
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "The review link is unavailable."),
      );
  }, [token]);

  const decide = async (decision: "approve" | "reject" | "refine") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/review-links/${token}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reason,
          reviewerName: name || "External reviewer",
          approvedOutputIds: decision === "approve" ? selectedOutputIds : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "The decision could not be saved.");
      setReview((current) => (current ? { ...current, status: body.data.review.status } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const postComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/review-links/${token}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: comment,
          region: commentRegion,
          reviewerName: name || "External reviewer",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "The comment could not be saved.");
      setReview((current) =>
        current ? { ...current, comments: [...current.comments, body.data] } : current,
      );
      setComment("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The comment could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !review)
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
        {error}
      </main>
    );
  if (!review)
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
        Loading review…
      </main>
    );

  const blocked = Object.values(review.verdicts).some((item) => item.verdict === "critical");
  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-saffron-deep">
            Creozentic · secure review
          </div>
          <h1 className="mt-2 font-display text-3xl font-medium">{review.title}</h1>
          <p className="mt-2 text-sm text-ink-soft">Status: {review.status.toLowerCase()}</p>
        </div>
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Quality gate
          </h2>
          <div className="mt-4 divide-y divide-line">
            {Object.entries(review.verdicts).map(([dimension, value]) => (
              <div
                key={dimension}
                className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="text-sm font-medium">{dimension}</div>
                  {value.repair && <div className="mt-1 text-xs text-ink-soft">{value.repair}</div>}
                </div>
                <span className="font-mono text-[10px] uppercase text-saffron-deep">
                  {value.verdict}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Output pack · select what to approve
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {review.outputs.map((output) => (
              <div key={output.id} className="rounded-lg border border-line p-3">
                <label className="mb-2 flex items-center gap-2 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={selectedOutputIds.includes(output.id)}
                    onChange={(event) =>
                      setSelectedOutputIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, output.id])]
                          : current.filter((id) => id !== output.id),
                      )
                    }
                  />
                  Include in approval
                </label>
                {output.downloadUrl ? (
                  <img
                    src={output.downloadUrl}
                    alt={output.name}
                    className="aspect-square w-full rounded object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded bg-paper-deep text-center text-xs text-ink-soft">
                    Preview unavailable until storage is configured.
                  </div>
                )}
                <div className="mt-2 text-sm font-medium">{output.name}</div>
                <div className="font-mono text-[10px] text-ink-soft">
                  {output.format} · {output.width ?? "?"}×{output.height ?? "?"}
                </div>
                {output.downloadUrl && (
                  <a
                    href={output.downloadUrl}
                    download={output.name}
                    className="mt-2 inline-block text-xs text-saffron-deep"
                  >
                    Download preview
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Comments
          </h2>
          <div className="mt-3 space-y-2">
            {review.comments.length === 0 ? (
              <p className="text-sm text-ink-soft">No comments yet.</p>
            ) : (
              review.comments.map((comment) => (
                <div key={comment.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                  {comment.text}
                  {comment.region && (
                    <span className="ml-2 font-mono text-[10px] text-ink-soft">
                      @{comment.region}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <select
              value={commentRegion}
              onChange={(event) => setCommentRegion(event.target.value)}
              className="rounded-lg border border-line bg-paper px-2 text-sm"
            >
              <option>asset</option>
              <option>headline</option>
              <option>cta</option>
              <option>product</option>
            </select>
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a comment"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
            <button
              disabled={busy || !comment.trim()}
              onClick={() => void postComment()}
              className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional note"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
          </div>
          {error && <p className="mt-3 text-sm text-saffron-deep">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy || blocked || selectedOutputIds.length === 0}
              onClick={() => void decide("approve")}
              className="rounded-lg bg-ink px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              {blocked ? "Blocked by QA" : `Approve selected · ${selectedOutputIds.length}`}
            </button>
            <button
              disabled={busy}
              onClick={() => void decide("refine")}
              className="rounded-lg border border-line px-4 py-2 text-sm"
            >
              Request refinement
            </button>
            <button
              disabled={busy}
              onClick={() => void decide("reject")}
              className="rounded-lg border border-line px-4 py-2 text-sm"
            >
              Reject
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
