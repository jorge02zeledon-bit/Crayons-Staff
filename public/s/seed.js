/*
 * seed.js — sample data for one school week.
 * buildSeed(weekStartIso) materializes the week relative to a Monday, so the demo
 * always lands on the current (or upcoming) week. Day offsets: 0 = Mon ... 4 = Fri.
 * Loaded in the browser as window.Seed and in Node for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Seed = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Positions name the job in the room. "area" limits the picker: preschool / elementary / both.
  // The two "Coverage" labels are kept so the director can use that wording if preferred;
  // the sample week uses "Lead Teacher" / "Assistant" plus a "covering for" name, which tells
  // the teacher what they actually do in the room.
  var positions = [
    { id: 'pos_director',   label: 'Director',                   area: 'both' },
    { id: 'pos_lead_pre',   label: 'Lead Preschool Teacher',     area: 'preschool' },
    { id: 'pos_asst_pre',   label: 'Preschool Assistant',        area: 'preschool' },
    { id: 'pos_lead_el',    label: 'Lead Elementary Teacher',    area: 'elementary' },
    { id: 'pos_aide_el',    label: 'Elementary Aide',            area: 'elementary' },
    { id: 'pos_lead',       label: 'Lead Teacher',               area: 'both' },
    { id: 'pos_assist',     label: 'Assistant',                  area: 'both' },
    { id: 'pos_float',      label: 'Floating Support',           area: 'both' },
    { id: 'pos_lunch',      label: 'Lunch & Recess Supervisor',  area: 'both' },
    { id: 'pos_aftercare',  label: 'Aftercare Supervisor',       area: 'both' },
    { id: 'pos_office',     label: 'Front Office Support',       area: 'both' },
    { id: 'pos_cover_pre',  label: 'Preschool Coverage',         area: 'preschool' },
    { id: 'pos_cover_el',   label: 'Elementary Coverage',        area: 'elementary' }
  ];

  var locations = [
    { id: 'loc_butterfly',  name: 'Butterfly Room',      area: 'preschool',  detail: 'Preschool building · Twos & Threes' },
    { id: 'loc_sunflower',  name: 'Sunflower Room',      area: 'preschool',  detail: 'Preschool building · Pre-K' },
    { id: 'loc_pre_yard',   name: 'Preschool Playground', area: 'preschool', detail: 'Behind the Preschool building' },
    { id: 'loc_101',        name: 'Room 101',            area: 'elementary', detail: 'Elementary building · K–1' },
    { id: 'loc_102',        name: 'Room 102',            area: 'elementary', detail: 'Elementary building · Grades 2–3' },
    { id: 'loc_library',    name: 'Library',             area: 'elementary', detail: 'Elementary building, upstairs' },
    { id: 'loc_cafeteria',  name: 'Cafeteria',           area: 'shared',     detail: 'Main building · shared' },
    { id: 'loc_office',     name: 'Front Office',        area: 'shared',     detail: 'Main building · shared' }
  ];

  var teachers = [
    { id: 't_dana',   name: 'Dana Reyes',   role: 'admin',   usualArea: 'both',       usualPositionId: 'pos_director', usualLocationId: 'loc_office',    pin: '0000', active: true },
    { id: 't_maria',  name: 'Maria Lopez',  role: 'teacher', usualArea: 'preschool',  usualPositionId: 'pos_lead_pre', usualLocationId: 'loc_butterfly', pin: '1111', active: true },
    { id: 't_tom',    name: 'Tom Nguyen',   role: 'teacher', usualArea: 'preschool',  usualPositionId: 'pos_lead_pre', usualLocationId: 'loc_sunflower', pin: '2222', active: true },
    { id: 't_keisha', name: 'Keisha Brown', role: 'teacher', usualArea: 'preschool',  usualPositionId: 'pos_asst_pre', usualLocationId: 'loc_butterfly', pin: '3333', active: true },
    { id: 't_sarah',  name: 'Sarah Kim',    role: 'teacher', usualArea: 'elementary', usualPositionId: 'pos_lead_el',  usualLocationId: 'loc_101',       pin: '4444', active: true },
    { id: 't_david',  name: 'David Ortiz',  role: 'teacher', usualArea: 'elementary', usualPositionId: 'pos_lead_el',  usualLocationId: 'loc_102',       pin: '5555', active: true },
    { id: 't_priya',  name: 'Priya Patel',  role: 'teacher', usualArea: 'elementary', usualPositionId: 'pos_aide_el',  usualLocationId: 'loc_101',       pin: '6666', active: true },
    { id: 't_alex',   name: 'Alex Rivera',  role: 'teacher', usualArea: 'both',       usualPositionId: 'pos_float',    usualLocationId: '',              pin: '7777', active: true }
  ];

  // [dayOffset, teacherId, start, end, area, locationId, positionId, note, options]
  // options.draft = true        -> left unpublished so the admin screen shows draft + conflict handling
  // options.coveringFor = id    -> the teacher card reads "Lead Teacher · covering for David Ortiz"
  var week = [
    // ---------- Monday ----------
    [0, 't_maria',  '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_lead_pre', ''],
    [0, 't_keisha', '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_asst_pre', ''],
    [0, 't_tom',    '07:30', '15:30', 'preschool',  'loc_sunflower', 'pos_lead_pre', ''],
    [0, 't_sarah',  '07:45', '15:15', 'elementary', 'loc_101',       'pos_lead_el',  ''],
    [0, 't_david',  '07:45', '15:15', 'elementary', 'loc_102',       'pos_lead_el',  ''],
    [0, 't_priya',  '07:45', '11:30', 'elementary', 'loc_101',       'pos_aide_el',  ''],
    [0, 't_priya',  '11:30', '12:30', 'elementary', 'loc_cafeteria', 'pos_lunch',    'Elementary lunch, then recess on the big field.'],
    [0, 't_priya',  '12:30', '15:15', 'elementary', 'loc_102',       'pos_aide_el',  ''],
    [0, 't_alex',   '07:30', '11:30', 'preschool',  'loc_sunflower', 'pos_float',    ''],
    [0, 't_alex',   '11:30', '12:30', 'preschool',  'loc_pre_yard',  'pos_lunch',    ''],
    [0, 't_alex',   '12:30', '15:30', 'elementary', 'loc_library',   'pos_float',    'Reading groups with Room 101 at 1:00.'],
    [0, 't_alex',   '15:30', '17:30', 'elementary', 'loc_cafeteria', 'pos_aftercare', ''],

    // ---------- Tuesday ----------
    [1, 't_maria',  '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_lead_pre', ''],
    [1, 't_keisha', '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_asst_pre', ''],
    [1, 't_tom',    '07:30', '15:30', 'preschool',  'loc_sunflower', 'pos_lead_pre', 'Fire drill at 10:00. Line up at the back gate.'],
    [1, 't_sarah',  '07:45', '15:15', 'elementary', 'loc_101',       'pos_lead_el',  'Fire drill at 10:00.'],
    [1, 't_david',  '07:45', '15:15', 'elementary', 'loc_102',       'pos_lead_el',  'Fire drill at 10:00.'],
    [1, 't_priya',  '07:45', '11:30', 'elementary', 'loc_102',       'pos_aide_el',  ''],
    [1, 't_priya',  '11:30', '12:30', 'elementary', 'loc_cafeteria', 'pos_lunch',    ''],
    [1, 't_priya',  '12:30', '15:15', 'elementary', 'loc_101',       'pos_aide_el',  ''],
    [1, 't_alex',   '07:30', '11:30', 'preschool',  'loc_butterfly', 'pos_float',    ''],
    [1, 't_alex',   '11:30', '12:30', 'preschool',  'loc_pre_yard',  'pos_lunch',    ''],
    [1, 't_alex',   '12:30', '15:30', 'elementary', 'loc_library',   'pos_float',    ''],
    [1, 't_keisha', '15:30', '17:30', 'preschool',  'loc_cafeteria', 'pos_aftercare', 'Aftercare is in the cafeteria this week while the gym floor is redone.'],

    // ---------- Wednesday (cross-coverage #1: Maria covers Elementary) ----------
    [2, 't_maria',  '07:30', '12:30', 'preschool',  'loc_butterfly', 'pos_lead_pre', ''],
    [2, 't_maria',  '12:30', '15:30', 'elementary', 'loc_102',       'pos_lead',
      'David has a dentist appointment. His lesson plans are in the blue binder on his desk. Priya knows the class routine and will be with you all afternoon. Dismissal is at 3:15 from the side door.', { coveringFor: 't_david' }],
    [2, 't_keisha', '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_asst_pre', 'Alex joins you at 12:30 while Maria is in Room 102.'],
    [2, 't_tom',    '07:30', '15:30', 'preschool',  'loc_sunflower', 'pos_lead_pre', ''],
    [2, 't_sarah',  '07:45', '15:15', 'elementary', 'loc_101',       'pos_lead_el',  ''],
    [2, 't_david',  '07:45', '12:30', 'elementary', 'loc_102',       'pos_lead_el',  'Half day. Maria covers your room from 12:30.'],
    [2, 't_priya',  '07:45', '11:30', 'elementary', 'loc_101',       'pos_aide_el',  ''],
    [2, 't_priya',  '11:30', '12:30', 'elementary', 'loc_cafeteria', 'pos_lunch',    ''],
    [2, 't_priya',  '12:30', '15:15', 'elementary', 'loc_102',       'pos_aide_el',  'Maria is covering for David this afternoon. Please help her with the 2:00 transition.'],
    [2, 't_alex',   '07:30', '11:30', 'elementary', 'loc_library',   'pos_float',    ''],
    [2, 't_alex',   '11:30', '12:30', 'elementary', 'loc_cafeteria', 'pos_lunch',    ''],
    [2, 't_alex',   '12:30', '15:30', 'preschool',  'loc_butterfly', 'pos_float',    'Support Keisha in Butterfly while Maria is in Room 102.'],
    [2, 't_alex',   '15:30', '17:30', 'elementary', 'loc_cafeteria', 'pos_aftercare', ''],

    // ---------- Thursday (cross-coverage #2: Sarah covers Preschool) ----------
    [3, 't_sarah',  '07:30', '11:30', 'preschool',  'loc_butterfly', 'pos_assist',
      'Keisha is out sick. Maria is the lead in the room and will show you the morning routine. You will help with breakfast, circle time, and the 10:00 playground block. Nap mats are in the closet by the door.', { coveringFor: 't_keisha' }],
    [3, 't_sarah',  '11:30', '15:15', 'elementary', 'loc_101',       'pos_lead_el',  'Alex has your class until 11:30.'],
    [3, 't_maria',  '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_lead_pre', 'Sarah is with you until 11:30 while Keisha is out.'],
    [3, 't_tom',    '07:30', '15:30', 'preschool',  'loc_sunflower', 'pos_lead_pre', ''],
    [3, 't_david',  '07:45', '15:15', 'elementary', 'loc_102',       'pos_lead_el',  ''],
    [3, 't_priya',  '07:45', '11:30', 'elementary', 'loc_101',       'pos_aide_el',  'Alex leads Room 101 this morning while Sarah is in Preschool.'],
    [3, 't_priya',  '11:30', '12:30', 'elementary', 'loc_cafeteria', 'pos_lunch',    ''],
    [3, 't_priya',  '12:30', '15:15', 'elementary', 'loc_102',       'pos_aide_el',  ''],
    [3, 't_alex',   '07:45', '11:30', 'elementary', 'loc_101',       'pos_lead',     'Lead Room 101 until Sarah is back at 11:30. Morning work is on the front table.', { coveringFor: 't_sarah' }],
    [3, 't_alex',   '11:30', '12:30', 'preschool',  'loc_pre_yard',  'pos_lunch',    ''],
    [3, 't_alex',   '12:30', '15:30', 'preschool',  'loc_butterfly', 'pos_asst_pre', 'Cover Keisha’s afternoon in Butterfly.', { coveringFor: 't_keisha' }],
    // Draft only (not published): overlaps Alex’s Room 101 block, so the admin sees a conflict.
    [3, 't_alex',   '10:00', '12:00', 'elementary', 'loc_office',    'pos_office',   'Cover the front desk while Dana is at the district meeting.', { draft: true }],

    // ---------- Friday (cross-coverage #3: Priya covers Preschool) ----------
    [4, 't_maria',  '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_lead_pre', ''],
    [4, 't_keisha', '07:30', '15:30', 'preschool',  'loc_butterfly', 'pos_asst_pre', 'Welcome back!'],
    [4, 't_tom',    '07:30', '15:30', 'preschool',  'loc_sunflower', 'pos_lead_pre', 'Priya joins you at 12:30 for field trip prep.'],
    [4, 't_sarah',  '07:45', '15:15', 'elementary', 'loc_101',       'pos_lead_el',  ''],
    [4, 't_david',  '07:45', '15:15', 'elementary', 'loc_102',       'pos_lead_el',  ''],
    [4, 't_priya',  '07:45', '11:30', 'elementary', 'loc_102',       'pos_aide_el',  ''],
    [4, 't_priya',  '11:30', '12:30', 'elementary', 'loc_cafeteria', 'pos_lunch',    ''],
    [4, 't_priya',  '12:30', '15:30', 'preschool',  'loc_sunflower', 'pos_asst_pre',
      'Helping Tom get Pre-K ready for next week’s field trip. Tom will walk you through the pickup routine at 12:30.'],
    [4, 't_alex',   '07:30', '11:30', 'preschool',  'loc_sunflower', 'pos_float',    ''],
    [4, 't_alex',   '11:30', '12:30', 'preschool',  'loc_pre_yard',  'pos_lunch',    ''],
    [4, 't_alex',   '12:30', '15:30', 'elementary', 'loc_101',       'pos_aide_el',  'Priya is in Preschool this afternoon; you are her cover in Room 101.', { coveringFor: 't_priya' }],
    [4, 't_alex',   '15:30', '17:30', 'elementary', 'loc_cafeteria', 'pos_aftercare', '']
  ];

  function addDaysIso(iso, n) {
    var p = iso.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function buildSeed(weekStartIso, publishedAtIso) {
    // Default: the Sunday evening before the week. The app passes an earlier time if that is still in the future.
    var publishedAt = publishedAtIso || (addDaysIso(weekStartIso, -1) + 'T20:00:00');
    var assignments = week.map(function (row, i) {
      var opts = row[8] || {};
      var a = {
        id: 'a_seed_' + (i + 1),
        teacherId: row[1],
        date: addDaysIso(weekStartIso, row[0]),
        start: row[2],
        end: row[3],
        area: row[4],
        locationId: row[5],
        positionId: row[6],
        coveringForTeacherId: opts.coveringFor || '',
        note: row[7] || '',
        updatedAt: publishedAt,
        published: null
      };
      if (!opts.draft) {
        a.published = {
          teacherId: a.teacherId, date: a.date, start: a.start, end: a.end, area: a.area,
          locationId: a.locationId, positionId: a.positionId, coveringForTeacherId: a.coveringForTeacherId,
          note: a.note, publishedAt: publishedAt
        };
      }
      return a;
    });

    return {
      version: 1,
      seedVersion: 2,
      seededWeekStart: weekStartIso,
      userEdited: false,
      settings: {
        schoolName: 'Hillside Preschool & Elementary',
        adminName: 'Dana Reyes',
        adminPhone: '555-0142',
        adminContact: 'Front office, or text 555-0142',
        blocks: { am: ['07:30', '12:00'], pm: ['12:30', '15:30'], full: ['07:30', '15:30'] },
        demoToday: null
      },
      positions: positions.map(function (p) { return Object.assign({}, p); }),
      locations: locations.map(function (l) { return Object.assign({}, l); }),
      teachers: teachers.map(function (t) { return Object.assign({}, t); }),
      assignments: assignments
    };
  }

  return { buildSeed: buildSeed, positions: positions, locations: locations, teachers: teachers, weekTemplate: week };
});
