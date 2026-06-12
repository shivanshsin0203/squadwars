"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

type CreateMatchResp = {
  matchId: string;
  formation: string;
  status: string;
  lotsTotal: number;
  llmSeeded?: boolean;
};

export default function HomePage() {
  const router = useRouter();
  const [health, setHealth] = useState<string>("loading…");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((r) => r.json())
      .then((d) => setHealth(`OK (${d.time})`))
      .catch((e) => setHealth(`error: ${String(e)}`));
  }, []);

  async function startMatch() {
    setBusy(true);
    setError(null);
    console.log("[CLIENT:createMatch] requesting POST /api/match");
    const t0 = performance.now();
    try {
      const res = await fetch(`${BACKEND_URL}/api/match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formation: "4-3-3" }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as CreateMatchResp;
      const ms = Math.round(performance.now() - t0);
      console.log(`[CLIENT:createMatch] ${ms}ms → matchId=${data.matchId} llmSeeded=${data.llmSeeded}`);
      router.push(`/auctionroom/${encodeURIComponent(data.matchId)}`);
    } catch (e) {
      console.error("[CLIENT:createMatch] FAILED", e);
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0A0E14",
        color: "#EAEEF5",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        padding: 32,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <h1 style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1, margin: 0 }}>
        SquadWars
      </h1>
      <p style={{ color: "#8B97A8", margin: 0, fontSize: 14 }}>
        Live auction · solo vs AI · 33 lots · €300M budget
      </p>

      <button
        onClick={startMatch}
        disabled={busy}
        style={{
          marginTop: 16,
          padding: "16px 32px",
          fontSize: 18,
          fontWeight: 600,
          color: "#0A0E14",
          background: busy ? "#3DD688" : "#22FF88",
          border: "0.5px solid #22FF88",
          borderRadius: 12,
          cursor: busy ? "wait" : "pointer",
          minWidth: 240,
          fontFamily: "inherit",
        }}
      >
        {busy ? "preparing match…" : "Play"}
      </button>

      {busy && (
        <p style={{ color: "#8B97A8", fontSize: 12, margin: 0 }}>
          server is seeding the AI cap plan via DeepSeek (1–3s)
        </p>
      )}

      {error && (
        <p style={{ color: "#FF3D5A", fontSize: 13, margin: 0 }}>{error}</p>
      )}

      <div
        style={{
          marginTop: 40,
          fontSize: 11,
          color: "#5A6573",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        }}
      >
        backend: {health}
      </div>
    </main>
  );
}
