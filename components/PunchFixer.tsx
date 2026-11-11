"use client";
import { useState } from "react";

type P = { id: string; teacherId: string; type: string; at: string };
const TYPES = [["in", "Clock in"], ["break_start", "Start break"], ["break_end", "End break"], ["out", "Clock out"]];

/** Office corrections: add a punch someone forgot, or remove a wrong one. */
export function PunchFixer({ people, punches, names, tz }: { people: { id: string; name: string }[]; punches: P[]; names: Record<string, string>; tz: string }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const date = String(fd.get("date")), time = String(fd.get("time"));
    // Interpret the typed date and time in the school's time zone.
    const at = zonedToISO(date, time, tz);
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/punches", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId: fd.get("teacherId"), type: fd.get("type"), at, note: fd.get("note") }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(j.error || "Could not add that."); return; }
    location.reload();
  }
  async function remove(p: P) {
    if (!window.confirm(`Remove "${p.type}" for ${names[p.teacherId] || p.teacherId} at ${fmt(p.at)}?`)) return;
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date(p.at)).slice(0, 7);
    const r = await fetch("/api/admin/punches", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, month }) });
    if (r.ok) location.reload(); else setMsg("Could not remove that.");
  }

  return (
    <section style={{ marginTop: 28 }}>
      <p className="kicker">Fix a punch</p>
      <form className="card" style={{ padding: 16, display: "grid", gap: 12 }} onSubmit={add}>
        <div className="filters">
          <div className="field"><label htmlFor="px-who">Person</label><select className="select" id="px-who" name="teacherId" required>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label htmlFor="px-type">What</label><select className="select" id="px-type" name="type">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="px-date">Date</label><input className="input" id="px-date" name="date" type="date" required /></div>
          <div className="field"><label htmlFor="px-time">Time</label><input className="input" id="px-time" name="time" type="time" required /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor="px-note">Note</label><input className="input" id="px-note" name="note" placeholder="Forgot to clock out" /></div>
          <button className="btn btn-primary" type="submit" disabled={busy}>Add punch</button>
        </div>
        {msg ? <p className="notice warn" role="alert">{msg}</p> : null}
      </form>
      {punches.length ? (
        <details style={{ marginTop: 12 }}>
          <summary className="details-summary">Remove a punch in this range ({punches.length})</summary>
          <ul className="punch-list" style={{ marginTop: 8 }}>
            {punches.map((p) => (
              <li key={p.id}><span>{names[p.teacherId] || p.teacherId} · {p.type.replace("_", " ")}</span><span className="t">{fmt(p.at)} <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>Remove</button></span></li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** 'YYYY-MM-DD' + 'HH:MM' in a time zone -> ISO instant (two-pass offset correction). */
function zonedToISO(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
    guess += Date.UTC(y, m - 1, d, hh, mm) - asUTC;
  }
  return new Date(guess).toISOString();
}
