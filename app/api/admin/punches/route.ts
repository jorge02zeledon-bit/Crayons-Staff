import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { newPunchId, type PunchType } from "@/lib/clock";
import { addPunch, deletePunch, punchesBetween } from "@/lib/clock-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: PunchType[] = ["in", "break_start", "break_end", "out"];

/** GET /api/admin/punches?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const u = new URL(request.url);
  const from = u.searchParams.get("from") || "", to = u.searchParams.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)." }, { status: 400 });
  return NextResponse.json({ punches: await punchesBetween(from, to) });
}

/** POST /api/admin/punches { teacherId, type, at (ISO), note }: add a missing punch by hand. */
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const at = new Date(String(b.at || ""));
  if (!b.teacherId || !TYPES.includes(b.type) || isNaN(at.getTime())) return NextResponse.json({ error: "teacherId, type and a valid time are required." }, { status: 400 });
  const punch = { id: newPunchId(), teacherId: String(b.teacherId), type: b.type as PunchType, at: at.toISOString(), source: "admin" as const, note: String(b.note || "").slice(0, 200) };
  await addPunch(punch);
  return NextResponse.json({ ok: true, punch });
}

/** DELETE /api/admin/punches { id, month } */
export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  if (!b.id || !/^\d{4}-\d{2}$/.test(String(b.month || ""))) return NextResponse.json({ error: "id and month are required." }, { status: 400 });
  const ok = await deletePunch(String(b.id), String(b.month));
  return NextResponse.json({ ok });
}
