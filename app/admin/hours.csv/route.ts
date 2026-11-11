import { isAdmin } from "@/lib/session";
import { loadState } from "@/lib/schedule";
import { punchesBetween, SCHOOL_TZ } from "@/lib/clock-store";
import { groupByPerson, isISODate, isoDate, toCsv, weekStart } from "@/lib/hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response("Admins only.", { status: 403 });
  const u = new URL(request.url);
  const today = isoDate(new Date(), SCHOOL_TZ);
  const from = isISODate(u.searchParams.get("from") || undefined) ? u.searchParams.get("from")! : weekStart(today);
  const to = isISODate(u.searchParams.get("to") || undefined) ? u.searchParams.get("to")! : today;
  const who = u.searchParams.get("who") || "";
  const state = await loadState();
  const names = new Map(state.teachers.map((t) => [t.id, t.name]));
  const punches = (await punchesBetween(from, to)).filter((p) => !who || p.teacherId === who);
  const csv = toCsv(groupByPerson(punches, SCHOOL_TZ), names, SCHOOL_TZ);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hours-${from}-to-${to}.csv"` } });
}
