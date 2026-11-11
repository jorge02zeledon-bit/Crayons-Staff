import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../public/s/core.js');
const Seed = require('../public/s/seed.js');

test('local date helpers never shift across time zones', () => {
  assert.equal(C.toISODate(C.fromISODate('2026-10-05')), '2026-10-05');
  assert.equal(C.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(C.addDays('2026-03-08', 1), '2026-03-09'); // US DST change day
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.ok(C.isValidISODate('2026-02-28'));
  assert.ok(!C.isValidISODate('2026-02-30'));
  assert.ok(!C.isValidISODate('2026-2-3'));
});

test('weeks start on Monday and weekends roll to the next school week', () => {
  assert.equal(C.weekStart('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(C.weekStart('2026-10-09'), '2026-10-05'); // Friday
  assert.equal(C.weekStart('2026-10-11'), '2026-10-05'); // Sunday belongs to the week that started Monday
  assert.equal(C.upcomingSchoolWeekStart('2026-10-07'), '2026-10-05');
  assert.equal(C.upcomingSchoolWeekStart('2026-10-10'), '2026-10-12'); // Saturday
  assert.equal(C.upcomingSchoolWeekStart('2026-10-11'), '2026-10-12'); // Sunday
  assert.deepEqual(C.weekDays('2026-10-05', 5), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
});

test('time formatting is 12-hour and readable', () => {
  assert.equal(C.formatTime('07:30'), '7:30 AM');
  assert.equal(C.formatTime('12:00'), '12:00 PM');
  assert.equal(C.formatTime('00:15'), '12:15 AM');
  assert.equal(C.formatTime('15:30'), '3:30 PM');
  assert.equal(C.formatRange('07:30', '15:30'), '7:30 AM – 3:30 PM');
  assert.equal(C.durationLabel('07:30', '15:30'), '8 hrs');
  assert.equal(C.durationLabel('12:30', '15:15'), '2 hr 45 min');
  assert.equal(C.formatWeekLabel('2026-10-05'), 'Oct 5–9');
  assert.equal(C.formatWeekLabel('2026-09-28'), 'Sep 28 – Oct 2');
});

test('overlap is half-open: back-to-back blocks do not conflict', () => {
  const a = { date: '2026-10-05', start: '07:30', end: '11:30' };
  const b = { date: '2026-10-05', start: '11:30', end: '12:30' };
  const c = { date: '2026-10-05', start: '10:00', end: '12:00' };
  const d = { date: '2026-10-06', start: '10:00', end: '12:00' };
  assert.equal(C.overlaps(a, b), false);
  assert.equal(C.overlaps(a, c), true);
  assert.equal(C.overlaps(c, b), true);
  assert.equal(C.overlaps(c, d), false);
});

test('conflicts are only for the same teacher on the same day', () => {
  const list = [
    { id: '1', teacherId: 'x', date: '2026-10-05', start: '07:30', end: '11:30' },
    { id: '2', teacherId: 'x', date: '2026-10-05', start: '10:00', end: '12:00' },
    { id: '3', teacherId: 'y', date: '2026-10-05', start: '10:00', end: '12:00' },
    { id: '4', teacherId: 'x', date: '2026-10-06', start: '10:00', end: '12:00' },
  ];
  const pairs = C.findConflicts(list);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].a.id, pairs[0].b.id].sort(), ['1', '2']);
  const idx = C.conflictIndex(list);
  assert.deepEqual(Object.keys(idx).sort(), ['1', '2']);
  assert.equal(C.conflictsForCandidate({ id: '2', teacherId: 'x', date: '2026-10-05', start: '11:30', end: '12:00' }, list).length, 0);
  assert.equal(C.conflictsForCandidate({ id: 'new', teacherId: 'x', date: '2026-10-05', start: '09:00', end: '09:30' }, list).length, 1);
});

test('coverage labels: cross, usual, different position, both', () => {
  const pre = { usualArea: 'preschool', usualPositionId: 'pos_lead_pre' };
  const el = { usualArea: 'elementary', usualPositionId: 'pos_lead_el' };
  const both = { usualArea: 'both', usualPositionId: 'pos_float' };
  const covEl = C.coverage(pre, { area: 'elementary', positionId: 'pos_lead' });
  assert.equal(covEl.kind, 'cross');
  assert.equal(C.coverageLabel(covEl, true), 'Covering Elementary today');
  assert.equal(C.coverageLabel(covEl, false), 'Covering Elementary');
  const covPre = C.coverage(el, { area: 'preschool', positionId: 'pos_assist' });
  assert.equal(covPre.kind, 'cross');
  assert.equal(C.coverageLabel(covPre, true), 'Covering Preschool today');
  const usual = C.coverage(pre, { area: 'preschool', positionId: 'pos_lead_pre' });
  assert.equal(usual.kind, 'usual');
  assert.equal(C.coverageLabel(usual, true), 'Preschool \u00b7 Your usual role');
  const diff = C.coverage(pre, { area: 'preschool', positionId: 'pos_lunch' });
  assert.equal(diff.kind, 'different-position');
  assert.equal(C.coverageLabel(diff, true), 'Preschool \u00b7 Different position today');
  const b = C.coverage(both, { area: 'elementary', positionId: 'pos_aide_el' });
  assert.equal(b.kind, 'both');
  assert.equal(C.coverageLabel(b, true), 'Elementary \u00b7 One of your usual areas');
  assert.equal(C.coverage(null, { area: 'elementary' }).kind, 'unknown');
  assert.ok(C.areaMatches('both', 'preschool') && C.areaMatches('shared', 'elementary') && C.areaMatches('either', 'preschool'));
  assert.ok(C.areaMatches('preschool', 'preschool') && !C.areaMatches('preschool', 'elementary'));
});

test('with-you and next-after derive calm context from the schedule', () => {
  const me = { id: '1', teacherId: 'maria', date: '2026-10-07', start: '12:30', end: '15:30', locationId: 'loc_102' };
  const items = [
    me,
    { id: '2', teacherId: 'priya', date: '2026-10-07', start: '12:30', end: '15:15', locationId: 'loc_102' },
    { id: '3', teacherId: 'alex', date: '2026-10-07', start: '14:00', end: '17:00', locationId: 'loc_102' },
    { id: '4', teacherId: 'sarah', date: '2026-10-07', start: '12:30', end: '15:30', locationId: 'loc_101' },
    { id: '5', teacherId: 'tom', date: '2026-10-08', start: '12:30', end: '15:30', locationId: 'loc_102' },
    { id: '6', teacherId: 'david', date: '2026-10-07', start: '07:45', end: '12:30', locationId: 'loc_102' },
  ];
  const w = C.withYou(me, items);
  assert.deepEqual(w.map(x => [x.assignment.teacherId, x.start, x.end]), [['priya', '12:30', '15:15'], ['alex', '14:00', '15:30']]);
  const mine = [
    { id: 'a', teacherId: 'maria', date: '2026-10-07', start: '07:30', end: '12:30' },
    me,
    { id: 'b', teacherId: 'maria', date: '2026-10-08', start: '07:30', end: '15:30' },
  ];
  assert.equal(C.nextAfter(me, mine).id, 'b');
  assert.equal(C.nextAfter(mine[0], mine).id, '1');
  assert.equal(C.nextAfter(mine[2], mine), null);
});

test('publishing snapshots what teachers see; edits mark the item changed', () => {
  const a = { id: 'a1', teacherId: 't', date: '2026-10-05', start: '07:30', end: '11:30', area: 'preschool', locationId: 'l', positionId: 'p', note: '', published: null };
  assert.equal(C.publishState(a), 'draft');
  assert.equal(C.teacherView(a), null);
  const [pub] = C.publishWeek([a], '2026-10-05', '2026-10-04T18:00:00');
  assert.equal(C.publishState(pub), 'published');
  assert.equal(C.teacherView(pub).locationId, 'l');
  const edited = Object.assign({}, pub, { locationId: 'other' });
  assert.equal(C.publishState(edited), 'changed');
  assert.equal(C.teacherView(edited).locationId, 'l', 'teacher keeps seeing the published version');
  const [other] = C.publishWeek([a], '2026-10-12', 'x');
  assert.equal(other.published, null, 'publishing another week leaves this one alone');
  const s = C.weekSummary([a, pub, edited], '2026-10-05');
  assert.deepEqual({ total: s.total, drafts: s.drafts, changed: s.changed, published: s.published }, { total: 3, drafts: 1, changed: 1, published: 1 });
  // Untouched rows keep their publishedAt; null vs '' is not a change.
  const [again] = C.publishWeek([pub], '2026-10-05', 'LATER');
  assert.equal(again.published.publishedAt, '2026-10-04T18:00:00');
  assert.equal(C.publishState(Object.assign({}, pub, { coveringForTeacherId: null })), 'published');
  // Save & publish a single shift.
  const [one] = C.publishOne([edited], 'a1', 'NOW');
  assert.equal(C.teacherView(one).locationId, 'other');
});

test('a shift moved out of a week disappears for the teacher when that week is published', () => {
  const a = { id: 'a1', teacherId: 't', date: '2026-10-07', start: '07:30', end: '11:30', area: 'preschool', locationId: 'l', positionId: 'p', note: '', published: null };
  const [pub] = C.publishWeek([a], '2026-10-05', 'T1');
  const moved = Object.assign({}, pub, { date: '2026-10-14' });
  assert.equal(C.publishState(moved), 'changed');
  assert.ok(C.touchesWeek(moved, '2026-10-05') && C.touchesWeek(moved, '2026-10-12'));
  const [afterThisWeek] = C.publishWeek([moved], '2026-10-05', 'T2');
  assert.equal(afterThisWeek.published, null, 'no longer visible in the old week');
  const [afterNextWeek] = C.publishWeek([moved], '2026-10-12', 'T3');
  assert.equal(C.teacherView(afterNextWeek).date, '2026-10-14');
  const sum = C.weekSummary([moved], '2026-10-05');
  assert.equal(sum.total, 0, 'no live shifts in the old week');
  assert.equal(sum.unpublished, 1, 'but one pending change to publish');
});

test('validation: errors block, warnings inform', () => {
  const locs = C.indexBy([{ id: 'l1', name: 'Room 101', area: 'elementary' }, { id: 'l2', name: 'Cafeteria', area: 'shared' }]);
  const pos = C.indexBy([{ id: 'p', label: 'Lead Teacher', area: 'both' }, { id: 'pe', label: 'Elementary Aide', area: 'elementary' }]);
  const base = { teacherId: 't', date: '2026-10-05', start: '08:00', end: '09:00', area: 'preschool', locationId: 'l2', positionId: 'p' };
  assert.deepEqual(C.validateAssignment(base, { locations: locs, positions: pos }), { errors: [], warnings: [] });
  assert.ok(C.validateAssignment(Object.assign({}, base, { end: '08:00' })).errors.some(e => /after start/.test(e)));
  const mismatch = C.validateAssignment(Object.assign({}, base, { locationId: 'l1', positionId: 'pe' }), { locations: locs, positions: pos });
  assert.equal(mismatch.errors.length, 0, 'mismatches do not block saving');
  assert.ok(mismatch.warnings.some(w => /Elementary building/.test(w)));
  assert.ok(mismatch.warnings.some(w => /Elementary position/.test(w)));
  assert.ok(C.validateAssignment(Object.assign({}, base, { date: '2026-10-10' })).warnings.some(w => /weekend/.test(w)));
  assert.ok(C.validateAssignment(Object.assign({}, base, { teacherId: '' })).errors.some(e => /teacher/i.test(e)));
  assert.ok(C.validateTeacher({ name: 'A', usualArea: 'preschool', pin: '12' }).some(e => /PIN/.test(e)));
});

test('seed: one week, published except the deliberate draft, at least two cross-coverage shifts', () => {
  const seed = Seed.buildSeed('2026-10-05');
  const teachers = C.indexBy(seed.teachers);
  const locs = C.indexBy(seed.locations), pos = C.indexBy(seed.positions);
  const dates = new Set(seed.assignments.map(a => a.date));
  assert.deepEqual([...dates].sort(), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  const drafts = seed.assignments.filter(a => !a.published);
  assert.equal(drafts.length, 1);
  const cross = seed.assignments.filter(a => C.coverage(teachers[a.teacherId], a).kind === 'cross');
  assert.ok(cross.length >= 2, 'at least two cross-coverage assignments');
  assert.ok(cross.some(a => a.teacherId === 't_maria' && a.area === 'elementary' && a.coveringForTeacherId === 't_david'));
  assert.ok(cross.some(a => a.teacherId === 't_sarah' && a.area === 'preschool' && a.coveringForTeacherId === 't_keisha'));
  assert.ok(cross.some(a => a.teacherId === 't_priya' && a.area === 'preschool'));
  // Cover shifts name the job in the room, never a bare "Coverage" label.
  cross.forEach(a => assert.ok(!/Coverage/.test(pos[a.positionId].label), pos[a.positionId].label));
  assert.ok(seed.seededWeekStart === '2026-10-05' && seed.userEdited === false && seed.settings.adminPhone);
  // Only the deliberate draft conflicts; the published schedule is clean.
  const published = seed.assignments.filter(a => a.published);
  assert.equal(C.findConflicts(published).length, 0);
  const conflicts = C.findConflicts(seed.assignments);
  assert.equal(conflicts.length, 2, 'the draft overlaps two of Alex\'s blocks');
  assert.ok(conflicts.every(p => !p.a.published || !p.b.published), 'every conflict involves the draft');
  // Every reference resolves and nothing in the seed even warns.
  for (const a of seed.assignments) {
    assert.ok(teachers[a.teacherId], a.teacherId);
    assert.ok(locs[a.locationId], a.locationId);
    assert.ok(pos[a.positionId], a.positionId);
    if (a.coveringForTeacherId) assert.ok(teachers[a.coveringForTeacherId], a.coveringForTeacherId);
    assert.deepEqual(C.validateAssignment(a, { locations: locs, positions: pos }), { errors: [], warnings: [] }, JSON.stringify(a));
  }
  for (const t of seed.teachers) { assert.ok(pos[t.usualPositionId]); if (t.usualLocationId) assert.ok(locs[t.usualLocationId]); }
});
