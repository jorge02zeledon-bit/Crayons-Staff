/* End-to-end click-through against a running server: node scripts/e2e.mjs http://localhost:3000 outDir */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
// Playwright may be installed globally (as in the cloud sandbox) or locally.
const req = createRequire(import.meta.url);
let pw;
try { pw = req("playwright"); } catch { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); }
const { chromium } = pw;

const base = process.argv[2] || "http://localhost:3000";
const outDir = process.argv[3] || "dist/e2e";
fs.mkdirSync(outDir, { recursive: true });
const failures = [];
const check = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) failures.push(m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|fonts\.g|ERR_NAME|status of 40[13]/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(outDir, n + ".png"), fullPage: true });
const text = async (sel = "body") => (await page.locator(sel).innerText()).replace(/\s+/g, " ");

async function login(name, pin) {
  await page.goto(base + "/schedule/");
  await page.waitForSelector(".person");
  await page.locator(".person", { hasText: name }).click();
  await page.fill("#pin", pin);
  await page.locator("button[type=submit]").click();
}

console.log("[Teacher sign-in and schedule]");
await login("Maria Lopez", "1111");
await page.waitForSelector(".sgrid");
let t = await text();
check(/Good (morning|afternoon|evening), Maria/.test(t), "Maria signed in and lands on the dashboard");
check(/Team schedule/i.test(t) && t.includes("Maria Lopez (you)"), "team grid shows Maria's row first");
check((await page.locator(".shiftchip.sc-cross").count()) >= 1, "cross-coverage chips in the grid");
check(!t.includes("Draft") && !t.includes("draft"), "no drafts visible to a teacher");
await page.waitForFunction(() => !/…/.test(document.querySelector("#tile-clocked strong")?.textContent || "…"), null, { timeout: 8000 }).catch(() => {});
check(/Clocked this week/i.test(t), "clocked-hours tile present");
await shot("00-teacher-dash");
await page.locator(".tab", { hasText: "My day" }).click();
await page.waitForSelector(".today-card, .empty-today");
t = await text();
check(t.includes("Break clock"), "break clock link in header");
await shot("01-teacher-schedule");

console.log("[Phone clock]");
await page.locator("a", { hasText: "Break clock" }).click();
await page.waitForSelector(".status-big");
t = await text();
check(t.includes("Not clocked in"), "clock starts as not clocked in");
await page.locator("button", { hasText: "Clock in" }).click();
await page.waitForSelector(".status-big.is-working");
await page.locator("button", { hasText: "Start break" }).click();
await page.waitForSelector(".status-big.is-break");
t = await text();
check(t.includes("On break"), "on break after start break");
await shot("02-phone-clock-break");
await page.locator("button", { hasText: "End break" }).click();
await page.waitForSelector(".status-big.is-working");
await page.locator("button", { hasText: "Clock out" }).click();
await page.waitForTimeout(300);
t = await text();
check(t.includes("Not clocked in") && /Clocked out/.test(t), "clocked out, punches listed");
await page.goto(base + "/schedule/");
await page.waitForSelector(".greeting");
await page.locator("button", { hasText: "Log out" }).click();
await page.waitForSelector(".person");

console.log("[Admin: schedule edit saves to the server]");
await login("Dana Reyes", "0000");
await page.waitForSelector(".sgrid");
check((await page.locator("button.shiftchip").count()) > 10, "admin dashboard chips are editable buttons");
await shot("02b-admin-dash");
await page.locator(".tab", { hasText: "Week" }).click();
await page.waitForSelector(".day-tabs");
t = await text("#app");
check(t.includes("Hours"), "admin tab bar links to Hours");
const beforeCount = await page.evaluate(() => window.__staffSchedule.getState().assignments.length);
await page.locator("button", { hasText: /Add a shift on/ }).click();
await page.waitForSelector("#editor-form");
await page.selectOption("#f-teacher", "t_dana"); // the director: admins can be scheduled too
await page.waitForTimeout(100);
await page.locator("label.seg-el").click(); // Dana works in both areas, so pick one
await page.locator(".chip", { hasText: "Afternoon" }).click();
await page.selectOption("#f-location", "loc_office");
await page.selectOption("#f-position", "pos_office");
await page.locator(".sheet button[type=submit]", { hasText: "publish now" }).click();
await page.waitForTimeout(800);
const afterCount = await page.evaluate(() => window.__staffSchedule.getState().assignments.length);
check(afterCount === beforeCount + 1, "shift added in the browser");
await page.reload();
await page.waitForSelector(".day-tabs");
const reloaded = await page.evaluate(() => window.__staffSchedule.getState().assignments.length);
check(reloaded === afterCount, "shift persisted on the server after reload (got " + reloaded + ")");
await shot("03-admin-week");

console.log("[Admin: badges and hours]");
await page.goto(base + "/admin/badges");
await page.waitForSelector(".badge-card");
const badgeCount = await page.locator(".badge-card").count();
check(badgeCount >= 8, "badge per person (" + badgeCount + ")");
const mariaCode = await page.locator(".badge-card", { hasText: "Maria Lopez" }).locator(".bcode").innerText();
check(/^[A-Z2-9]{8}$/.test(mariaCode), "badge code format " + mariaCode);
await shot("04-badges");
await page.goto(base + "/admin/hours");
await page.waitForSelector("table.hours");
t = await text();
check(t.includes("Maria Lopez") && /Hours worked/.test(t), "hours report lists Maria");
await shot("05-hours");
const csv = await page.evaluate(async () => (await fetch("/admin/hours.csv")).text());
check(csv.startsWith("name,date,clock_in") && csv.includes("Maria Lopez"), "CSV downloads");
// Add a manual punch and see it
await page.selectOption("#px-who", "t_tom");
await page.selectOption("#px-type", "in");
const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()));
await page.fill("#px-date", today);
await page.fill("#px-time", "07:30");
await page.locator("button", { hasText: "Add punch" }).click();
await page.waitForLoadState("networkidle");
await page.waitForSelector("table.hours");
t = await text();
check(t.includes("Tom Nguyen") && t.includes("No clock-out recorded"), "manual punch added and flagged as open");

console.log("[Kiosk: unlock, card reader entry, QR flow]");
// A fresh browser (the office tablet): nobody signed in, so the kiosk asks for its password.
const kctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const kpage = await kctx.newPage();
kpage.on("pageerror", (e) => errors.push("kiosk pageerror: " + e.message));
await kpage.goto(base + "/kiosk");
await kpage.waitForSelector("#password");
await kpage.fill("#password", "wrong");
await kpage.locator("button[type=submit]").click();
await kpage.waitForSelector("#password");
check((await kpage.locator("body").innerText()).includes("not right"), "wrong kiosk password rejected");
await kpage.fill("#password", "kiosk123");
await kpage.locator("button[type=submit]").click();
await kpage.waitForSelector("input[aria-label='Badge code']");
await kpage.waitForLoadState("networkidle"); await kpage.waitForTimeout(400); // let React hydrate before typing
const page0 = page; const pageK = kpage;
// the rest of this section runs on the kiosk page
const _page = page; page = pageK;
await page.fill("input[aria-label='Badge code']", mariaCode);
await page.keyboard.press("Enter");
try { await page.waitForSelector(".kiosk-person", { timeout: 8000 }); }
catch { console.log("  kiosk page said: " + (await text()).slice(0, 300) + " | code used: " + mariaCode); }
t = await text(".kiosk-person");
check(t.includes("Maria Lopez") && t.includes("Not clocked in"), "kiosk recognizes Maria's badge");
await shot("06-kiosk-person");
await page.locator(".kiosk-actions button", { hasText: "Clock in" }).click();
await page.waitForSelector(".kiosk-done");
t = await text(".kiosk-done");
check(/Maria Lopez clocked in/.test(t), "kiosk clocked Maria in");
await page.fill("input[aria-label='Badge code']", "CS:" + mariaCode);
await page.keyboard.press("Enter");
await page.waitForSelector(".kiosk-person");
t = await text(".kiosk-person");
check(t.includes("Working"), "second scan shows Working with break/out options");
await page.fill("input[aria-label='Badge code']", "NOPE1234");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
t = await text();
check(/not recognized/.test(t), "unknown badge rejected");
await shot("07-kiosk-after");
page = _page; await kctx.close();

console.log("[Access control]");
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
const r1 = await p2.request.get(base + "/api/state");
check(r1.status() === 401, "state requires sign-in");
const r2 = await p2.request.post(base + "/api/kiosk", { data: { badgeCode: mariaCode } });
check(r2.status() === 403, "kiosk API needs an unlocked tablet");
const r3 = await p2.request.get(base + "/admin/hours.csv");
check(r3.status() === 403, "CSV is admin only");
await p2.goto(base + "/admin/hours");
check(p2.url().includes("/schedule"), "hours page redirects to sign-in");
await ctx2.close();

await browser.close();
console.log("\nConsole/page errors: " + errors.length); errors.forEach((e) => console.log("  " + e));
if (failures.length || errors.length) { console.log(failures.length + " failure(s)"); process.exit(1); }
console.log("All checks passed. Screenshots in " + outDir);
