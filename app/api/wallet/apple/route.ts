import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findTeacher, loadState } from "@/lib/schedule";
import { appleWalletConfigured, buildApplePass } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/wallet/apple: the signed-in person's own badge as an Apple Wallet pass. Nobody else's. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!appleWalletConfigured()) return NextResponse.json({ error: "Apple Wallet is not set up on this site yet." }, { status: 503 });
  const state = await loadState();
  const t = findTeacher(state, session.teacherId);
  if (!t || !t.badgeCode) return NextResponse.json({ error: "No badge for this account." }, { status: 404 });
  try {
    const u = new URL(request.url);
    const origin = `${request.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")}://${request.headers.get("x-forwarded-host") || u.host}`;
    const buf = await buildApplePass(t, state, origin);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${t.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-badge.pkpass"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("pass generation failed", err);
    return NextResponse.json({ error: "Could not build the pass. Check the Apple Wallet certificate settings." }, { status: 500 });
  }
}
