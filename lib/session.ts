import { cookies } from "next/headers";
import { KIOSK_COOKIE, SESSION_COOKIE, verifyKiosk, verifySession, type Session } from "./auth";

/** Server-side helpers for route handlers and pages. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}
export async function isAdmin(): Promise<Session | null> {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}
export async function kioskUnlocked(): Promise<boolean> {
  const jar = await cookies();
  if (verifyKiosk(jar.get(KIOSK_COOKIE)?.value)) return true;
  return !!(await isAdmin());
}
export function cookieOptions(maxAge: number, secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge };
}
