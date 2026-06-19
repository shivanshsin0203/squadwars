/**
 * Tiny fetch wrapper that:
 *   1. Includes credentials so the sw_session cookie roundtrips on every call.
 *   2. Forces content-type: application/json and lets callers override.
 *   3. Parses JSON and throws a typed ApiError on non-2xx so call-sites can
 *      hand it straight to toastFromApiError().
 *
 * Why a wrapper: every fetch in the client now needs credentials:"include"
 * (the new session cookie) and the same error decoding. One helper keeps the
 * call sites uniform.
 */

import type { ToastInput } from "../_components/Toast";

export type ApiErrorBody = {
  error?: string;
  message?: string;
  scope?: string;
  retryAfterMs?: number;
  // Zod's @hono/zod-validator nests issues here.
  success?: false;
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (networkErr) {
    // Network-level failure (DNS, offline, CORS preflight). Treat as a
    // synthesized 0 / "network" so callers can branch on it the same way.
    throw new ApiError(0, {
      error: "network",
      message: (networkErr as Error).message,
    });
  }

  const text = await res.text();
  let body: ApiErrorBody | T = null as never;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: "parse_error", message: text.slice(0, 200) } as ApiErrorBody;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, (body as ApiErrorBody) ?? {});
  }
  return body as T;
}

/**
 * Decode an ApiError into a single toast and push it.
 *
 * Status routing (matches server response shapes):
 *   429 → rate-limit toast w/ countdown if retryAfterMs is present
 *   403 session_mismatch → session toast
 *   404 → "not found" error toast
 *   409 → info toast ("out of sync, refreshing")
 *   400 → error toast with the message from Zod / business logic
 *   425 → info toast ("a bit early — retry"); the bid loop handles its own
 *         retry, but rendering one if the user manually triggers is fine
 *   ≥500 → generic "server hiccup" toast
 *   0    → network toast
 */
export function toastFromApiError(
  err: unknown,
  push: (t: ToastInput) => void
): void {
  if (!(err instanceof ApiError)) {
    push({
      kind: "error",
      message: err instanceof Error ? err.message : "Something went wrong.",
    });
    return;
  }

  const { status, body } = err;
  const friendlyScope = body.scope
    ? body.scope.replace(/_/g, " ").toUpperCase()
    : undefined;

  if (status === 429) {
    push({
      kind: "rate-limit",
      scope: friendlyScope ?? "RATE LIMIT",
      message:
        body.message ??
        "Too many requests. Take a short break before trying again.",
      retryAfterMs: body.retryAfterMs,
    });
    return;
  }

  if (status === 403 && body.error === "session_mismatch") {
    push({
      kind: "session",
      scope: "SESSION",
      message:
        body.message ??
        "This match belongs to a different session. Start a new match.",
    });
    return;
  }

  if (status === 404) {
    push({
      kind: "error",
      scope: "NOT FOUND",
      message: body.message ?? body.error ?? "Match not found.",
    });
    return;
  }

  if (status === 409) {
    push({
      kind: "info",
      scope: "OUT OF SYNC",
      message:
        body.message ??
        "The lot moved under you. Pulling fresh state.",
    });
    return;
  }

  if (status === 425) {
    push({
      kind: "info",
      scope: "TOO EARLY",
      message: body.message ?? "Hold on, the clock isn't done.",
    });
    return;
  }

  if (status >= 500) {
    push({
      kind: "error",
      scope: "SERVER",
      message: "Server hiccup. Try again in a moment.",
    });
    return;
  }

  if (status === 0) {
    push({
      kind: "error",
      scope: "NETWORK",
      message: "Network error. Check your connection.",
    });
    return;
  }

  // Default — covers 400 shape errors from Zod, plus other 4xx the user might
  // hit. Zod's body comes back as { success:false, error:{ message:"..." } }
  // already turned into ApiErrorBody.message in the throw above.
  push({
    kind: "error",
    message: body.message ?? body.error ?? `Request failed (${status}).`,
  });
}
