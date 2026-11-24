import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support" };

/** Support page for the App Store listing. Public, no sign-in. */
export default function SupportPage() {
  return (
    <main className="page prose">
      <header className="topbar"><a className="btn btn-sm btn-ghost" href="/schedule">‹ Back</a><h1 className="title" style={{ fontSize: 20 }}>Support</h1></header>
      <div className="card section">
        <h2>Crayons Staff</h2>
        <p>Crayons Staff is the scheduling and break clock app for employees of Crayons Christian School.</p>
        <h2>Signing in</h2>
        <p>Pick your name and enter the PIN the office gave you. If you forgot your PIN or your name is missing, ask the school office; they can reset it from the Staff page.</p>
        <h2>The break clock</h2>
        <p>Scan your badge at the front office kiosk, or open the clock on your own phone from the app menu. If a punch looks wrong, tell the office; administrators can correct it on the Hours page.</p>
        <h2>Notifications</h2>
        <p>The app sends a note when your published schedule changes, a reminder the day before you cover another age group, and a check-in during a long break. Turn them on or off in your phone&apos;s Settings under Crayons Staff.</p>
        <h2>Contact</h2>
        <p>Email <a href="mailto:office@crayonstaff.com">office@crayonstaff.com</a> or speak to the school office.</p>
        <p><a href="/privacy">Privacy policy</a></p>
      </div>
    </main>
  );
}
