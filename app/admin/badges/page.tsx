import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { isAdmin } from "@/lib/session";
import { loadState } from "@/lib/schedule";

export const metadata: Metadata = { title: "Badges" };
export const dynamic = "force-dynamic";

/** Printable QR badges (one per person) and the break-room poster that opens the phone clock. */
export default async function BadgesPage() {
  if (!(await isAdmin())) redirect("/schedule/?next=/admin/badges");
  const state = await loadState();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const clockUrl = `${proto}://${host}/clock`;
  const posterSvg = await QRCode.toString(clockUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const people = state.teachers.filter((t) => t.active !== false);
  const cards = await Promise.all(people.map(async (t) => ({ t, svg: await QRCode.toString(`CS:${t.badgeCode}`, { type: "svg", margin: 1, errorCorrectionLevel: "H" }) })));
  const pos = new Map(state.positions.map((p) => [p.id, p.label]));

  return (
    <main className="page-wide">
      <header className="topbar no-print"><a className="btn btn-sm btn-ghost" href="/schedule/#admin-menu">‹ Admin</a><h1 className="title" style={{ fontSize: 20 }}>Badges and QR codes</h1><a className="btn btn-sm btn-primary" href="javascript:window.print()">Print</a></header>
      <p className="notice no-print" style={{ marginTop: 12 }}>Print this page on card stock and cut out one badge per person. The kiosk reads the QR code with its camera; a barcode or card reader works too if you print the code as a barcode or store it on an NFC card. The poster goes by the break room: scanning it with a phone opens the personal clock.</p>

      <section style={{ marginTop: 20 }}>
        <p className="kicker">Break-room poster</p>
        <div className="poster">
          <div className="title">Taking a break?</div>
          <div dangerouslySetInnerHTML={{ __html: posterSvg }} />
          <div>Scan with your phone to clock out and back in.</div>
          <div className="bcode">{clockUrl}</div>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <p className="kicker">Staff badges</p>
        <div className="badges">
          {cards.map(({ t, svg }) => (
            <div className="badge-card" key={t.id}>
              <div dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="bname">{t.name}</div>
              <div className="bsub">{pos.get(t.usualPositionId) || ""} · {state.settings.schoolName}</div>
              <div className="bcode">{t.badgeCode}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
