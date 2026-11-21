import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Seed = require("../public/s/seed.js");
const C = require("../public/s/core.js");
const { changedTeachers, coveringReminders } = await import("../lib/notify.ts");
const { isExpoPushToken } = await import("../lib/push.ts");

test("changedTeachers lists only people whose published shifts changed", () => {
  const before = Seed.buildSeed("2026-11-16");
  const after = JSON.parse(JSON.stringify(before));
  const a = after.assignments.find((x) => x.teacherId === "t_tom" && x.published);
  a.published.locationId = "loc_butterfly";
  assert.deepEqual(changedTeachers(before, after), ["t_tom"]);
  const published = C.publishWeek(after.assignments, "2026-11-16", "now");
  const after2 = { ...after, assignments: published };
  assert.ok(changedTeachers(after, after2).includes("t_alex"), "publishing the draft changes Alex");
  assert.deepEqual(changedTeachers(before, before), []);
});

test("evening reminders go to people covering the other area that day", () => {
  const s = Seed.buildSeed("2026-11-16");
  const wed = coveringReminders(s, "2026-11-18");
  assert.deepEqual(wed.map((r) => r.teacherId), ["t_maria"]);
  assert.match(wed[0].msg.title, /Covering Elementary/);
  assert.match(wed[0].msg.body, /Room 102/);
  assert.deepEqual(coveringReminders(s, "2026-11-16"), []);
});

test("push token format", () => {
  assert.ok(isExpoPushToken("ExponentPushToken[abc123]"));
  assert.ok(!isExpoPushToken("abc"));
});
