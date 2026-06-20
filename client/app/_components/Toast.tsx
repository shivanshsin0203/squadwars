"use client";

/**
 * SquadWars toast system.
 *
 * Top-right stack. Max 3 visible, FIFO eviction. 4s auto-dismiss + manual
 * close button (rate-limit toasts stay longer — see `push()` for the duration
 * rule). Honours the design system in client/design.md:
 *
 *   - Whistle accent (--whistle #E63946) on every error / rate-limit / session
 *     toast; chalk accent (--chalk #F2EDE0) on info.
 *   - sw-tick-in entrance, sw-pulse live dot.
 *   - Saira Condensed eyebrow, Inter body, JetBrains Mono countdown.
 *   - Corner ticks on every toast (broadcast detail).
 *
 * Usage:
 *   import { useToast } from "@/app/_components/Toast";
 *
 *   const { push } = useToast();
 *   push({ kind: "rate-limit", scope: "RATE LIMIT", message: "Too many matches.", retryAfterMs: 7200000 });
 *
 * Mount ToastProvider once near the root of the app (see app/layout.tsx).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastKind = "error" | "rate-limit" | "session" | "info";

export type ToastInput = {
  /** Body line. Single sentence; rendered in Inter 13px. */
  message: string;
  /** Visual treatment. Defaults to "error". */
  kind?: ToastKind;
  /** Short eyebrow above the message (e.g. "BID REJECTED", "RATE LIMIT").
   *  Falls back to a kind-default if omitted. */
  scope?: string;
  /** When set on a rate-limit toast, the body shows a JetBrains-Mono countdown
   *  that ticks down to zero, and the toast lifetime extends accordingly
   *  (capped to 10s so it can't dominate the screen). */
  retryAfterMs?: number;
  /** Override the default 4s lifetime. */
  durationMs?: number;
};

type Toast = ToastInput & {
  id: string;
  createdAt: number;
};

type ToastCtx = {
  push: (t: ToastInput) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS = 4000;
const MAX_TOAST_LIFETIME_MS = 10_000;
const MIN_TOAST_LIFETIME_MS = 4_000;

// ─────────────────────────── provider ───────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      clearTimer(id);
    },
    [clearTimer]
  );

  const push = useCallback(
    (t: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const toast: Toast = {
        id,
        createdAt: Date.now(),
        ...t,
        kind: t.kind ?? "error",
      };

      setToasts((prev) => {
        const next = [...prev, toast];
        // FIFO eviction at MAX_TOASTS.
        while (next.length > MAX_TOASTS) {
          const evicted = next.shift();
          if (evicted) clearTimer(evicted.id);
        }
        return next;
      });

      // Rate-limit toasts hold the toast for retryAfterMs but clamp to
      // [MIN, MAX] so they're readable but don't dominate the screen.
      const duration =
        toast.kind === "rate-limit" && toast.retryAfterMs
          ? Math.min(
              MAX_TOAST_LIFETIME_MS,
              Math.max(MIN_TOAST_LIFETIME_MS, toast.retryAfterMs)
            )
          : t.durationMs ?? DEFAULT_DURATION_MS;

      const handle = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, handle);
    },
    [dismiss, clearTimer]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─────────────────────────── stack + item ───────────────────────────

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <>
      <style>{TOAST_CSS}</style>
      <div className="sw-toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </div>
    </>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const kind = toast.kind ?? "error";
  const scope = toast.scope ?? scopeForKind(kind);
  const showCountdown = kind === "rate-limit" && typeof toast.retryAfterMs === "number";
  return (
    <div className={`sw-toast sw-toast-${kind}`} role="status">
      <span className="sw-tick-tl" />
      <span className="sw-tick-tr" />
      <span className="sw-tick-bl" />
      <span className="sw-tick-br" />
      <div className="sw-toast-head">
        <span className="sw-toast-dot" />
        <span className="sw-toast-eyebrow">{scope}</span>
        <button
          className="sw-toast-close"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          type="button"
        >
          ×
        </button>
      </div>
      <div className="sw-toast-body">{toast.message}</div>
      {showCountdown && <Countdown ms={toast.retryAfterMs!} />}
    </div>
  );
}

function Countdown({ ms }: { ms: number }) {
  const [remaining, setRemaining] = useState(ms);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, ms - (Date.now() - start));
      setRemaining(left);
      if (left === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [ms]);
  return <div className="sw-toast-countdown">RETRY IN {formatDuration(remaining)}</div>;
}

// ─────────────────────────── utils ───────────────────────────

function scopeForKind(kind: ToastKind): string {
  switch (kind) {
    case "rate-limit":
      return "RATE LIMIT";
    case "session":
      return "SESSION";
    case "info":
      return "NOTICE";
    default:
      return "ERROR";
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

// ─────────────────────────── styles ───────────────────────────

const TOAST_CSS = `

.sw-toast-stack {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
  max-width: 360px;
}
.sw-toast {
  position: relative;
  pointer-events: auto;
  background: #131A24;
  border-radius: 10px;
  padding: 12px 14px 14px 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  animation: sw-toast-in 280ms cubic-bezier(0.4, 0, 0.2, 1) both;
  color: #EFEFEF;
  min-width: 260px;
  font-family: var(--font-inter), system-ui, sans-serif;
}
.sw-toast-error,
.sw-toast-rate-limit,
.sw-toast-session {
  border: 1px solid rgba(230, 57, 70, 0.42);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(230, 57, 70, 0.10);
}
.sw-toast-info {
  border: 1px solid rgba(242, 237, 224, 0.22);
}
.sw-toast-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.sw-toast-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #E63946;
  box-shadow: 0 0 8px #E63946;
  animation: sw-toast-pulse 1.4s ease-in-out infinite;
  flex-shrink: 0;
}
.sw-toast-info .sw-toast-dot {
  background: #F2EDE0;
  box-shadow: 0 0 8px rgba(242, 237, 224, 0.45);
}
.sw-toast-eyebrow {
  font-family: var(--font-saira), system-ui, sans-serif;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #9099A8;
  flex: 1;
}
.sw-toast-error .sw-toast-eyebrow,
.sw-toast-rate-limit .sw-toast-eyebrow,
.sw-toast-session .sw-toast-eyebrow {
  color: #E63946;
}
.sw-toast-close {
  background: transparent;
  border: 0;
  color: #5C6573;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  transition: color 120ms ease;
  font-family: inherit;
}
.sw-toast-close:hover {
  color: #EFEFEF;
}
.sw-toast-body {
  font-size: 13px;
  line-height: 1.45;
  color: #EFEFEF;
}
.sw-toast-countdown {
  margin-top: 8px;
  font-family: var(--font-jetbrains), ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: #E63946;
}
.sw-toast .sw-tick-tl,
.sw-toast .sw-tick-tr,
.sw-toast .sw-tick-bl,
.sw-toast .sw-tick-br {
  position: absolute;
  width: 8px;
  height: 8px;
  pointer-events: none;
}
.sw-toast .sw-tick-tl { top: 0; left: 0;  border-top: 1px solid rgba(255,255,255,0.10); border-left: 1px solid rgba(255,255,255,0.10); }
.sw-toast .sw-tick-tr { top: 0; right: 0; border-top: 1px solid rgba(255,255,255,0.10); border-right: 1px solid rgba(255,255,255,0.10); }
.sw-toast .sw-tick-bl { bottom: 0; left: 0;  border-bottom: 1px solid rgba(255,255,255,0.10); border-left: 1px solid rgba(255,255,255,0.10); }
.sw-toast .sw-tick-br { bottom: 0; right: 0; border-bottom: 1px solid rgba(255,255,255,0.10); border-right: 1px solid rgba(255,255,255,0.10); }
@keyframes sw-toast-in {
  0%   { transform: translateY(-12px); opacity: 0; clip-path: inset(0 0 100% 0); }
  100% { transform: translateY(0);     opacity: 1; clip-path: inset(0 0 0% 0); }
}
@keyframes sw-toast-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1.15); }
}
@media (max-width: 540px) {
  .sw-toast-stack {
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
  }
  .sw-toast {
    min-width: 0;
  }
}
`;
