import { getJSON, setJSON } from "./store";
import { localDate, monthKey, monthsBetween, sortPunches, statusFor, type Punch } from "./clock";

/** Punches are stored one array per local month: clock:2026-11 */
export const SCHOOL_TZ = process.env.SCHOOL_TZ || "America/New_York";

const key = (month: string) => `clock:${month}`;

export async function punchesForMonth(month: string): Promise<Punch[]> {
  return (await getJSON<Punch[]>(key(month))) ?? [];
}

export async function punchesBetween(from: string, to: string): Promise<Punch[]> {
  const months = monthsBetween(from, to);
  const lists = await Promise.all(months.map(punchesForMonth));
  return sortPunches(lists.flat()).filter((p) => { const d = localDate(p.at, SCHOOL_TZ); return d >= from && d <= to; });
}

export async function addPunch(p: Punch): Promise<void> {
  const k = monthKey(p.at, SCHOOL_TZ);
  const list = await punchesForMonth(k);
  list.push(p);
  await setJSON(key(k), sortPunches(list));
}

export async function deletePunch(id: string, month: string): Promise<boolean> {
  const list = await punchesForMonth(month);
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  await setJSON(key(month), next);
  return true;
}

/** Recent punches for one person (this month and last), for status and the "today" list. */
export async function recentPunchesFor(teacherId: string, now = new Date()): Promise<Punch[]> {
  const thisMonth = monthKey(now.toISOString(), SCHOOL_TZ);
  const prev = new Date(now); prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const lastMonth = monthKey(prev.toISOString(), SCHOOL_TZ);
  const lists = await Promise.all([punchesForMonth(lastMonth), punchesForMonth(thisMonth)]);
  return sortPunches(lists.flat().filter((p) => p.teacherId === teacherId));
}

export async function statusOf(teacherId: string, now = new Date()) {
  const punches = await recentPunchesFor(teacherId, now);
  const today = localDate(now.toISOString(), SCHOOL_TZ);
  return { ...statusFor(punches, now), today: punches.filter((p) => localDate(p.at, SCHOOL_TZ) === today) };
}
