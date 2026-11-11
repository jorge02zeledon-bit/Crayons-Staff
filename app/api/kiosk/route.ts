import { NextResponse } from "next/server";
import { kioskUnlocked } from "@/lib/session";
import { allowedActions, newPunchId, type Punch, type PunchType } from "@/lib/clock";
import { addPunch, SCHOOL_TZ, statusOf } from "@/lib/clock-store";
import { findByBadge, loadState } from "@/lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: PunchType[] = ["in", "break_start", "break_end", "out"];
const SOURCES: Punch["source"][] = ["kiosk-qr", "kiosk-card", "kiosk-tap"];

/**
 * POST /api/kiosk { badgeCode }               -> who this is and what they can do
 * POST /api/kiosk { badgeCode, type, source } -> record a punch
 * The tablet must be unlocked (kiosk cookie) or an admin must be signed in on it.
 */
export async function POST(request: Request) {
  if (!(await kioskUnlocked())) return NextResponse.json({ error: "This tablet is locked. Unlock it with the kiosk password." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const code = String(body.badgeCode || "").replace(/^CS:/i, "").trim();
  if (!code) return NextResponse.json({ error: "No badge code." }, { status: 400 });
  const s = await loadState();
  const t = findByBadge(s, code);
  if (!t) return NextResponse.json({ error: "That badge is not recognized." }, { status: 404 });
  const status = await statusOf(t.id);
  if (!body.type) {
    return NextResponse.json({ teacher: { id: t.id, name: t.name }, tz: SCHOOL_TZ, ...status, allowed: allowedActions(status.state) });
  }
  const type = body.type as PunchType;
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (!allowedActions(status.state).includes(type)) return NextResponse.json({ error: "That does not fit their current state. Scan again.", state: status.state }, { status: 409 });
  const source = SOURCES.includes(body.source) ? (body.source as Punch["source"]) : "kiosk-tap";
  await addPunch({ id: newPunchId(), teacherId: t.id, type, at: new Date().toISOString(), source });
  const after = await statusOf(t.id);
  return NextResponse.json({ ok: true, teacher: { id: t.id, name: t.name }, tz: SCHOOL_TZ, ...after, allowed: allowedActions(after.state) });
}
