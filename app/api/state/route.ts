import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadState, saveState, teacherView, validateIncoming, type ScheduleState } from "@/lib/schedule";
import { storageMode } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/state: the schedule document. Admins get everything; teachers get their published view. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const s = await loadState();
  if (session.role === "admin") return NextResponse.json({ me: session.teacherId, role: "admin", state: s, storage: storageMode() });
  return NextResponse.json({ me: session.teacherId, role: "teacher", state: teacherView(s, session.teacherId), storage: storageMode() });
}

/** PUT /api/state: admins save the whole document (the schedule builder works on it in the browser). */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const incoming = await request.json().catch(() => null);
  if (!validateIncoming(incoming)) return NextResponse.json({ error: "That does not look like a schedule document." }, { status: 400 });
  const current = await loadState();
  // Badge codes are managed on the server; keep them whatever the browser sent.
  const badges = new Map(current.teachers.map((t) => [t.id, t.badgeCode]));
  const next: ScheduleState = { ...incoming, teachers: incoming.teachers.map((t) => ({ ...t, badgeCode: badges.get(t.id) || t.badgeCode })) };
  // The signed-in admin must stay an active admin.
  const me = next.teachers.find((t) => t.id === session.teacherId);
  if (!me || me.role !== "admin" || me.active === false) return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
  await saveState(next);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
