import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { allowedActions, localDate, newPunchId, summarizeDays, type PunchType } from "@/lib/clock";
import { addPunch, recentPunchesFor, SCHOOL_TZ, statusOf } from "@/lib/clock-store";
import { weekStart } from "@/lib/hours";
import { findTeacher, loadState } from "@/lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: PunchType[] = ["in", "break_start", "break_end", "out"];

/** GET /api/clock: the signed-in person's current state and today's punches. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const s = await loadState();
  const t = findTeacher(s, session.teacherId);
  const status = await statusOf(session.teacherId);
  // Hours worked so far this week (Monday to today), for the dashboard tile.
  const now = new Date();
  const ws = weekStart(localDate(now.toISOString(), SCHOOL_TZ));
  const recent = (await recentPunchesFor(session.teacherId, now)).filter((p) => localDate(p.at, SCHOOL_TZ) >= ws);
  const weekWorkedMin = summarizeDays(recent, SCHOOL_TZ).reduce((n, d) => n + d.workedMin, 0);
  return NextResponse.json({ teacher: t ? { id: t.id, name: t.name } : null, tz: SCHOOL_TZ, ...status, allowed: allowedActions(status.state), weekWorkedMin });
}

/** POST /api/clock { type }: punch for the signed-in person from their own phone. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const type = body.type as PunchType;
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const status = await statusOf(session.teacherId);
  if (!allowedActions(status.state).includes(type)) return NextResponse.json({ error: "That does not fit what you are doing right now. Refresh and try again.", state: status.state }, { status: 409 });
  await addPunch({ id: newPunchId(), teacherId: session.teacherId, type, at: new Date().toISOString(), source: "phone" });
  const after = await statusOf(session.teacherId);
  return NextResponse.json({ ok: true, ...after, allowed: allowedActions(after.state), tz: SCHOOL_TZ });
}
