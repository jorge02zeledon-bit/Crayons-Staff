import Core from "../public/s/core.js";
import { sendPush } from "./push.ts";
import type { ScheduleState } from "./schedule.ts";

/**
 * What to tell people when the schedule changes, and the evening-before reminder.
 * Pure helpers return the messages; the route handlers send them.
 */
type Snapshot = { teacherId: string; date: string; start: string; end: string; area: string; locationId: string; positionId: string };

function snap(a: Record<string, unknown>): Snapshot | null {
  const p = a.published as Snapshot | null | undefined;
  return p ? p : null;
}

/** People whose published shifts differ between two versions of the document. */
export function changedTeachers(before: ScheduleState, after: ScheduleState): string[] {
  const sig = (s: ScheduleState) => {
    const m = new Map<string, string[]>();
    for (const a of s.assignments) {
      const p = snap(a); if (!p) continue;
      (m.get(p.teacherId) ?? m.set(p.teacherId, []).get(p.teacherId)!).push([a.id, p.date, p.start, p.end, p.area, p.locationId, p.positionId].join("|"));
    }
    for (const v of m.values()) v.sort();
    return m;
  };
  const a = sig(before), b = sig(after);
  const ids = new Set([...a.keys(), ...b.keys()]);
  return [...ids].filter((id) => JSON.stringify(a.get(id) ?? []) !== JSON.stringify(b.get(id) ?? []));
}

export async function notifyPublished(before: ScheduleState, after: ScheduleState) {
  const ids = changedTeachers(before, after);
  if (!ids.length) return { devices: 0, errors: [], people: 0 };
  const r = await sendPush(ids, { title: "Schedule updated", body: `${after.settings.adminName || "The office"} published changes to your schedule. Tap to see this week.`, data: { url: "/schedule" } });
  return { ...r, people: ids.length };
}

/** For a given local date, the people who cover the other area that day, with a message each. */
export function coveringReminders(state: ScheduleState, dateIso: string): { teacherId: string; msg: { title: string; body: string; data: Record<string, unknown> } }[] {
  const teachers = new Map(state.teachers.map((t) => [t.id, t]));
  const locs = new Map(state.locations.map((l) => [l.id, l.name]));
  const out: { teacherId: string; msg: { title: string; body: string; data: Record<string, unknown> } }[] = [];
  const seen = new Set<string>();
  for (const a of state.assignments) {
    const p = snap(a); if (!p || p.date !== dateIso) continue;
    const t = teachers.get(p.teacherId); if (!t || seen.has(t.id)) continue;
    const cov = Core.coverage(t, p);
    if (cov.kind !== "cross") continue;
    seen.add(t.id);
    out.push({ teacherId: t.id, msg: { title: `Tomorrow: ${cov.label}`, body: `${locs.get(p.locationId) || "See your schedule"}, ${Core.formatRange(p.start, p.end)}. Everything you need is on your card.`, data: { url: "/schedule#me" } } });
  }
  return out;
}
