"use client";
import { useCallback, useEffect, useState } from "react";

type Punch = { id: string; type: "in" | "break_start" | "break_end" | "out"; at: string; source: string };
type Status = {
  teacher: { id: string; name: string } | null; tz: string; state: "off" | "working" | "break";
  since: string | null; stale: boolean; today: Punch[]; allowed: Punch["type"][]; error?: string;
};
const LABEL: Record<Punch["type"], string> = { in: "Clock in", break_start: "Start break", break_end: "End break", out: "Clock out" };
const PAST: Record<Punch["type"], string> = { in: "Clocked in", break_start: "Break started", break_end: "Back from break", out: "Clocked out" };
const STATE_TEXT = { off: "Not clocked in", working: "Working", break: "On break" };

function fmt(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function elapsed(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export function ClockPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/clock", { credentials: "same-origin" });
    if (r.status === 401) { location.href = "/schedule?next=/clock"; return; }
    setStatus(await r.json());
  }, []);
  useEffect(() => { load(); const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, [load]);

  async function punch(type: Punch["type"]) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/clock", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(j.error || "Something went wrong."); await load(); return; }
    setStatus(j);
    setMsg(`${PAST[type]} at ${fmt(new Date().toISOString(), j.tz)}.`);
  }

  if (!status) return <p className="muted" style={{ marginTop: 16 }}>Loading…</p>;
  const stateCls = status.state === "working" ? "is-working" : status.state === "break" ? "is-break" : "";
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <p className="muted">{status.teacher?.name}</p>
      <section className={`card status-big ${stateCls}`} aria-live="polite">
        <div className="state">{STATE_TEXT[status.state]}</div>
        {status.since && status.state !== "off" ? <div className="since">since {fmt(status.since, status.tz)} · {elapsed(status.since)}</div> : null}
        {status.stale ? <div className="notice warn">Your last shift was never clocked out. Tell the office so they can fix it, then clock in for today.</div> : null}
      </section>
      {msg ? <div className="notice ok" role="status">{msg}</div> : null}
      <div className="stack">
        {status.allowed.map((t) => (
          <button key={t} className={`btn btn-xl ${t === "in" || t === "break_end" ? "btn-primary" : "btn-outline"}`} disabled={busy} onClick={() => punch(t)}>{LABEL[t]}</button>
        ))}
      </div>
      <section>
        <p className="kicker">Today</p>
        {status.today.length ? (
          <ul className="punch-list">
            {status.today.map((p) => (<li key={p.id}><span>{PAST[p.type]}</span><span className="t">{fmt(p.at, status.tz)}</span></li>))}
          </ul>
        ) : <p className="muted">Nothing recorded yet today.</p>}
      </section>
      <p className="hint">Break time is taken off your hours. Forgot a punch? The office can add it.</p>
      <footer className="logout-foot">
        <button className="btn btn-outline btn-block" onClick={async () => { await fetch("/api/logout", { method: "POST", credentials: "same-origin" }); location.href = "/schedule"; }}>Log out</button>
      </footer>
    </div>
  );
}
