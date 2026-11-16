import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSession } from "@/lib/session";
import { findTeacher, loadState } from "@/lib/schedule";
import { appleWalletConfigured } from "@/lib/wallet";

export const metadata: Metadata = { title: "My badge" };
export const dynamic = "force-dynamic";

/** The signed-in person's own badge. The session decides whose; there is no way to view another person's. */
export default async function BadgePage() {
  const session = await getSession();
  if (!session) redirect("/schedule?next=/badge");
  const state = await loadState();
  const t = findTeacher(state, session.teacherId);
  if (!t) redirect("/schedule");
  const pos = state.positions.find((p) => p.id === t.usualPositionId)?.label || "";
  const svg = await QRCode.toString(`CS:${t.badgeCode}`, { type: "svg", margin: 1, errorCorrectionLevel: "H" });
  const wallet = appleWalletConfigured();
  return (
    <main className="page">
      <header className="topbar no-print"><a className="btn btn-sm btn-ghost" href="/schedule">‹ Back</a><h1 className="title" style={{ fontSize: 20 }}>My badge</h1></header>
      <div className="badge-card badge-card-lg">
        <img className="badge-logo" src="/logo.png" alt="" />
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="bname">{t.name}</div>
        <div className="bsub">{pos}{pos ? " · " : ""}{state.settings.schoolName}</div>
        <div className="bcode">{t.badgeCode}</div>
      </div>
      <div className="stack no-print" style={{ marginTop: 16 }}>
        {wallet ? (
          <a className="btn btn-primary btn-block btn-login" href="/api/wallet/apple">Add to Apple Wallet</a>
        ) : (
          <div className="notice">Apple Wallet isn't switched on for this site yet. The office can enable it by adding the Apple pass certificate in Vercel (see the README). Until then, keep this page handy: on an iPhone tap Share, then <strong>Add to Home Screen</strong>, and it opens straight to your badge.</div>
        )}
        <p className="hint">Hold the code up to the kiosk camera at the front office to clock in, start or end a break, and clock out. This badge is yours only; it signs in nobody else.</p>
        <a className="btn btn-outline btn-block" href="javascript:window.print()">Print this badge</a>
      </div>
    </main>
  );
}
