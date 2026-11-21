import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { devicesFor, isExpoPushToken, registerDevice, unregisterDevice } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The mobile app registers its push token for the signed-in person. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  if (!isExpoPushToken(b.token)) return NextResponse.json({ error: "Not a valid push token." }, { status: 400 });
  await registerDevice(session.teacherId, b.token, String(b.platform || "unknown").slice(0, 20));
  return NextResponse.json({ ok: true, devices: (await devicesFor(session.teacherId)).length });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  if (isExpoPushToken(b.token)) await unregisterDevice(session.teacherId, b.token);
  return NextResponse.json({ ok: true });
}
