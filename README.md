# Crayons Staff

Live at **https://crayonstaff.com** (schedule at `/schedule`, break clock at `/clock`, office kiosk at `/kiosk`).

Staff site for the school: a phone-first **schedule** that tells each teacher where to be and whether they are covering the other age group, a **break clock** that teachers use with a QR badge, a card or their own phone, and an **hours report** for the admin team. Built with Next.js and deployed on Vercel, the same way as Crayons Pizza.

## What is where

| URL | Who | What |
| --- | --- | --- |
| `/schedule` | everyone | Sign in with your name and PIN. Teachers see **My Schedule** (today first, then the week, with "Covering Elementary today" bands, who else is in the room, notes from the office). Admins get the week builder, day board, staff and rooms, publishing. |
| `/clock` | teachers | Personal break clock: Clock in, Start break, End break, Clock out, with today's punches. Opens from the schedule header or by scanning the break-room poster. |
| `/kiosk` | the office tablet | Unlock once with the kiosk password. Scans QR badges with the camera, accepts USB/Bluetooth card and barcode readers (they type the code), or a code typed by hand. Shows the person, their state, and big buttons for what they can do. |
| `/admin/hours` | admins | Hours worked per person and per day for any date range, break time, missing punches flagged, CSV download, and a form to add or remove a punch. |
| `/admin/badges` | admins | Printable QR badge for every active person plus the break-room poster. |

## How the break clock works

1. On the **Staff** tab, every person gets a badge code automatically. Open **Menu → Badges and QR codes** and print the page. Cut out the badges (or glue them to ID cards). The same code can be printed as a barcode or written to an NFC card if you prefer a card reader.
2. Put the tablet by the front office, open `/kiosk`, unlock it with `KIOSK_PASSWORD`. It stays unlocked for 90 days. The camera reads badges; a card reader plugged into the tablet works too because it "types" the code.
3. A teacher scans → the kiosk shows their name and state → they tap **Start break**, **End break**, **Clock in** or **Clock out**.
4. The **poster** (same page) goes by the break room. Scanning it with a phone opens `/clock`, where the teacher (signed in once with their PIN) taps the same buttons.
5. Hours = time between clock in and clock out, minus breaks. The hours page flags anything odd (no clock-out, a break with no end, a clock-in while already in). The office can add a missing punch or remove a wrong one on the same page. A shift that is never clocked out is treated as forgotten after 16 hours so the next day starts clean.

## Deploy to Vercel

1. Push this repository to GitHub (already done) and in Vercel choose **Add New Project → Import** `Crayons-Staff`. Framework preset: Next.js.
2. **Storage tab → Create Database → Upstash Redis** (the free plan is plenty). Vercel adds the connection variables to the project. Without this the site still runs, but data lives in temporary server storage and is wiped on every deploy; the admin menu and hours page say so.
3. **Settings → Environment Variables**:
   - `AUTH_SECRET`: any long random string (for example from `openssl rand -base64 32`). Required; sign-in refuses to work without it.
   - `ADMIN_PASSWORD`: lets any admin account sign in with this password instead of their PIN.
   - `KIOSK_PASSWORD`: unlocks the office tablet. Falls back to `ADMIN_PASSWORD`.
   - `SCHOOL_NAME` (shown on the sign-in screen and badges) and `SCHOOL_TZ` (default `America/New_York`).
4. Deploy. Open `/schedule`, sign in as **Dana Reyes** (PIN `0000` in the sample data), go to **Staff** and replace the sample people with your real staff and PINs. Use **Menu → Reset demo data** if you want a blank week. Then publish the week.

See `.env.example` for every variable.

## Run it locally

```bash
npm install
cp .env.example .env.local   # optional; development works without any variables
npm run dev
```

Open http://localhost:3000. Without Redis, data is kept in `.data/` (ignored by git).

Checks:

```bash
npm test                      # schedule logic + clock math
npm run typecheck && npm run build
node scripts/e2e.mjs http://localhost:3000   # browser click-through against a running server (needs Playwright)
```

## Data

- **Schedule document** (one JSON object, key `schedule:state`): `settings`, `positions`, `locations`, `teachers` (name, role, usualArea, usualPositionId, usualLocationId, pin, active, badgeCode) and `assignments` (teacherId, date, start, end, area, locationId, positionId, coveringForTeacherId, note, and the `published` snapshot teachers actually see). Teachers receive a trimmed copy with no PINs, badge codes or drafts.
- **Punches** (one array per local month, key `clock:YYYY-MM`): `{ id, teacherId, type: in | break_start | break_end | out, at (ISO), source: kiosk-qr | kiosk-card | kiosk-tap | phone | admin, note }`.
- Logic lives in `public/s/core.js` (schedule) and `lib/clock.ts` (hours). The schedule UI itself is plain JavaScript in `public/s/`, served at `/schedule`; the clock, kiosk, hours and badges pages are React.

## Security notes

Sign-in cookies are signed with `AUTH_SECRET` and last 30 days; the kiosk cookie lasts 90 days. PINs are four digits and stored in the schedule document, which only admins can read: fine for a small school, not for anything sensitive. The badge code is the only thing on a QR badge, and a badge can only clock its own owner in and out on an unlocked kiosk.
