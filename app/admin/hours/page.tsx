import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/session";
import { loadState } from "@/lib/schedule";
import { punchesBetween, SCHOOL_TZ } from "@/lib/clock-store";
import { formatMinutes, hoursDecimal, localTime, PUNCH_LABEL } from "@/lib/clock";
import { addDays, groupByPerson, isISODate, isoDate, weekStart } from "@/lib/hours";
import { storageMode } from "@/lib/store";
import { PunchFixer } from "@/components/PunchFixer";

export const metadata: Metadata = { title: "Hours" };
export const dynamic = "force-dynamic";

type Params = { from?: string; to?: string; who?: string };

export default async function HoursPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!(await isAdmin())) redirect("/schedule?next=/admin/hours");
  const sp = await searchParams;
  const today = isoDate(new Date(), SCHOOL_TZ);
  const from = isISODate(sp.from) ? sp.from : weekStart(today);
  const to = isISODate(sp.to) ? sp.to : today;
  const state = await loadState();
  const names = new Map(state.teachers.map((t) => [t.id, t.name]));
  const punches = (await punchesBetween(from, to)).filter((p) => !sp.who || p.teacherId === sp.who);
  const people = groupByPerson(punches, SCHOOL_TZ).sort((a, b) => (names.get(a.teacherId) || "").localeCompare(names.get(b.teacherId) || ""));
  const totalWorked = people.reduce((n, p) => n + p.workedMin, 0);
  const totalBreak = people.reduce((n, p) => n + p.breakMin, 0);
  const issues = people.reduce((n, p) => n + p.issues, 0);
  const q = new URLSearchParams({ from, to, ...(sp.who ? { who: sp.who } : {}) });
  const presets = [
    ["This week", weekStart(today), today],
    ["Last week", addDays(weekStart(today), -7), addDays(weekStart(today), -1)],
    ["Last 14 days", addDays(today, -13), today],
    ["This month", today.slice(0, 8) + "01", today],
  ];
  const storage = storageMode();

  return (
    <main className="page-wide">
      <header className="topbar"><a className="btn btn-sm btn-ghost" href="/schedule#admin-menu">‹ Admin</a><h1 className="title" style={{ fontSize: 20 }}>Hours worked</h1><a className="btn btn-sm btn-outline" href={`/admin/hours.csv?${q}`}>Download CSV</a></header>
      {storage !== "redis" ? <p className="notice warn" style={{ marginTop: 12 }}>{storage === "temporary" ? "No database is connected: punches are kept in temporary server storage and are lost on each deploy. Add Upstash Redis in Vercel (Storage tab) and redeploy." : "Local file storage (.data/)."}</p> : null}
      <form className="filters" method="get" style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="from">From</label><input className="input" type="date" id="from" name="from" defaultValue={from} /></div>
        <div className="field"><label htmlFor="to">To</label><input className="input" type="date" id="to" name="to" defaultValue={to} /></div>
        <div className="field"><label htmlFor="who">Person</label>
          <select className="select" id="who" name="who" defaultValue={sp.who || ""}><option value="">Everyone</option>{state.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <button className="btn btn-primary" type="submit">Show</button>
      </form>
      <div className="row-actions" style={{ marginTop: 10 }}>
        {presets.map(([label, f, t]) => <a key={label} className="btn btn-sm btn-outline" href={`/admin/hours?from=${f}&to=${t}${sp.who ? `&who=${sp.who}` : ""}`}>{label}</a>)}
      </div>

      <section style={{ marginTop: 20 }}>
        <p className="kicker">Totals {from} to {to}</p>
        <div className="table-wrap"><table className="hours">
          <thead><tr><th>Name</th><th className="num">Days</th><th className="num">Breaks</th><th className="num">Break time</th><th className="num">Hours worked</th><th className="num">Decimal</th><th>Needs a look</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.teacherId}>
                <td><a href={`/admin/hours?from=${from}&to=${to}&who=${p.teacherId}`}>{names.get(p.teacherId) || p.teacherId}</a></td>
                <td className="num">{p.days.length}</td>
                <td className="num">{p.days.reduce((n, d) => n + d.breaks, 0)}</td>
                <td className="num">{formatMinutes(p.breakMin)}</td>
                <td className="num"><strong>{formatMinutes(p.workedMin)}</strong></td>
                <td className="num">{hoursDecimal(p.workedMin)}</td>
                <td>{p.issues ? <span className="issue">{p.issues} issue{p.issues === 1 ? "" : "s"}</span> : ""}</td>
              </tr>
            ))}
            {!people.length ? <tr><td colSpan={7} className="muted">No punches in this range.</td></tr> : null}
            {people.length ? <tr className="total"><td>Total</td><td className="num"></td><td className="num"></td><td className="num">{formatMinutes(totalBreak)}</td><td className="num">{formatMinutes(totalWorked)}</td><td className="num">{hoursDecimal(totalWorked)}</td><td>{issues ? `${issues} to check` : ""}</td></tr> : null}
          </tbody>
        </table></div>
      </section>

      <section style={{ marginTop: 24 }}>
        <p className="kicker">Day by day</p>
        <div className="table-wrap"><table className="hours">
          <thead><tr><th>Date</th><th>Name</th><th>In</th><th>Out</th><th className="num">Break</th><th className="num">Worked</th><th>Punches</th></tr></thead>
          <tbody>
            {people.flatMap((p) => p.days.map((d) => (
              <tr key={p.teacherId + d.date}>
                <td className="num">{d.date}</td>
                <td>{names.get(p.teacherId) || p.teacherId}</td>
                <td className="num">{d.firstIn ? localTime(d.firstIn, SCHOOL_TZ) : ""}</td>
                <td className="num">{d.lastOut ? localTime(d.lastOut, SCHOOL_TZ) : d.open ? <span className="issue">still open</span> : ""}</td>
                <td className="num">{formatMinutes(d.breakMin)}</td>
                <td className="num">{formatMinutes(d.workedMin)}</td>
                <td>
                  {d.punches.map((x) => <span key={x.id} style={{ display: "inline-block", marginRight: 8 }}>{PUNCH_LABEL[x.type]} {localTime(x.at, SCHOOL_TZ)}{x.source === "admin" ? " (added by office)" : ""}</span>)}
                  {d.issues.map((i) => <div key={i} className="issue">⚠ {i}</div>)}
                </td>
              </tr>
            )))}
            {!people.length ? <tr><td colSpan={7} className="muted">Nothing yet.</td></tr> : null}
          </tbody>
        </table></div>
      </section>

      <PunchFixer people={state.teachers.filter((t) => t.active !== false).map((t) => ({ id: t.id, name: t.name }))} punches={punches.map((p) => ({ id: p.id, teacherId: p.teacherId, type: p.type, at: p.at }))} names={Object.fromEntries(names)} tz={SCHOOL_TZ} />
    </main>
  );
}
