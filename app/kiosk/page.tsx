import type { Metadata } from "next";
import { kioskPasswordConfigured } from "@/lib/auth";
import { kioskUnlocked } from "@/lib/session";
import { SCHOOL_NAME } from "@/lib/schedule";
import { Kiosk } from "@/components/Kiosk";

export const metadata: Metadata = { title: "Kiosk" };
export const dynamic = "force-dynamic";

/** The tablet at the office. Unlock once with the kiosk password; it stays unlocked for 90 days. */
export default async function KioskPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  if (!(await kioskUnlocked())) {
    return (
      <main className="page">
        <p className="kicker">{SCHOOL_NAME}</p>
        <h1>Unlock the kiosk</h1>
        {!kioskPasswordConfigured() ? (
          <p className="notice warn" style={{ marginTop: 12 }}>No kiosk password is set. Add KIOSK_PASSWORD (or ADMIN_PASSWORD) in Vercel and redeploy.</p>
        ) : (
          <form method="post" action="/kiosk/login" className="stack" style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="password">Kiosk password</label>
              <input className="input" id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
              {sp.error ? <p className="errors" role="alert">That password is not right.</p> : null}
            </div>
            <button className="btn btn-primary btn-block" type="submit">Unlock for 90 days</button>
            <p className="hint">Use this on the tablet by the front office. Admins who are signed in can also open it without the password.</p>
          </form>
        )}
      </main>
    );
  }
  return <Kiosk schoolName={SCHOOL_NAME} />;
}
