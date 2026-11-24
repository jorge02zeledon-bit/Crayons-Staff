import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

const UPDATED = "November 24, 2026";

/** Plain-language privacy policy for the website and the Crayons Staff app. Public page, no sign-in. */
export default function PrivacyPage() {
  return (
    <main className="page prose">
      <header className="topbar"><a className="btn btn-sm btn-ghost" href="/schedule">‹ Back</a><h1 className="title" style={{ fontSize: 20 }}>Privacy policy</h1></header>
      <div className="card section">
        <p className="muted">Last updated {UPDATED}</p>
        <h2>Who this is for</h2>
        <p>Crayons Staff (the website at crayonstaff.com and the Crayons Staff app for iPhone and Android) is an internal tool for employees of Crayons Christian School. It is used to publish work schedules and to record break times. There is no public sign-up. Accounts are created by the school office for current staff only.</p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Your name and work role</strong>, entered by the school office when your account is created.</li>
          <li><strong>Your schedule</strong>: the days, times, rooms, and positions the office assigns to you.</li>
          <li><strong>Break clock records</strong>: the times you clock in, start and end a break, and clock out, and whether the entry came from the office kiosk or your own phone.</li>
          <li><strong>A badge code</strong>, a random code printed on your staff badge and shown as a QR code, used only to identify you at the clock-in kiosk.</li>
          <li><strong>A sign-in PIN</strong>, stored so the site can check it when you sign in.</li>
          <li><strong>A push notification token</strong>, only if you install the app and allow notifications. It lets the school send you schedule updates and reminders.</li>
        </ul>
        <p>We do not collect your location, contacts, photos, or payment information. The app does not use advertising or analytics trackers, and we do not sell or share your information with anyone for marketing.</p>

        <h2>How it is used</h2>
        <ul>
          <li>To show you where you are working, when, and in what role.</li>
          <li>To let the school office track hours worked and breaks taken for payroll and labor-law records.</li>
          <li>To send you a notification when your published schedule changes, a reminder the day before you cover another age group, and a reminder during a long break.</li>
        </ul>

        <h2>Who can see it</h2>
        <p>School administrators can see every employee's schedule, break records, and reported hours. Employees can see their own schedule and records, plus the published team schedule (names, rooms, and times only). No one outside the school has access, and the school does not share this data with third parties except where required by law.</p>

        <h2>Where it is stored</h2>
        <p>Data is stored by Vercel (hosting) and Upstash (database), both in the United States, over encrypted connections. Camera access on the kiosk is used only to read badge QR codes; no images are saved.</p>

        <h2>Optional features on your phone</h2>
        <ul>
          <li><strong>Face ID or passcode lock</strong>: handled entirely by your phone. The app never sees your face data.</li>
          <li><strong>Apple Wallet badge</strong>: the pass holds your name, role, and badge code. It is generated only for the person signed in.</li>
          <li><strong>Notifications</strong>: you can turn them off at any time in your phone's Settings.</li>
        </ul>

        <h2>Keeping and deleting data</h2>
        <p>Break clock records are kept as long as the school is required to keep time and attendance records. When you leave the school, the office removes your account, which deletes your schedule and sign-in details. To ask what is held about you, or to have it corrected or removed, contact the school office.</p>

        <h2>Children</h2>
        <p>This tool is for adult employees only. It does not collect any information about students.</p>

        <h2>Contact</h2>
        <p>Questions about this policy go to the Crayons Christian School office, or by email to <a href="mailto:office@crayonstaff.com">office@crayonstaff.com</a>.</p>
      </div>
    </main>
  );
}
