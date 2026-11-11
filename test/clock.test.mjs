import test from "node:test";
import assert from "node:assert/strict";
import { statusFor, allowedActions, summarizeDays, localDate, monthsBetween, formatMinutes } from "../lib/clock.ts";

const TZ = "America/New_York";
const p = (id, teacherId, type, at) => ({ id, teacherId, type, at, source: "kiosk-qr" });

test("status follows in / break / out", () => {
  const list = [p("1", "a", "in", "2026-11-10T12:30:00Z"), p("2", "a", "break_start", "2026-11-10T16:00:00Z")];
  const now = new Date("2026-11-10T16:10:00Z");
  assert.equal(statusFor(list, now).state, "break");
  assert.deepEqual(allowedActions("break"), ["break_end", "out"]);
  list.push(p("3", "a", "break_end", "2026-11-10T16:30:00Z"));
  assert.equal(statusFor(list, now).state, "working");
  list.push(p("4", "a", "out", "2026-11-10T20:30:00Z"));
  assert.equal(statusFor(list, now).state, "off");
  assert.deepEqual(allowedActions("off"), ["in"]);
});

test("a shift left open for more than 16 hours counts as forgotten", () => {
  const list = [p("1", "a", "in", "2026-11-10T12:30:00Z")];
  const s = statusFor(list, new Date("2026-11-11T12:00:00Z"));
  assert.equal(s.state, "off");
  assert.equal(s.stale, true);
});

test("hours = shift minus breaks, per local day", () => {
  const list = [
    p("1", "a", "in", "2026-11-10T12:30:00Z"),          // 7:30 AM ET
    p("2", "a", "break_start", "2026-11-10T16:00:00Z"), // 11:00
    p("3", "a", "break_end", "2026-11-10T16:30:00Z"),   // 11:30
    p("4", "a", "out", "2026-11-10T20:30:00Z"),         // 3:30 PM
    p("5", "b", "in", "2026-11-10T13:00:00Z"),
    p("6", "b", "out", "2026-11-10T17:00:00Z"),
    p("7", "a", "in", "2026-11-11T12:30:00Z"),          // next day, no clock-out
  ];
  const days = summarizeDays(list, TZ);
  assert.equal(days.length, 3);
  const a10 = days.find((d) => d.teacherId === "a" && d.date === "2026-11-10");
  assert.equal(a10.workedMin, 450, "8h shift minus 30 min break");
  assert.equal(a10.breakMin, 30);
  assert.equal(a10.breaks, 1);
  assert.deepEqual(a10.issues, []);
  const b10 = days.find((d) => d.teacherId === "b");
  assert.equal(b10.workedMin, 240);
  const a11 = days.find((d) => d.teacherId === "a" && d.date === "2026-11-11");
  assert.equal(a11.open, true);
  assert.ok(a11.issues.includes("No clock-out recorded"));
  assert.equal(formatMinutes(450), "7:30");
});

test("bad sequences are flagged, not crashed", () => {
  const list = [
    p("1", "a", "out", "2026-11-10T12:30:00Z"),
    p("2", "a", "in", "2026-11-10T12:31:00Z"),
    p("3", "a", "in", "2026-11-10T12:32:00Z"),
    p("4", "a", "break_end", "2026-11-10T13:00:00Z"),
    p("5", "a", "break_start", "2026-11-10T14:00:00Z"),
    p("6", "a", "out", "2026-11-10T14:30:00Z"),
  ];
  const [d] = summarizeDays(list, TZ);
  assert.equal(d.issues.length, 4);
  assert.equal(d.breakMin, 30, "break counted until the clock-out");
  assert.equal(d.workedMin, 89, "12:31 to 14:30 minus 30 min break");
});

test("local dates respect the school time zone and month ranges are inclusive", () => {
  assert.equal(localDate("2026-11-11T03:30:00Z", TZ), "2026-11-10"); // 10:30 PM ET
  assert.deepEqual(monthsBetween("2026-11-20", "2027-01-03"), ["2026-11", "2026-12", "2027-01"]);
});
