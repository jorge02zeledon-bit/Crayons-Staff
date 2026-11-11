import { NextResponse } from "next/server";
import { authConfigured, checkMasterPassword, issueSession, SESSION_COOKIE } from "@/lib/auth";
import { findTeacher, loadState } from "@/lib/schedule";
import { cookieOptions } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/login { teacherId, pin } or { teacherId, master }.
 * `master` is ADMIN_PASSWORD; it signs in any admin account even if the PIN was forgotten.
 */
export async function POST(request: Request) {
  if (!authConfigured()) return NextResponse.json({ error: "AUTH_SECRET is not set on the server." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const s = await loadState();
  const t = findTeacher(s, String(body.teacherId || ""));
  if (!t || t.active === false) return NextResponse.json({ error: "That person is not active." }, { status: 401 });
  const pinOk = typeof body.pin === "string" && body.pin.trim() === String(t.pin);
  const masterOk = t.role === "admin" && typeof body.master === "string" && checkMasterPassword(body.master);
  if (!pinOk && !masterOk) return NextResponse.json({ error: "That PIN does not match. Try again." }, { status: 401 });
  const session = issueSession(t.id, t.role === "admin" ? "admin" : "teacher");
  const res = NextResponse.json({ ok: true, teacherId: t.id, role: t.role });
  res.cookies.set(SESSION_COOKIE, session.value, cookieOptions(session.maxAge, new URL(request.url).protocol === "https:"));
  return res;
}
