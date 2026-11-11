import { NextResponse } from "next/server";
import { checkKioskPassword, issueKiosk, KIOSK_COOKIE, kioskPasswordConfigured } from "@/lib/auth";
import { cookieOptions } from "@/lib/session";

export const runtime = "nodejs";

/** POST /kiosk/login (form): unlock this tablet for 90 days. */
export async function POST(request: Request) {
  const form = await request.formData();
  const back = new URL("/kiosk", request.url);
  if (!kioskPasswordConfigured() || !checkKioskPassword(String(form.get("password") ?? ""))) {
    back.searchParams.set("error", "1");
    return NextResponse.redirect(back, 303);
  }
  const k = issueKiosk();
  const res = NextResponse.redirect(back, 303);
  res.cookies.set(KIOSK_COOKIE, k.value, cookieOptions(k.maxAge, back.protocol === "https:"));
  return res;
}
