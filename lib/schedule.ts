import Core from "@/public/s/core.js";
import Seed from "@/public/s/seed.js";
import { getJSON, setJSON } from "./store";
import { newBadgeCode } from "./auth";

/**
 * The schedule document is the same JSON the prototype kept in localStorage:
 * { settings, positions, locations, teachers, assignments, ... }. Teachers see a
 * trimmed copy (no PINs, no drafts); admins see all of it. See public/s/
 * core.js for the logic and the README for the fields.
 */
export type Teacher = {
  id: string; name: string; role: "teacher" | "admin"; usualArea: "preschool" | "elementary" | "both";
  usualPositionId: string; usualLocationId?: string; pin: string; active?: boolean; badgeCode?: string;
};
export type ScheduleState = {
  version: number; seedVersion?: number; seededWeekStart?: string; userEdited?: boolean;
  settings: Record<string, unknown> & { schoolName: string; adminName: string; adminPhone?: string; adminContact?: string; showDemoPins?: boolean };
  positions: { id: string; label: string; area: string }[];
  locations: { id: string; name: string; area: string; detail?: string }[];
  teachers: Teacher[];
  assignments: Record<string, unknown>[];
};

const KEY = "schedule:state";
export const SCHOOL_NAME = process.env.SCHOOL_NAME || "Crayons";

function freshState(): ScheduleState {
  const weekStart = Core.upcomingSchoolWeekStart(Core.todayISO());
  const s = Seed.buildSeed(weekStart, new Date().toISOString()) as ScheduleState;
  s.settings.schoolName = SCHOOL_NAME;
  s.settings.showDemoPins = process.env.NODE_ENV !== "production";
  return s;
}

/** Every person needs a badge code for the clock; older documents get them on load. */
function ensureBadges(s: ScheduleState): boolean {
  let changed = false;
  for (const t of s.teachers) {
    if (!t.badgeCode) { t.badgeCode = newBadgeCode(); changed = true; }
  }
  return changed;
}

export async function loadState(): Promise<ScheduleState> {
  let s = await getJSON<ScheduleState>(KEY);
  let changed = false;
  if (!s || s.version !== 1 || !Array.isArray(s.teachers)) { s = freshState(); changed = true; }
  if (ensureBadges(s)) changed = true;
  if (changed) await setJSON(KEY, s);
  return s;
}

export async function saveState(s: ScheduleState): Promise<void> {
  ensureBadges(s);
  await setJSON(KEY, s);
}

export function findTeacher(s: ScheduleState, id: string): Teacher | undefined {
  return s.teachers.find((t) => t.id === id);
}
export function findByBadge(s: ScheduleState, code: string): Teacher | undefined {
  const c = code.trim().toUpperCase();
  return s.teachers.find((t) => (t.badgeCode || "").toUpperCase() === c && t.active !== false);
}

/** What the login screen may show before anyone signs in. */
export function publicStaff(s: ScheduleState) {
  const pos = new Map(s.positions.map((p) => [p.id, p.label]));
  return s.teachers.filter((t) => t.active !== false).map((t) => ({
    id: t.id, name: t.name, role: t.role, usualArea: t.usualArea, usualPosition: pos.get(t.usualPositionId) || "",
    ...(s.settings.showDemoPins ? { pin: t.pin } : {}),
  }));
}

/** A teacher's copy: published snapshots only, no PINs or badge codes. */
export function teacherView(s: ScheduleState, teacherId: string) {
  return {
    version: s.version,
    settings: { ...s.settings, demoToday: null, showDemoPins: false },
    positions: s.positions,
    locations: s.locations,
    teachers: s.teachers.map((t) => ({ id: t.id, name: t.name, role: t.role, usualArea: t.usualArea, usualPositionId: t.usualPositionId, usualLocationId: t.usualLocationId, active: t.active })),
    assignments: s.assignments.filter((a) => a.published).map((a) => ({ id: a.id, published: a.published })),
    me: teacherId,
  };
}

/** Minimal validation of a document an admin sends back. */
export function validateIncoming(doc: unknown): doc is ScheduleState {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as Record<string, unknown>;
  return d.version === 1 && Array.isArray(d.teachers) && Array.isArray(d.assignments) && Array.isArray(d.locations) && Array.isArray(d.positions) && !!d.settings && typeof d.settings === "object";
}
