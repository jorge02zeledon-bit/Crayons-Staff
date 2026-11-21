import { NextResponse } from "next/server";
import { loadState } from "@/lib/schedule";
import { coveringReminders } from "@/lib/notify";
import { sendPush } from "@/lib/push";
import { SCHOOL_TZ } from "@/lib/clock-store";
import { addDays, isoDate } from "@/lib/hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Evening reminder: "Tomorrow you are covering Elementary in Room 102".
 * Scheduled by Vercel Cron (see vercel.json); Vercel sends the CRON_SECRET header.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const state = await loadState();
  const tomorrow = addDays(isoDate(new Date(), SCHOOL_TZ), 1);
  const reminders = coveringReminders(state, tomorrow);
  let devices = 0; const errors: string[] = [];
  for (const r of reminders) {
    const res = await sendPush([r.teacherId], r.msg);
    devices += res.devices; errors.push(...res.errors);
  }
  return NextResponse.json({ date: tomorrow, people: reminders.length, devices, errors });
}
