/*
 * core.js — pure logic for the staff schedule prototype.
 * No DOM, no storage. Loaded in the browser as a plain script (window.Core)
 * and in Node for tests (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Vocabulary ----------
  var AREAS = {
    preschool: { key: 'preschool', label: 'Preschool', short: 'PRE' },
    elementary: { key: 'elementary', label: 'Elementary', short: 'ELEM' }
  };
  var USUAL_AREAS = {
    preschool: 'Preschool',
    elementary: 'Elementary',
    both: 'Both (flex staff)'
  };
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function areaLabel(area) {
    return AREAS[area] ? AREAS[area].label : String(area || '');
  }

  // Does an entity (position / location / teacher) fit a shift's area?
  // 'both', 'either' and 'shared' are wildcards.
  function areaMatches(entityArea, shiftArea) {
    if (!entityArea || !shiftArea) return true;
    return entityArea === shiftArea || entityArea === 'both' || entityArea === 'either' || entityArea === 'shared';
  }

  // ---------- Dates (always LOCAL, never toISOString) ----------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toISODate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fromISODate(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function isValidISODate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
    var d = fromISODate(iso);
    return toISODate(d) === iso;
  }

  function todayISO(now) {
    return toISODate(now || new Date());
  }

  function addDays(iso, n) {
    var d = fromISODate(iso);
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  function dayOfWeek(iso) { // 0 = Sunday ... 6 = Saturday
    return fromISODate(iso).getDay();
  }

  // Monday is the first day of the school week.
  function weekStart(iso) {
    var dow = dayOfWeek(iso);
    var back = (dow + 6) % 7; // Mon -> 0, Tue -> 1, ..., Sun -> 6
    return addDays(iso, -back);
  }

  function weekDays(startIso, count) {
    var out = [];
    for (var i = 0; i < (count || 7); i++) out.push(addDays(startIso, i));
    return out;
  }

  function isWeekend(iso) {
    var dow = dayOfWeek(iso);
    return dow === 0 || dow === 6;
  }

  // The week a demo should seed into: this week on Mon–Fri, next week on Sat/Sun.
  function upcomingSchoolWeekStart(todayIso) {
    return isWeekend(todayIso) ? addDays(weekStart(todayIso), 7) : weekStart(todayIso);
  }

  function compareISO(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function formatDate(iso, style) {
    var d = fromISODate(iso);
    var dow = d.getDay(), m = d.getMonth(), day = d.getDate();
    switch (style) {
      case 'weekday': return DAY_NAMES[dow];
      case 'weekday-short': return DAY_SHORT[dow];
      case 'month-day': return MONTH_SHORT[m] + ' ' + day;
      case 'long': return DAY_NAMES[dow] + ', ' + MONTH_LONG[m] + ' ' + day;
      case 'short': return DAY_SHORT[dow] + ', ' + MONTH_SHORT[m] + ' ' + day;
      default: return DAY_SHORT[dow] + ' ' + MONTH_SHORT[m] + ' ' + day;
    }
  }

  function formatWeekLabel(startIso) {
    var end = addDays(startIso, 4); // Mon..Fri
    var s = fromISODate(startIso), e = fromISODate(end);
    if (s.getMonth() === e.getMonth()) {
      return MONTH_SHORT[s.getMonth()] + ' ' + s.getDate() + '–' + e.getDate();
    }
    return MONTH_SHORT[s.getMonth()] + ' ' + s.getDate() + ' – ' + MONTH_SHORT[e.getMonth()] + ' ' + e.getDate();
  }

  function relativeDayLabel(iso, todayIso) {
    var diff = Math.round((fromISODate(iso) - fromISODate(todayIso)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return formatDate(iso, 'weekday');
  }

  // ---------- Times ('HH:MM' 24h strings) ----------
  function isValidTime(t) {
    if (!/^\d{2}:\d{2}$/.test(String(t))) return false;
    var p = t.split(':');
    return Number(p[0]) < 24 && Number(p[1]) < 60;
  }

  function toMinutes(t) {
    var p = String(t).split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }

  function fromMinutes(m) {
    m = ((m % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }

  function formatTime(t) {
    var mins = toMinutes(t);
    var h = Math.floor(mins / 60), m = mins % 60;
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(m) + ' ' + suffix;
  }

  function formatRange(start, end) {
    return formatTime(start) + ' – ' + formatTime(end);
  }

  function durationLabel(start, end) {
    var mins = toMinutes(end) - toMinutes(start);
    if (mins <= 0) return '';
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + ' hr ' + m + ' min';
    if (h) return h + (h === 1 ? ' hr' : ' hrs');
    return m + ' min';
  }

  // "now" status for an assignment on a given day.
  function timeStatus(a, nowIso, nowMinutes) {
    if (a.date < nowIso) return 'past';
    if (a.date > nowIso) return 'upcoming';
    if (nowMinutes < toMinutes(a.start)) return 'later-today';
    if (nowMinutes >= toMinutes(a.end)) return 'done-today';
    return 'now';
  }

  // ---------- Overlap and conflicts ----------
  function overlaps(a, b) {
    if (a.date !== b.date) return false;
    return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
  }

  // Every pair of assignments where the same teacher is double-booked.
  function findConflicts(assignments) {
    var byKey = {};
    assignments.forEach(function (a) {
      var k = a.teacherId + '|' + a.date;
      (byKey[k] = byKey[k] || []).push(a);
    });
    var pairs = [];
    Object.keys(byKey).forEach(function (k) {
      var list = byKey[k];
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          if (overlaps(list[i], list[j])) pairs.push({ a: list[i], b: list[j] });
        }
      }
    });
    return pairs;
  }

  // Map of assignmentId -> array of the other assignments it clashes with.
  function conflictIndex(assignments) {
    var idx = {};
    findConflicts(assignments).forEach(function (p) {
      (idx[p.a.id] = idx[p.a.id] || []).push(p.b);
      (idx[p.b.id] = idx[p.b.id] || []).push(p.a);
    });
    return idx;
  }

  // Conflicts a candidate (possibly unsaved, possibly being edited) would have.
  function conflictsForCandidate(candidate, assignments) {
    return assignments.filter(function (other) {
      if (other.id === candidate.id) return false;
      if (other.teacherId !== candidate.teacherId) return false;
      return overlaps(candidate, other);
    });
  }

  // ---------- Coverage (the heart of the app) ----------
  // kinds: 'cross'              outside the teacher's usual age group
  //        'different-position' usual area, but a different job for this block
  //        'usual'              usual area and usual position
  //        'both'               teacher works in both areas, so nothing is "cross"
  function coverage(teacher, assignment) {
    if (!teacher) return { kind: 'unknown', label: '', labelToday: '' };
    var area = areaLabel(assignment.area);
    if (teacher.usualArea === 'both') {
      return { kind: 'both', label: area + ' \u00b7 One of your usual areas', labelToday: area + ' \u00b7 One of your usual areas', short: area };
    }
    if (assignment.area && assignment.area !== teacher.usualArea) {
      return {
        kind: 'cross',
        label: 'Covering ' + area,
        labelToday: 'Covering ' + area + ' today',
        short: 'Covering ' + area,
        usualArea: areaLabel(teacher.usualArea)
      };
    }
    if (teacher.usualPositionId && assignment.positionId && assignment.positionId !== teacher.usualPositionId) {
      return { kind: 'different-position', label: area + ' \u00b7 Different position', labelToday: area + ' \u00b7 Different position today', short: 'Different position' };
    }
    return { kind: 'usual', label: area + ' \u00b7 Your usual role', labelToday: area + ' \u00b7 Your usual role', short: 'Your usual role' };
  }

  // Text for the status band at the top of a card.
  function coverageLabel(cov, isToday) {
    if (!cov) return '';
    return isToday ? (cov.labelToday || cov.label) : cov.label;
  }

  // Other people scheduled in the same room during an overlapping window.
  // Returns [{ assignment, start, end }] sorted by start; start/end = the overlap window.
  function withYou(target, items) {
    var out = [];
    (items || []).forEach(function (o) {
      if (o === target || o.id === target.id) return;
      if (o.teacherId === target.teacherId) return;
      if (!o.locationId || o.locationId !== target.locationId) return;
      if (!overlaps(o, target)) return;
      out.push({
        assignment: o,
        start: toMinutes(o.start) > toMinutes(target.start) ? o.start : target.start,
        end: toMinutes(o.end) < toMinutes(target.end) ? o.end : target.end
      });
    });
    return out.sort(function (x, y) { return toMinutes(x.start) - toMinutes(y.start); });
  }

  // The next block for the same person after `target` (items = that person's list).
  function nextAfter(target, items) {
    var later = (items || []).filter(function (o) {
      if (o.id === target.id) return false;
      return compareISO(o.date, target.date) > 0 || (o.date === target.date && toMinutes(o.start) >= toMinutes(target.end));
    }).sort(byTime);
    return later[0] || null;
  }

  // ---------- Publishing ----------
  var SNAPSHOT_FIELDS = ['teacherId', 'date', 'start', 'end', 'area', 'locationId', 'positionId', 'coveringForTeacherId', 'note'];

  function norm(v) { return v == null ? '' : String(v); }

  function snapshotOf(a, publishedAtIso) {
    var s = {};
    SNAPSHOT_FIELDS.forEach(function (f) { s[f] = norm(a[f]); });
    s.publishedAt = publishedAtIso;
    return s;
  }

  function isDirty(a) {
    if (!a.published) return true;
    for (var i = 0; i < SNAPSHOT_FIELDS.length; i++) {
      var f = SNAPSHOT_FIELDS[i];
      if (norm(a[f]) !== norm(a.published[f])) return true;
    }
    return false;
  }

  function publishState(a) {
    if (!a.published) return 'draft';      // never published: teacher can't see it
    if (isDirty(a)) return 'changed';      // published before, edited since: teacher sees the old version
    return 'published';
  }

  // What the teacher sees: the published snapshot (id kept). null if nothing published.
  function teacherView(a) {
    if (!a.published) return null;
    var v = {};
    SNAPSHOT_FIELDS.forEach(function (f) { v[f] = a.published[f]; });
    v.id = a.id;
    v.publishedAt = a.published.publishedAt;
    return v;
  }

  function inWeek(dateIso, weekStartIso) {
    return dateIso >= weekStartIso && dateIso < addDays(weekStartIso, 7);
  }

  // An assignment "touches" a week if its live date OR its published date is in it
  // (a shift moved out of the week must disappear from teachers when the week is published).
  function touchesWeek(a, weekStartIso) {
    return inWeek(a.date, weekStartIso) || !!(a.published && inWeek(a.published.date, weekStartIso));
  }

  function copyOf(a) { var c = {}; Object.keys(a).forEach(function (k) { c[k] = a[k]; }); return c; }

  // Returns a NEW array with every assignment in the week published. Untouched rows keep their publishedAt.
  function publishWeek(assignments, weekStartIso, publishedAtIso) {
    return assignments.map(function (a) {
      if (!touchesWeek(a, weekStartIso)) return a;
      if (!isDirty(a)) return a;
      var copy = copyOf(a);
      copy.published = inWeek(a.date, weekStartIso) ? snapshotOf(a, publishedAtIso) : null;
      return copy;
    });
  }

  // Publish a single assignment (used for "Save & publish now").
  function publishOne(assignments, id, publishedAtIso) {
    return assignments.map(function (a) {
      if (a.id !== id || !isDirty(a)) return a;
      var copy = copyOf(a);
      copy.published = snapshotOf(a, publishedAtIso);
      return copy;
    });
  }

  function weekSummary(assignments, weekStartIso) {
    var inWk = assignments.filter(function (a) { return touchesWeek(a, weekStartIso); });
    var drafts = 0, changed = 0, published = 0;
    inWk.forEach(function (a) {
      var s = publishState(a);
      if (s === 'draft') drafts++; else if (s === 'changed') changed++; else published++;
    });
    var live = assignments.filter(function (a) { return inWeek(a.date, weekStartIso); });
    return {
      total: live.length, drafts: drafts, changed: changed, published: published,
      unpublished: drafts + changed, conflicts: findConflicts(live).length
    };
  }

  // ---------- Validation ----------
  // errors block saving; warnings are shown but allow saving.
  function validateAssignment(a, ctx) {
    var errors = [], warnings = [];
    if (!a.teacherId) errors.push('Choose a teacher.');
    if (!isValidISODate(a.date)) errors.push('Choose a date.');
    else if (isWeekend(a.date)) warnings.push(formatDate(a.date, 'long') + ' is a weekend.');
    if (!isValidTime(a.start) || !isValidTime(a.end)) errors.push('Enter a start and end time.');
    else if (toMinutes(a.end) <= toMinutes(a.start)) errors.push('End time must be after start time.');
    if (!AREAS[a.area]) errors.push('Choose Preschool or Elementary.');
    if (!a.locationId) errors.push('Choose a room or location.');
    if (!a.positionId) errors.push('Choose the position for this shift.');
    if (ctx && ctx.locations && a.locationId) {
      var loc = ctx.locations[a.locationId];
      if (loc && !areaMatches(loc.area, a.area)) {
        warnings.push(loc.name + ' is in the ' + areaLabel(loc.area) + ' building, but this shift is marked ' + areaLabel(a.area) + '.');
      }
    }
    if (ctx && ctx.positions && a.positionId) {
      var pos = ctx.positions[a.positionId];
      if (pos && !areaMatches(pos.area, a.area)) {
        warnings.push('\u201c' + pos.label + '\u201d is a ' + areaLabel(pos.area) + ' position, but this shift is marked ' + areaLabel(a.area) + '.');
      }
    }
    return { errors: errors, warnings: warnings };
  }

  function validateTeacher(t) {
    var errors = [];
    if (!t.name || !String(t.name).trim()) errors.push('Enter a name.');
    if (!USUAL_AREAS[t.usualArea]) errors.push('Choose a usual area.');
    if (!/^\d{4}$/.test(String(t.pin || ''))) errors.push('PIN must be 4 digits.');
    return errors;
  }

  // ---------- Helpers ----------
  // Does any assignment still reference this teacher (live, published snapshot, or as the person covered for)?
  function assignmentsReferencing(teacherId, assignments) {
    return (assignments || []).filter(function (a) {
      if (a.teacherId === teacherId || a.coveringForTeacherId === teacherId) return true;
      return !!(a.published && (a.published.teacherId === teacherId || a.published.coveringForTeacherId === teacherId));
    });
  }

  function newId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function byTime(a, b) {
    return compareISO(a.date, b.date) || (toMinutes(a.start) - toMinutes(b.start)) || (toMinutes(a.end) - toMinutes(b.end));
  }

  function indexBy(list, key) {
    var m = {};
    (list || []).forEach(function (x) { m[x[key || 'id']] = x; });
    return m;
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('');
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
  }

  function greeting(hour) {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  return {
    AREAS: AREAS, USUAL_AREAS: USUAL_AREAS, DAY_NAMES: DAY_NAMES, DAY_SHORT: DAY_SHORT,
    SNAPSHOT_FIELDS: SNAPSHOT_FIELDS,
    areaLabel: areaLabel, areaMatches: areaMatches,
    toISODate: toISODate, fromISODate: fromISODate, isValidISODate: isValidISODate, todayISO: todayISO,
    addDays: addDays, dayOfWeek: dayOfWeek, weekStart: weekStart, weekDays: weekDays, isWeekend: isWeekend,
    upcomingSchoolWeekStart: upcomingSchoolWeekStart, compareISO: compareISO,
    formatDate: formatDate, formatWeekLabel: formatWeekLabel, relativeDayLabel: relativeDayLabel,
    isValidTime: isValidTime, toMinutes: toMinutes, fromMinutes: fromMinutes, formatTime: formatTime,
    formatRange: formatRange, durationLabel: durationLabel, timeStatus: timeStatus,
    overlaps: overlaps, findConflicts: findConflicts, conflictIndex: conflictIndex, conflictsForCandidate: conflictsForCandidate,
    coverage: coverage, coverageLabel: coverageLabel, withYou: withYou, nextAfter: nextAfter,
    snapshotOf: snapshotOf, isDirty: isDirty, publishState: publishState, teacherView: teacherView,
    inWeek: inWeek, touchesWeek: touchesWeek, publishWeek: publishWeek, publishOne: publishOne, weekSummary: weekSummary,
    validateAssignment: validateAssignment, validateTeacher: validateTeacher,
    assignmentsReferencing: assignmentsReferencing, newId: newId, byTime: byTime, indexBy: indexBy, initials: initials, firstName: firstName, greeting: greeting
  };
});
