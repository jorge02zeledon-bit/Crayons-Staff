import { NextResponse } from "next/server";
import { loadState, publicStaff } from "@/lib/schedule";
import { authConfigured } from "@/lib/auth";
import { storageMode } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/staff: names for the sign-in screen (PINs only when demo PINs are on). */
export async function GET() {
  const s = await loadState();
  return NextResponse.json({
    schoolName: s.settings.schoolName,
    adminName: s.settings.adminName,
    staff: publicStaff(s),
    authConfigured: authConfigured(),
    storage: storageMode(),
  });
}
