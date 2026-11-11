import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ClockPanel } from "@/components/ClockPanel";

export const metadata: Metadata = { title: "Break clock" };
export const dynamic = "force-dynamic";

/** The teacher's own clock: open from the schedule, or by scanning the break-room poster. */
export default async function ClockPage() {
  const session = await getSession();
  if (!session) redirect("/schedule/?next=/clock");
  return (
    <main className="page">
      <header className="topbar">
        <a className="btn btn-sm btn-ghost" href="/schedule/">‹ My schedule</a>
        <h1 className="title" style={{ fontSize: 20 }}>Break clock</h1>
      </header>
      <ClockPanel />
    </main>
  );
}
