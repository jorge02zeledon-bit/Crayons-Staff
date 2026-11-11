/*
 * app.js — UI for the staff schedule.
 * Plain JS, hash routes. State lives on the server (see /api/state); this file only
 * renders it and, for admins, sends it back. Depends on core.js (window.Core) and seed.js (window.Seed).
 */
(function () {
  'use strict';
  var C = window.Core, Seed = window.Seed;
  var boot = { staff: [], schoolName: 'Staff schedule', adminName: '', authConfigured: true, storage: 'file', loaded: false, error: '' };

  // ---------------------------------------------------------------- state
  var state = null;      // { version, seedVersion, seededWeekStart, userEdited, settings, positions, locations, teachers, assignments }
  var session = null;    // { teacherId }
  var ui = {
    route: null,          // 'login' | 'me' | 'admin-week' | 'admin-board' | 'admin-staff' | 'admin-menu' | 'preview-<teacherId>'
    lastRoute: null,
    adminWeek: null,      // ISO Monday
    adminDay: null,       // ISO date
    boardDay: null,
    teacherWeekOffset: null, // null = decide on first render; 0 = this week, 1 = next week
    dashWeek: null,          // ISO Monday shown on the dashboard grid
    loginPerson: null,
    loginError: '',
    sheet: null,          // { kind: 'assignment'|'teacher', model, errors, warnings, isNew, reassign }
    dialog: null,         // { title, body, confirmLabel, danger, onConfirm }
    toast: null,
    toastTimer: null,
    returnFocus: null
  };

  function freshState() {
    var weekStart = C.upcomingSchoolWeekStart(C.todayISO());
    var st = Seed.buildSeed(weekStart, new Date().toISOString());
    st.settings.schoolName = boot.schoolName || st.settings.schoolName;
    return sanitizeSettings(st);
  }
  // demoToday only makes sense inside the current school week; otherwise forget it.
  function sanitizeSettings(st) {
    st.settings = st.settings || {};
    var weekStart = C.upcomingSchoolWeekStart(C.todayISO());
    if (st.settings.demoToday && !C.inWeek(st.settings.demoToday, weekStart)) st.settings.demoToday = null;
    if (!st.settings.demoTime) st.settings.demoTime = '10:00';
    if (st.settings.showDemoPins === undefined) st.settings.showDemoPins = false;
    if (!st.settings.blocks) st.settings.blocks = { am: ['07:30', '12:00'], pm: ['12:30', '15:30'], full: ['07:30', '15:30'] };
    return st;
  }

  // ---- server I/O
  function api(method, path, body) {
    return fetch(path, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; });
    });
  }
  var saveTimer = null, saveQueued = false, saving = false;
  // Admin edits are sent back as one document, debounced. Teachers never save.
  function save() {
    if (!session || !isAdmin(currentUser())) return;
    saveQueued = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }
  function flushSave() {
    if (!saveQueued || saving) return;
    saveQueued = false; saving = true;
    api('PUT', '/api/state', state).then(function (j) {
      saving = false;
      if (j.__status !== 200) { toast(j.error || 'Could not save. Check your connection and try again.'); saveQueued = true; }
      else if (saveQueued) flushSave();
    }).catch(function () { saving = false; saveQueued = true; toast('Could not save. Check your connection.'); });
  }
  window.addEventListener('beforeunload', function () {
    if (saveQueued && state) { try { fetch('/api/state', { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }); } catch (e) { /* ignore */ } }
  });
  function markEdited() { if (state) state.userEdited = true; }

  function loadStaff() {
    return api('GET', '/api/staff').then(function (j) {
      if (j.__status === 200) { boot.staff = j.staff || []; boot.schoolName = j.schoolName || boot.schoolName; boot.adminName = j.adminName || ''; boot.authConfigured = j.authConfigured !== false; boot.storage = j.storage || 'file'; }
      else boot.error = j.error || 'The server did not answer.';
    }).catch(function () { boot.error = 'Could not reach the server.'; });
  }
  function loadState() {
    return api('GET', '/api/state').then(function (j) {
      if (j.__status === 200) { state = sanitizeSettings(j.state); session = { teacherId: j.me, role: j.role }; boot.storage = j.storage || boot.storage; }
      else { state = null; session = null; }
    }).catch(function () { state = null; session = null; });
  }

  // ---------------------------------------------------------------- lookups
  function T() { return C.indexBy(state.teachers); }
  function L() { return C.indexBy(state.locations); }
  function P() { return C.indexBy(state.positions); }
  function todayISO() { return (state && state.settings && state.settings.demoToday) || C.todayISO(); }
  // With "Pretend today is" set, the clock is pretend too (settings.demoTime), so Now / Later today / Done make sense.
  function nowMinutes() {
    if (state && state.settings && state.settings.demoToday) return C.toMinutes(state.settings.demoTime || '10:00');
    var d = new Date(); return d.getHours() * 60 + d.getMinutes();
  }
  function nowHour() { return Math.floor(nowMinutes() / 60); }
  function nowStamp() { return new Date().toISOString(); }
  function currentUser() { return session && state ? T()[session.teacherId] || null : null; }
  function isAdmin(t) { return !!t && t.role === 'admin'; }
  function activeTeachers() { return state.teachers.filter(function (t) { return t.active !== false; }); }
  function posLabel(id) { var p = P()[id]; return p ? p.label : 'Position not set'; }
  function locName(id) { var l = L()[id]; return l ? l.name : 'Location not set'; }
  function locDetail(id) { var l = L()[id]; return l ? (l.detail || '') : ''; }
  function teacherName(id) { var t = T()[id]; return t ? t.name : 'Unknown'; }
  function adminFirst() { return C.firstName(state.settings.adminName) || 'the office'; }
  function usualAreaWord(t) { return t.usualArea === 'both' ? 'both areas' : C.areaLabel(t.usualArea); }

  // Items a teacher actually sees: published snapshots only (filtered by the snapshot's teacher).
  function publishedItemsFor(teacherId) {
    var out = [];
    state.assignments.forEach(function (a) {
      var v = C.teacherView(a);
      if (v && v.teacherId === teacherId) { v.state = 'published'; out.push(v); }
    });
    return out.sort(C.byTime);
  }
  function allPublishedItems() {
    var out = [];
    state.assignments.forEach(function (a) { var v = C.teacherView(a); if (v) out.push(v); });
    return out;
  }
  // Admin preview: live fields, with publish state so drafts are marked.
  function liveItemsFor(teacherId) {
    return state.assignments.filter(function (a) { return a.teacherId === teacherId; })
      .map(function (a) { var v = {}; Object.keys(a).forEach(function (k) { v[k] = a[k]; }); v.state = C.publishState(a); return v; })
      .sort(C.byTime);
  }

  // ---------------------------------------------------------------- html helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function svg(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>';
  }
  var ICON = {
    swap: svg('<path d="M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3 3m-3-3 3-3"/>'),
    blocks: svg('<rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><rect x="8.5" y="4" width="7" height="7" rx="1"/>'),
    book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M9 7h7M9 11h5"/>'),
    pin: svg('<path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z"/><circle cx="12" cy="11" r="2"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    check: svg('<path d="M5 12l5 5L20 7"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    warn: svg('<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    board: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21.5 20"/>'),
    person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    logout: svg('<path d="M10 17l5-5-5-5M15 12H3M13 3h6v18h-6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    left: svg('<path d="M15 5l-7 7 7 7"/>'),
    right: svg('<path d="M9 5l7 7-7 7"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    school: svg('<path d="M3 10l9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c0 1 2.5 2 5 2s5-1 5-2v-5"/>'),
    note: svg('<path d="M5 4h11l3 3v13H5z"/><path d="M8 12h8M8 16h5"/>'),
    pencil: svg('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M13 7l3 3"/>'),
    dot: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
    eye: svg('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    message: svg('<path d="M4 5h16v11H9l-5 4z"/>')
  };
  function areaIcon(area) { return area === 'preschool' ? ICON.blocks : area === 'elementary' ? ICON.book : ''; }

  // One badge component. TINT everywhere; the SOLID cross band lives on the card instead.
  function areaBadge(area) {
    var cls = area === 'preschool' ? 'badge-pre' : area === 'elementary' ? 'badge-el' : '';
    return '<span class="badge ' + cls + '">' + areaIcon(area) + esc(C.areaLabel(area)) + '</span>';
  }
  function coverageBadge(cov) {
    if (!cov) return '';
    if (cov.kind === 'cross') return '<span class="badge badge-cross">' + ICON.swap + esc(cov.short) + '</span>';
    if (cov.kind === 'different-position') return '<span class="badge">' + ICON.tag + 'Different position</span>';
    return '';
  }
  function stateBadge(st) {
    if (st === 'draft') return '<span class="badge badge-draft">' + ICON.pencil + 'Draft · not visible yet</span>';
    if (st === 'changed') return '<span class="badge badge-changed">' + ICON.dot + 'Changed · not published</span>';
    if (st === 'published') return '<span class="badge badge-ok">' + ICON.check + 'Published</span>';
    return '';
  }
  function avatar(t) {
    var cls = !t ? '' : t.usualArea === 'preschool' ? 'pre' : t.usualArea === 'elementary' ? 'el' : 'both';
    return '<span class="avatar ' + cls + '" aria-hidden="true">' + esc(C.initials(t ? t.name : '?')) + '</span>';
  }
  function timeSuffix(item, today) {
    var st = C.timeStatus(item, today, nowMinutes());
    if (st === 'now') return '<span class="now">Now</span>';
    if (st === 'later-today') return '<span class="muted">Later today</span>';
    if (st === 'done-today') return '<span class="muted">Done</span>';
    return '';
  }
  function timeEl(item) {
    return '<time datetime="' + esc(item.date + 'T' + item.start) + '">' + esc(C.formatTime(item.start)) + '</time> – <time datetime="' + esc(item.date + 'T' + item.end) + '">' + esc(C.formatTime(item.end)) + '</time>';
  }
  function fmtStamp(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var h = d.getHours(), m = d.getMinutes(), suf = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    return C.DAY_SHORT[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate() + ', ' + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + suf;
  }
  function phoneLink() {
    var ph = String(state.settings.adminPhone || '').trim();
    var digits = ph.replace(/[^\d+]/g, '');
    if (!ph) return '';
    var inner = ICON.message + '<span>Questions? Text ' + esc(adminFirst()) + ': <strong class="tnum">' + esc(ph) + '</strong></span>';
    if (digits.replace(/\D/g, '').length < 7) return '<p class="contact-link">' + inner + '</p>';
    return '<a class="contact-link" href="sms:' + esc(digits) + '">' + inner + '</a>';
  }

  // ---------------------------------------------------------------- routing
  function readHash() {
    var h = (location.hash || '').replace(/^#\/?/, '').trim();
    return h || null;
  }
  function go(route) {
    ui.route = route;
    render();
  }
  function resolveRoute() {
    var user = currentUser();
    var r = ui.route || readHash();
    if (!user) return 'login';
    if (isAdmin(user)) {
      if (!r || r === 'login') return 'dash';
      if (r === 'me' || r === 'dash' || /^admin-(week|board|staff|menu)$/.test(r) || /^preview-/.test(r)) return r;
      return 'dash';
    }
    return r === 'me' ? 'me' : 'dash';
  }
  var TITLES = { login: 'Sign in', dash: 'Dashboard', me: 'My Schedule', 'admin-week': 'Schedule builder', 'admin-board': 'Who is where', 'admin-staff': 'Staff', 'admin-menu': 'Menu' };

  // ---------------------------------------------------------------- render
  // A selector that finds "the same control" again after a re-render, so focus is not dropped to <body>.
  function focusKey(el) {
    if (!el || el === document.body || !el.getAttribute) return null;
    var a = el.getAttribute('data-action');
    if (!a) return el.id ? '#' + el.id : null;
    var sel = '[data-action="' + a + '"]';
    ['data-date', 'data-id', 'data-route', 'data-set', 'data-delta', 'data-target', 'data-start'].forEach(function (k) {
      var v = el.getAttribute(k); if (v != null) sel += '[' + k + '="' + v + '"]';
    });
    return sel;
  }
  function focusEl(el) { if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  function prefersReducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  function render() {
    var route = resolveRoute();
    var routeChanged = route !== ui.lastRoute;
    ui.route = route;
    try { if (readHash() !== route) location.hash = route; } catch (e) { /* ignore */ }
    var app = document.getElementById('app');
    var y = window.scrollY;
    var activeKey = app.contains(document.activeElement) ? focusKey(document.activeElement) : null;
    var html = '';
    app.className = 'app';
    if (route === 'login') html = viewLogin();
    else if (route === 'dash') { app.className = 'app app-dash'; html = viewDash(currentUser()); }
    else if (route === 'me') { app.className = 'app app-teacher has-tabs'; html = viewTeacher(currentUser(), { preview: false }); }
    else if (route.indexOf('preview-') === 0) {
      var t = T()[route.slice(8)];
      app.className = 'app app-teacher';
      html = t ? viewTeacher(t, { preview: true }) : viewAdminStaff();
    }
    else if (route === 'admin-week') html = viewAdminWeek();
    else if (route === 'admin-board') html = viewAdminBoard();
    else if (route === 'admin-staff') html = viewAdminStaff();
    else if (route === 'admin-menu') html = viewAdminMenu();
    app.innerHTML = html;
    renderLayer();
    if (route === 'dash') fillClockedTile();
    document.title = (TITLES[route] || 'My Schedule') + ' · ' + (state ? state.settings.schoolName : boot.schoolName);
    if (routeChanged) {
      ui.lastRoute = route;
      window.scrollTo(0, 0);
      var h1 = app.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); focusEl(h1); }
    } else {
      window.scrollTo(0, y);
      if (activeKey && !ui.sheet && !ui.dialog) { try { focusEl(app.querySelector(activeKey)); } catch (e) { /* bad selector */ } }
      if (route === 'login' && ui.loginError) focusEl(app.querySelector('#pin'));
    }
  }

  function renderLayer() {
    var layer = document.getElementById('layer');
    var app = document.getElementById('app');
    var html = '';
    if (ui.sheet) html += '<div class="scrim" data-action="close-sheet"></div>' + (ui.sheet.kind === 'assignment' ? sheetAssignment() : ui.sheet.kind === 'location' ? sheetLocation() : sheetTeacher());
    if (ui.dialog) html += '<div class="scrim scrim-top" data-action="close-dialog"></div>' + viewDialog();
    layer.innerHTML = html;
    var open = !!(ui.sheet || ui.dialog);
    // Everything behind the top layer is inert: no stray taps or Tab stops.
    try { app.inert = open; } catch (e) { /* older browsers */ }
    var sheetEl = layer.querySelector('.sheet');
    if (sheetEl) { try { sheetEl.inert = !!ui.dialog; } catch (e) { /* ignore */ } }
    syncSegmented(layer);
    if (ui.sheet) {
      if (ui.sheet.kind === 'assignment') { updateEditorLive(ui.sheet.prefill ? 'teacherId' : undefined); ui.sheet.prefill = false; }
      var first = layer.querySelector('.sheet [autofocus]');
      if (first && !ui.sheet.keepFocus && !ui.dialog) focusEl(first);
      ui.sheet.keepFocus = false;
    }
    if (ui.dialog) focusEl(layer.querySelector('.dialog .btn-outline'));
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open && ui.returnFocus) {
      try { focusEl(app.querySelector(ui.returnFocus)); } catch (e) { /* bad selector */ }
      ui.returnFocus = null;
    }
  }
  // Remember what opened a layer so focus can go back there when it closes.
  function rememberFocus() { if (!ui.returnFocus) ui.returnFocus = focusKey(document.activeElement); }
  // Segmented controls: mirror the checked radio onto the label (works without :has()).
  function syncSegmented(root) {
    (root || document).querySelectorAll('.seg label').forEach(function (l) {
      var input = l.querySelector('input'); l.classList.toggle('is-checked', !!(input && input.checked));
    });
  }

  // Toasts live in their own live region so showing or hiding one never re-renders an open sheet.
  function toast(msg) {
    ui.toast = msg;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(function () { ui.toast = null; renderToast(); }, 2800);
    renderToast();
  }
  function renderToast() {
    var region = document.getElementById('toast-region');
    if (region) region.innerHTML = ui.toast ? '<div class="toast">' + esc(ui.toast) + '</div>' : '';
  }

  // ---------------------------------------------------------------- login
  function demoTodayOptions() {
    var weekStart = C.upcomingSchoolWeekStart(C.todayISO());
    return '<option value=""' + (!state.settings.demoToday ? ' selected' : '') + '>The real date and time (' + esc(C.formatDate(C.todayISO(), 'short')) + ')</option>' +
      C.weekDays(weekStart, 5).map(function (d) { return '<option value="' + d + '"' + (state.settings.demoToday === d ? ' selected' : '') + '>' + esc(C.formatDate(d, 'long')) + '</option>'; }).join('');
  }
  function demoTimeOptions() {
    var times = [['06:45', '6:45 AM, before school'], ['10:00', '10:00 AM, mid-morning'], ['13:00', '1:00 PM, afternoon'], ['16:00', '4:00 PM, after school']];
    return times.map(function (t) { return '<option value="' + t[0] + '"' + ((state.settings.demoTime || '10:00') === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('');
  }
  function demoControls() {
    return '<div class="field"><label for="demo-today">Pretend today is</label>' +
      '<select class="select" id="demo-today" data-change="demo-today">' + demoTodayOptions() + '</select></div>' +
      (state.settings.demoToday ? '<div class="field"><label for="demo-time">and the time is</label><select class="select" id="demo-time" data-change="demo-time">' + demoTimeOptions() + '</select></div>' : '') +
      '<p class="hint">The sample week always lands on the current school week. Wednesday, Thursday and Friday have cross-coverage.</p>';
  }
  function viewLogin() {
    var people = boot.staff;
    var sel = ui.loginPerson ? people.filter(function (t) { return t.id === ui.loginPerson; })[0] : null;
    var areaWord = { preschool: 'Preschool', elementary: 'Elementary', both: 'both areas' };
    return '' +
      '<main class="login">' +
      '<header class="login-top"><a href="/schedule"><img class="login-logo" src="/logo.png" alt="' + esc(boot.schoolName) + '"></a></header>' +
      '<h1 class="login-h1">Let’s get to work.</h1>' +
      (boot.error ? '<div class="errors" role="alert">' + esc(boot.error) + '</div>' : '') +
      (!boot.authConfigured ? '<div class="errors" role="alert">Sign-in is not set up yet: add an AUTH_SECRET environment variable in Vercel and redeploy.</div>' : '') +
      '<div class="login-cols">' +
      '<section class="login-col"><h2>Staff Sign In</h2>' +
      '<form class="login-form" data-form="login" id="login-form">' +
      '<div class="field"><label for="who" class="sr-only">Your name</label><select class="select login-input" id="who" name="teacherId" data-change="login-person"><option value="">Your name</option>' +
      people.map(function (t) { return '<option value="' + esc(t.id) + '"' + (sel && sel.id === t.id ? ' selected' : '') + '>' + esc(t.name) + (t.role === 'admin' ? ' (admin)' : '') + '</option>'; }).join('') + '</select></div>' +
      (ui.loginMaster
        ? '<div class="field"><label for="master" class="sr-only">Admin password</label><input class="input login-input" id="master" name="master" type="password" autocomplete="current-password" placeholder="Admin password"></div>'
        : '<div class="field"><label for="pin" class="sr-only">PIN</label><input class="input login-input" id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="PIN" aria-describedby="pin-hint"></div>') +
      (ui.loginError ? '<p class="login-error" role="alert">' + ICON.info + ' ' + esc(ui.loginError) + '</p>' : '') +
      '<p class="login-note" id="pin-hint">' + (sel && sel.pin ? 'Demo PIN for ' + esc(C.firstName(sel.name)) + ': <strong class="tnum">' + esc(sel.pin) + '</strong>.' : 'Your PIN is the 4-digit code the office gave you.') + '</p>' +
      '<p class="login-note">' + (sel ? esc(sel.role === 'admin' ? 'Admin account.' : (sel.usualPosition || '') + (sel.usualArea ? ' · usually ' + (areaWord[sel.usualArea] || sel.usualArea) : '')) : 'Pick your name, then enter your PIN.') + '</p>' +
      '<button class="btn btn-primary btn-block btn-login" type="submit">' + (ui.loginMaster ? 'Sign In with Admin Password' : 'Sign In') + '</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-action="login-master">' + (ui.loginMaster ? 'Use my PIN instead' : 'Admin? Use the admin password instead') + '</button>' +
      '</form></section>' +
      '<section class="login-col"><h2>Break Clock</h2>' +
      '<p class="login-lead">Clocking in, taking a break, or heading home? Scan your badge at the front office, or use the clock on your own phone.</p>' +
      '<a class="btn btn-primary btn-block btn-login" href="/clock">Open the Break Clock</a>' +
      '<p class="login-note">Your schedule, the team dashboard and your hours appear once you sign in.</p>' +
      '</section></div>' +
      '<footer class="login-help"><p>Need some help? Ask <strong>' + esc(boot.adminName || 'the office') + '</strong> at the front office.</p></footer>' +
      '</main>';
  }

  // ---------------------------------------------------------------- teacher: My Schedule
  function defaultTeacherOffset(items, today) {
    var thisWeek = C.weekStart(today);
    var remaining = items.filter(function (v) { return v.date >= today && C.inWeek(v.date, thisWeek); });
    var nextWeek = items.filter(function (v) { return C.inWeek(v.date, C.addDays(thisWeek, 7)); });
    return (!remaining.length && nextWeek.length) ? 1 : 0;
  }

  function viewTeacher(teacher, opts) {
    var preview = !!opts.preview;
    var today = todayISO();
    var items = preview ? liveItemsFor(teacher.id) : publishedItemsFor(teacher.id);
    var everyone = preview ? state.assignments : allPublishedItems();
    if (ui.teacherWeekOffset === null) ui.teacherWeekOffset = defaultTeacherOffset(items, today);
    var todays = items.filter(function (v) { return v.date === today; });
    var hour = nowHour();
    var lastPublished = items.reduce(function (m, v) { return v.publishedAt && v.publishedAt > m ? v.publishedAt : m; }, '');

    var html = '<header class="topbar">' +
      '<span class="brand">' + esc(state.settings.schoolName) + '</span>' +
      '<div class="actions">' +
      (preview
        ? '<a class="btn btn-sm btn-outline" href="#admin-staff" data-action="nav" data-route="admin-staff">' + ICON.back + 'Back to admin</a>'
        : '<a class="btn btn-sm btn-outline" href="/clock">' + ICON.clock + 'Break clock</a><button class="btn btn-sm btn-ghost" type="button" data-action="logout">' + ICON.logout + 'Log out</button>') +
      '</div></header>';

    if (preview) {
      html += '<div class="preview-banner">' + ICON.eye + '<span>Preview as ' + esc(teacher.name) + '. Includes unpublished changes, marked.</span></div>';
    }

    html += '<section class="greeting"><p class="date">' + esc(C.formatDate(today, 'long')) + '</p><h1>' + esc(C.greeting(hour)) + ', ' + esc(C.firstName(teacher.name)) + '</h1>' +
      (lastPublished ? '<p class="stamp">Schedule published ' + esc(fmtStamp(lastPublished)) + '</p>' : '') + '</section>';

    // TODAY
    html += '<section class="section" aria-labelledby="today-h"><div class="section-head"><h2 class="eyebrow" id="today-h">Today</h2>' +
      '<span class="section-sub">' + (todays.length > 1 ? todays.length + ' blocks' : '') + '</span></div>';
    if (todays.length > 1) {
      html += '<p class="summary-line">Today: ' + todays.map(function (v, i) {
        var cov = C.coverage(teacher, v);
        return (i ? 'then ' : '') + '<strong>' + esc(locName(v.locationId)) + '</strong> at ' + esc(C.formatTime(v.start)) + (cov.kind === 'cross' ? ' (covering ' + esc(C.areaLabel(v.area)) + ')' : '');
      }).join(', ') + '.</p>';
    }
    if (!todays.length) {
      var next = items.filter(function (v) { return v.date > today; })[0];
      html += '<div class="card empty-today"><h3>You are not on the schedule today.</h3>' +
        (next ? nextUpCard(teacher, next, today) : '<p class="muted">Nothing else is published yet. Check back after ' + esc(adminFirst()) + ' publishes the schedule.</p>') +
        '</div>';
    } else {
      html += '<div class="today-list">' + todays.map(function (v) { return todayCard(teacher, v, today, items, everyone, { preview: preview }); }).join('') + '</div>';
    }
    html += '</section>';

    // Heads-up: the nearest upcoming cross-coverage block (not today), one strip only.
    var upcomingCross = items.filter(function (v) { return v.date > today && C.coverage(teacher, v).kind === 'cross'; })[0];
    if (upcomingCross) {
      var w = C.withYou(upcomingCross, everyone);
      var thisWeekStart = C.weekStart(today);
      var crossOffset = Math.round((C.fromISODate(C.weekStart(upcomingCross.date)) - C.fromISODate(thisWeekStart)) / (7 * 86400000));
      var dayDiff = Math.round((C.fromISODate(upcomingCross.date) - C.fromISODate(today)) / 86400000);
      var when = dayDiff === 1 ? 'tomorrow' : dayDiff < 6 ? 'on ' + C.formatDate(upcomingCross.date, 'weekday') : 'on ' + C.formatDate(upcomingCross.date, 'short');
      html += '<a class="headsup" href="#day-' + esc(upcomingCross.date) + '" data-action="scroll-to" data-target="day-' + esc(upcomingCross.date) + '" data-set="' + crossOffset + '">' + ICON.swap + '<span><strong>Heads up:</strong> ' + esc(when) +
        ' you are covering <strong>' + esc(C.areaLabel(upcomingCross.area)) + '</strong> in <strong>' + esc(locName(upcomingCross.locationId)) + '</strong>, ' + esc(C.formatRange(upcomingCross.start, upcomingCross.end)) +
        (w.length ? ', with ' + esc(C.firstName(teacherName(w[0].assignment.teacherId))) : '') + '.</span></a>';
    }

    // WEEK
    var offset = ui.teacherWeekOffset;
    var weekStart = C.addDays(C.weekStart(today), 7 * offset);
    var days = C.weekDays(weekStart, 7);
    var weekItems = items.filter(function (v) { return C.inWeek(v.date, weekStart); });
    var title = offset === 0 ? 'Rest of this week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : 'Week of ' + C.formatDate(weekStart, 'month-day');
    var laterDays = days.filter(function (d) { return offset !== 0 || d > today; });
    var earlierDays = offset === 0 ? days.filter(function (d) { return d < today; }) : [];
    var laterItems = weekItems.filter(function (v) { return laterDays.indexOf(v.date) >= 0; });
    var earlierItems = weekItems.filter(function (v) { return earlierDays.indexOf(v.date) >= 0; });

    html += '<section class="section" aria-labelledby="week-h"><div class="section-head"><h2 class="eyebrow" id="week-h">' + esc(title) + '</h2><span class="section-sub tnum">' + esc(C.formatWeekLabel(weekStart)) + '</span></div>';
    if (!weekItems.length) {
      html += '<div class="day-empty">Nothing is published for ' + (offset === 1 ? 'next week' : offset === 0 ? 'this week' : 'that week') + ' yet.</div>';
    } else if (!laterItems.length && offset === 0) {
      html += '<div class="day-empty">Nothing more this week.</div>';
    } else {
      html += dayGroups(teacher, laterDays, laterItems, today, everyone, preview);
    }
    if (earlierItems.length) {
      html += '<details class="earlier"><summary class="details-summary">Earlier this week (' + earlierItems.length + ')</summary>' + dayGroups(teacher, earlierDays, earlierItems, today, everyone, preview) + '</details>';
    }
    html += '<div class="week-switch">' +
      (offset !== 0 ? '<button class="btn btn-outline btn-block" type="button" data-action="teacher-week" data-set="0">' + ICON.left + 'Back to this week</button>' : '') +
      (offset < 1 ? '<button class="btn btn-outline btn-block" type="button" data-action="teacher-week" data-set="' + (offset + 1) + '">Next week' + ICON.right + '</button>' : '') +
      '</div></section>';

    html += '<footer class="footer-help"><p><strong>Something look wrong?</strong> Talk to ' + esc(state.settings.adminName) + '. ' + esc(state.settings.adminContact) + '</p></footer>';
    if (!preview) html += adminTabs('me');
    return html;
  }

  // ---------------------------------------------------------------- dashboard (team week)
  function shiftMinutes(v) { return Math.max(0, C.toMinutes(v.end) - C.toMinutes(v.start)); }
  function hoursLabel(min) { var h = Math.floor(min / 60), m = min % 60; return (m ? (h + m / 60).toFixed(2).replace(/\.?0+$/, '') : h) + (h === 1 && !m ? ' hr' : ' hrs'); }
  function teamItems(admin) {
    if (admin) return state.assignments.map(function (a) { var v = {}; Object.keys(a).forEach(function (k) { v[k] = a[k]; }); v.state = C.publishState(a); return v; });
    return allPublishedItems();
  }
  function viewDash(user) {
    var admin = isAdmin(user);
    var today = todayISO();
    if (ui.dashWeek === undefined || ui.dashWeek === null) ui.dashWeek = C.upcomingSchoolWeekStart(today);
    var ws = ui.dashWeek;
    var items = teamItems(admin).sort(C.byTime);
    var mine = items.filter(function (v) { return v.teacherId === user.id; });
    var todays = mine.filter(function (v) { return v.date === today; });
    var weekMine = mine.filter(function (v) { return C.inWeek(v.date, C.weekStart(today)); });
    var next = mine.filter(function (v) { return v.date > today || (v.date === today && C.toMinutes(v.end) > nowMinutes()); })[0];
    var schedMin = weekMine.reduce(function (n, v) { return n + shiftMinutes(v); }, 0);

    var html = '<header class="topbar"><span class="brand">' + esc(state.settings.schoolName) + '</span><div class="actions">' +
      (admin ? '' : '<a class="btn btn-sm btn-outline" href="/clock">' + ICON.clock + 'Break clock</a>') +
      '<button class="btn btn-sm btn-ghost" type="button" data-action="logout">' + ICON.logout + 'Log out</button></div></header>';
    html += '<section class="greeting"><p class="date">' + esc(C.formatDate(today, 'long')) + '</p><h1>' + esc(C.greeting(nowHour())) + ', ' + esc(C.firstName(user.name)) + '</h1></section>';

    // Tiles
    var todayTile;
    if (!todays.length) todayTile = '<div class="tile"><span class="tile-label">Today</span><strong>Not scheduled</strong><span class="muted">Enjoy the day.</span></div>';
    else {
      var first = todays[0], cov = C.coverage(user, first);
      todayTile = '<a class="tile' + (cov.kind === 'cross' ? ' tile-cross' : '') + '" href="#me" data-action="nav" data-route="me"><span class="tile-label">Today</span><strong>' + esc(locName(first.locationId)) + (todays.length > 1 ? ' +' + (todays.length - 1) : '') + '</strong><span class="muted">' + esc(C.formatTime(first.start)) + ' · ' + esc(posLabel(first.positionId)) + (cov.kind === 'cross' ? ' · ' + esc(cov.short) : '') + '</span></a>';
    }
    html += '<div class="tiles">' + todayTile +
      '<div class="tile"><span class="tile-label">This week</span><strong>' + weekMine.length + (weekMine.length === 1 ? ' shift' : ' shifts') + '</strong><span class="muted">' + esc(hoursLabel(schedMin)) + ' scheduled</span></div>' +
      '<div class="tile" id="tile-clocked"><span class="tile-label">Clocked this week</span><strong>…</strong><span class="muted">from the break clock</span></div>' +
      '<div class="tile"><span class="tile-label">Next up</span>' + (next ? '<strong>' + esc(C.relativeDayLabel(next.date, today)) + ' ' + esc(C.formatTime(next.start)) + '</strong><span class="muted">' + esc(locName(next.locationId)) + ' · ' + esc(posLabel(next.positionId)) + '</span>' : '<strong>Nothing yet</strong><span class="muted">Check back after the next publish.</span>') + '</div>' +
      '</div>';

    // Team grid
    var days = C.weekDays(ws, 7);
    var weekItems = items.filter(function (v) { return C.inWeek(v.date, ws); });
    var showDays = days.filter(function (d) { return !C.isWeekend(d) || weekItems.some(function (v) { return v.date === d; }); });
    var people = activeTeachers().filter(function (t) { return t.id === user.id || weekItems.some(function (v) { return v.teacherId === t.id; }) || admin; });
    people.sort(function (a, b) { return (a.id === user.id ? -1 : b.id === user.id ? 1 : 0) || a.name.localeCompare(b.name); });
    var isThis = ws === C.upcomingSchoolWeekStart(today);
    html += '<section class="section"><div class="grid-head"><h2 class="eyebrow">Team schedule</h2><div class="week-nav grid-nav">' +
      '<button class="btn btn-sm btn-outline" type="button" data-action="dash-week" data-delta="0"' + (isThis ? ' disabled' : '') + '>Today</button>' +
      '<button class="btn btn-sm btn-outline btn-icon" type="button" data-action="dash-week" data-delta="-1" aria-label="Previous week">' + ICON.left + '</button>' +
      '<span class="label tnum">' + esc(C.formatWeekLabel(ws)) + '</span>' +
      '<button class="btn btn-sm btn-outline btn-icon" type="button" data-action="dash-week" data-delta="1" aria-label="Next week">' + ICON.right + '</button></div></div>';
    if (!weekItems.length) html += '<div class="day-empty">Nothing is published for this week yet.</div>';
    html += '<div class="grid-wrap"><table class="sgrid"><thead><tr><th class="sg-person">Team members (' + people.length + ')</th>' + showDays.map(function (d) {
      return '<th class="' + (d === today ? 'is-today' : '') + '"><span class="sg-dow">' + esc(C.formatDate(d, 'weekday-short')) + '</span> <span class="sg-day tnum">' + C.fromISODate(d).getDate() + '</span></th>';
    }).join('') + '</tr></thead><tbody>';
    people.forEach(function (t) {
      var theirs = weekItems.filter(function (v) { return v.teacherId === t.id; });
      var min = theirs.reduce(function (n, v) { return n + shiftMinutes(v); }, 0);
      html += '<tr class="' + (t.id === user.id ? 'is-me' : '') + '"><td class="sg-person"><div class="sg-pwrap">' + avatar(t) + '<span class="sg-name"><strong>' + esc(t.name) + (t.id === user.id ? ' <span class="muted">(you)</span>' : '') + '</strong><span class="muted tnum">' + esc(hoursLabel(min)) + '</span></span></div></td>';
      showDays.forEach(function (d) {
        var cell = theirs.filter(function (v) { return v.date === d; });
        html += '<td class="' + (d === today ? 'is-today' : '') + '">' + cell.map(function (v) {
          var cov = C.coverage(t, v);
          var cls = cov.kind === 'cross' ? 'sc-cross' : v.area === 'preschool' ? 'sc-pre' : 'sc-el';
          var inner = '<span class="sc-time tnum">' + esc(C.formatTime(v.start).replace(':00', '').replace(' ', '').toLowerCase()) + '–' + esc(C.formatTime(v.end).replace(':00', '').replace(' ', '').toLowerCase()) + '</span><span class="sc-what">' + esc(posLabel(v.positionId)) + '</span><span class="sc-where">' + esc(locName(v.locationId)) + (cov.kind === 'cross' ? ' · ' + esc(cov.short) : '') + '</span>' + (admin && v.state !== 'published' ? '<span class="sc-state">' + (v.state === 'draft' ? 'draft' : 'changed') + '</span>' : '');
          return admin ? '<button type="button" class="shiftchip ' + cls + '" data-action="edit-assignment" data-id="' + esc(v.id) + '">' + inner + '</button>' : '<span class="shiftchip ' + cls + '">' + inner + '</span>';
        }).join('') + (admin && !cell.length ? '<button type="button" class="sg-add" data-action="new-assignment" data-date="' + d + '" data-teacher="' + esc(t.id) + '" aria-label="Add a shift for ' + esc(t.name) + ' on ' + esc(C.formatDate(d, 'short')) + '">' + ICON.plus + '</button>' : '') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody><tfoot><tr><td class="sg-person"><div class="sg-pwrap sg-pwrap-col"><strong>Hours</strong><span class="muted">shifts</span></div></td>' + showDays.map(function (d) {
      var cell = weekItems.filter(function (v) { return v.date === d; });
      var min = cell.reduce(function (n, v) { return n + shiftMinutes(v); }, 0);
      return '<td class="' + (d === today ? 'is-today' : '') + '"><strong class="tnum">' + esc(hoursLabel(min)) + '</strong><span class="muted tnum">' + cell.length + '</span></td>';
    }).join('') + '</tr></tfoot></table></div>';
    html += '<p class="legend"><span class="shiftchip sc-pre">Preschool</span><span class="shiftchip sc-el">Elementary</span><span class="shiftchip sc-cross">Covering the other area</span></p></section>';
    html += adminTabs('dash');
    return html;
  }
  // Clocked hours come from the server; fill the tile after render.
  function fillClockedTile() {
    var tile = document.getElementById('tile-clocked');
    if (!tile) return;
    api('GET', '/api/clock').then(function (j) {
      var el = document.getElementById('tile-clocked'); if (!el) return;
      if (j.__status !== 200 || typeof j.weekWorkedMin !== 'number') { el.querySelector('strong').textContent = '–'; return; }
      el.querySelector('strong').textContent = hoursLabel(j.weekWorkedMin);
      el.querySelector('.muted').textContent = j.state === 'working' ? 'Clocked in now' : j.state === 'break' ? 'On break now' : 'from the break clock';
    }).catch(function () { /* leave placeholder */ });
  }

  function dayGroups(teacher, days, items, today, everyone, preview) {
    var html = '';
    days.forEach(function (d) {
      var dayItems = items.filter(function (v) { return v.date === d; });
      if (C.isWeekend(d) && !dayItems.length) return;
      var isPast = d < today;
      html += '<div class="day-group' + (isPast ? ' is-past' : '') + '" id="day-' + d + '">' +
        '<h3 class="day-head"><span>' + esc(C.relativeDayLabel(d, today)) + '</span><span class="date tnum">' + esc(C.formatDate(d, 'month-day')) + '</span></h3>';
      if (!dayItems.length) html += '<div class="day-empty">Not scheduled</div>';
      else html += '<ul class="rows">' + dayItems.map(function (v) { return '<li>' + weekRow(teacher, v, everyone, preview) + '</li>'; }).join('') + '</ul>';
      html += '</div>';
    });
    return html;
  }

  function withYouLine(v, everyone) {
    var w = C.withYou(v, everyone);
    if (!w.length) return '<p class="with-you muted">No one else is scheduled here during this block.</p>';
    return '<p class="with-you"><span class="wy-label">With you:</span> ' + w.map(function (x) {
      var partial = x.start !== v.start || x.end !== v.end;
      return esc(teacherName(x.assignment.teacherId)) + ', ' + esc(posLabel(x.assignment.positionId)) + (partial ? ' (' + esc(C.formatRange(x.start, x.end)) + ')' : '');
    }).join(' · ') + '</p>';
  }
  function positionLine(v) {
    var cf = v.coveringForTeacherId && T()[v.coveringForTeacherId];
    return esc(posLabel(v.positionId)) + (cf ? ' <span class="covering-for">· covering for ' + esc(cf.name) + '</span>' : '');
  }
  // Cross-coverage cards end with what comes next, so the teacher knows how long this lasts.
  function afterwardsLine(teacher, v, items) {
    if (teacher.usualArea === 'both') return '';
    var next = C.nextAfter(v, items);
    if (!next) {
      var usualLoc = teacher.usualLocationId ? locName(teacher.usualLocationId) : '';
      return '<p class="after muted">This is your last block on the schedule for now.' + (usualLoc ? ' Your usual room is ' + esc(usualLoc) + '.' : '') + '</p>';
    }
    var nextCov = C.coverage(teacher, next);
    var dayDiff = Math.round((C.fromISODate(next.date) - C.fromISODate(v.date)) / 86400000);
    var when = next.date === v.date ? 'Then at ' + C.formatTime(next.start) : dayDiff < 6 ? C.relativeDayLabel(next.date, v.date) : C.formatDate(next.date, 'short');
    if (nextCov.kind === 'cross') return '<p class="after muted">' + esc(when) + ': ' + esc(locName(next.locationId)) + ', still covering ' + esc(C.areaLabel(next.area)) + '.</p>';
    var backToUsual = nextCov.kind === 'usual' && (!teacher.usualLocationId || next.locationId === teacher.usualLocationId);
    if (backToUsual) return '<p class="after"><span class="muted">' + esc(when) + ':</span> ' + esc(locName(next.locationId)) + ', as usual.</p>';
    return '<p class="after"><span class="muted">' + esc(when) + ':</span> ' + esc(locName(next.locationId)) + ', ' + esc(posLabel(next.positionId)) + '.</p>';
  }
  function srSummary(teacher, v, today, everyone) {
    var cov = C.coverage(teacher, v);
    var w = C.withYou(v, everyone);
    return '<p class="sr-only">' + esc(C.relativeDayLabel(v.date, today)) + ', ' + esc(C.formatRange(v.start, v.end)) + '. ' + esc(C.coverageLabel(cov, v.date === today)) + '. ' +
      esc(locName(v.locationId)) + (locDetail(v.locationId) ? ', ' + esc(locDetail(v.locationId)) : '') + '. Position: ' + esc(posLabel(v.positionId)) +
      (v.coveringForTeacherId && T()[v.coveringForTeacherId] ? ', covering for ' + esc(teacherName(v.coveringForTeacherId)) : '') + '. ' +
      (w.length ? 'With you: ' + w.map(function (x) { return esc(teacherName(x.assignment.teacherId)); }).join(', ') + '. ' : '') +
      (v.note ? 'Note from ' + esc(adminFirst()) + ': ' + esc(v.note) : '') + '</p>';
  }

  function todayCard(teacher, v, today, items, everyone, opts) {
    opts = opts || {};
    var cov = C.coverage(teacher, v);
    var isCross = cov.kind === 'cross';
    var status = C.timeStatus(v, today, nowMinutes());
    var areaCls = v.area === 'preschool' ? 'area-pre' : 'area-el';
    var html = '<article class="card today-card ' + areaCls + (isCross ? ' is-cross' : '') + (status === 'done-today' && !opts.compact ? ' is-done' : '') + '">';
    html += srSummary(teacher, v, today, everyone);
    html += '<div class="band' + (isCross ? ' band-cross' : '') + '" aria-hidden="true">' + (isCross ? ICON.swap : areaIcon(v.area)) + '<span>' + esc(C.coverageLabel(cov, v.date === today)) + '</span>' + (opts.preview ? stateBadge(v.state) : '') + '</div>';
    html += '<div class="body">' +
      '<h3 class="where">' + esc(locName(v.locationId)) + '</h3>' +
      (locDetail(v.locationId) ? '<p class="where-detail">' + esc(locDetail(v.locationId)) + '</p>' : '') +
      '<p class="position">' + positionLine(v) + '</p>' +
      '<p class="when tnum">' + timeEl(v) + (opts.compact ? '' : ' <span class="sep">·</span> ' + timeSuffix(v, today)) + '</p>' +
      (opts.compact ? '' : withYouLine(v, everyone)) +
      (v.note ? '<blockquote class="note"><span class="note-label">From ' + esc(adminFirst()) + '</span>' + esc(v.note) + '</blockquote>' : '') +
      (isCross && !opts.compact ? afterwardsLine(teacher, v, items) : '') +
      (isCross && !opts.compact ? phoneLink() : '') +
      '</div></article>';
    return html;
  }

  function nextUpCard(teacher, next, today) {
    var cov = C.coverage(teacher, next);
    return '<a class="next-up" href="#day-' + esc(next.date) + '" data-action="scroll-to" data-target="day-' + esc(next.date) + '"><span class="label">Next up</span>' +
      '<strong>' + esc(C.relativeDayLabel(next.date, today)) + ', ' + esc(C.formatDate(next.date, 'month-day')) + ' · ' + esc(C.formatTime(next.start)) + '</strong>' +
      '<span>' + esc(locName(next.locationId)) + ' · ' + esc(posLabel(next.positionId)) + '</span>' +
      '<span class="row-badges">' + (cov.kind === 'cross' ? coverageBadge(cov) : areaBadge(next.area)) + '</span></a>';
  }

  function weekRow(teacher, v, everyone, preview) {
    var cov = C.coverage(teacher, v);
    var isCross = cov.kind === 'cross';
    var areaCls = v.area === 'preschool' ? 'area-pre' : 'area-el';
    var w = C.withYou(v, everyone);
    var inner = '<div class="row-top"><span class="row-time tnum">' + timeEl(v) + '</span>' + (isCross ? coverageBadge(cov) : areaBadge(v.area)) + '</div>' +
      '<p class="row-main"><span class="row-where">' + esc(locName(v.locationId)) + '</span> <span class="row-position">· ' + positionLine(v) + '</span></p>' +
      ((cov.kind === 'different-position' || v.note || preview) ? '<div class="row-badges">' + (cov.kind === 'different-position' ? coverageBadge(cov) : '') + (v.note ? '<span class="badge">' + ICON.note + 'Note</span>' : '') + (preview ? stateBadge(v.state) : '') + '</div>' : '');
    return '<details class="row ' + areaCls + (isCross ? ' is-cross' : '') + '"><summary>' + inner + '<span class="row-more">Details</span></summary>' +
      '<div class="row-detail">' +
      (locDetail(v.locationId) ? '<p class="muted">' + esc(locDetail(v.locationId)) + '</p>' : '') +
      (w.length ? '<p><span class="wy-label">With you:</span> ' + w.map(function (x) { return esc(teacherName(x.assignment.teacherId)) + ', ' + esc(posLabel(x.assignment.positionId)); }).join(' · ') + '</p>' : '<p class="muted">No one else is scheduled here during this block.</p>') +
      (v.note ? '<blockquote class="note"><span class="note-label">From ' + esc(adminFirst()) + '</span>' + esc(v.note) + '</blockquote>' : '') +
      '</div></details>';
  }

  // ---------------------------------------------------------------- admin shell
  function adminTabs(active) {
    var admin = isAdmin(currentUser());
    var tabs = admin
      ? [['dash', 'Dash', ICON.board], ['admin-week', 'Week', ICON.calendar], ['admin-board', 'Rooms', ICON.pin], ['admin-staff', 'Staff', ICON.people], ['admin-menu', 'Menu', ICON.menu]]
      : [['dash', 'Dash', ICON.board], ['me', 'My day', ICON.calendar]];
    var html = '<nav class="tabbar tabbar-' + (tabs.length + 1) + '" aria-label="Sections"><span class="tab-brand" aria-hidden="true">' + esc(state.settings.schoolName) + '</span>' + tabs.map(function (t) {
      return '<a class="tab' + (active === t[0] ? ' is-active' : '') + '" href="#' + t[0] + '" data-action="nav" data-route="' + t[0] + '"' + (active === t[0] ? ' aria-current="page"' : '') + '>' + t[2] + '<span>' + t[1] + '</span></a>';
    }).join('');
    html += admin ? '<a class="tab" href="/admin/hours">' + ICON.clock + '<span>Hours</span></a>' : '<a class="tab" href="/clock">' + ICON.clock + '<span>Clock</span></a>';
    return html + '</nav>';
  }
  function adminTop(title, right) {
    return '<header class="topbar"><div><div class="brand">' + esc(state.settings.schoolName) + '</div><h1 class="title">' + esc(title) + '</h1></div><div class="actions">' + (right || '') + '</div></header>';
  }
  function homeWeek() { return C.upcomingSchoolWeekStart(todayISO()); } // on Sat/Sun, the coming week
  function ensureAdminWeek() {
    if (!ui.adminWeek) ui.adminWeek = homeWeek();
    if (!ui.adminDay || !C.inWeek(ui.adminDay, ui.adminWeek)) {
      var t = todayISO();
      ui.adminDay = C.inWeek(t, ui.adminWeek) && !C.isWeekend(t) ? t : ui.adminWeek;
    }
  }
  function weekNav(action) {
    var isThis = ui.adminWeek === homeWeek();
    return '<div class="week-nav" style="margin-top:12px">' +
      '<button class="btn btn-sm btn-outline btn-icon" type="button" data-action="' + action + '" data-delta="-1" aria-label="Previous week">' + ICON.left + '</button>' +
      '<button class="btn btn-sm btn-ghost week-label" type="button" data-action="' + action + '" data-delta="0"' + (isThis ? ' disabled' : '') + '><span class="label tnum">Week of ' + esc(C.formatWeekLabel(ui.adminWeek)) + '</span><span class="section-sub">' + (isThis ? 'This week' : 'Tap for this week') + '</span></button>' +
      '<button class="btn btn-sm btn-outline btn-icon" type="button" data-action="' + action + '" data-delta="1" aria-label="Next week">' + ICON.right + '</button></div>';
  }
  function dayTabs(selected, action) {
    var today = todayISO();
    var idx = C.conflictIndex(state.assignments);
    return '<div class="day-tabs" role="tablist">' + C.weekDays(ui.adminWeek, 5).map(function (d) {
      var items = state.assignments.filter(function (a) { return a.date === d; });
      var nConf = items.filter(function (a) { return idx[a.id]; }).length;
      var nDraft = items.filter(function (a) { return C.publishState(a) !== 'published'; }).length;
      return '<button class="day-tab' + (d === selected ? ' is-active' : '') + (d === today ? ' is-today' : '') + '" type="button" role="tab" aria-selected="' + (d === selected) + '" data-action="' + action + '" data-date="' + d + '">' +
        '<span>' + esc(C.formatDate(d, 'weekday-short')) + '</span><span class="d tnum">' + C.fromISODate(d).getDate() + '</span>' +
        '<span class="cnt">' + (nConf ? '<span class="flag">' + ICON.warn + '<span class="sr-only">' + nConf + ' in conflict. </span></span>' : '') + (items.length ? items.length + '<span class="sr-only"> shifts</span>' : '–') + (nDraft ? '<span class="sr-only">, ' + nDraft + ' unpublished</span>' : '') + '</span></button>';
    }).join('') + '</div>';
  }

  // ---------------------------------------------------------------- admin: week builder
  function viewAdminWeek() {
    ensureAdminWeek();
    var today = todayISO();
    var ws = ui.adminWeek, day = ui.adminDay;
    var sum = C.weekSummary(state.assignments, ws);
    var weekItems = state.assignments.filter(function (a) { return C.inWeek(a.date, ws); });
    var conflicts = C.findConflicts(weekItems);
    var idx = C.conflictIndex(weekItems);
    var lastPub = weekItems.reduce(function (m, a) { return a.published && a.published.publishedAt > m ? a.published.publishedAt : m; }, '');
    var prevWeekCount = state.assignments.filter(function (a) { return C.inWeek(a.date, C.addDays(ws, -7)); }).length;

    var html = adminTop('Schedule') + weekNav('admin-week-nav');

    if (!sum.total && !sum.unpublished) {
      html += '<div class="card status-card section"><p><strong>Nothing scheduled this week yet.</strong></p><p class="muted small">Add shifts day by day, or start from last week and adjust.</p>' +
        (prevWeekCount ? '<button class="btn btn-outline" type="button" data-action="copy-prev-week">Copy last week (' + prevWeekCount + ' shifts) as drafts</button>' : '') + '</div>';
    } else if (!sum.unpublished) {
      html += '<div class="card status-card section all-good"><div class="status-line">' + stateBadge('published') + '<strong>Everyone can see this week.</strong></div>' +
        '<p class="muted small">' + sum.total + ' shifts' + (lastPub ? ' · last published ' + esc(fmtStamp(lastPub)) : '') + (conflicts.length ? ' · <strong class="warn-text">' + conflicts.length + ' conflict' + (conflicts.length > 1 ? 's' : '') + '</strong>' : '') + '</p></div>';
    } else {
      html += '<div class="card status-card section"><div class="status-line"><span class="badge badge-changed">' + ICON.dot + sum.unpublished + ' not yet published</span>' +
        (conflicts.length ? '<span class="badge badge-warn">' + ICON.warn + conflicts.length + ' conflict' + (conflicts.length > 1 ? 's' : '') + '</span>' : '') + '</div>' +
        '<p class="muted small">' + (sum.drafts ? sum.drafts + ' new' : '') + (sum.drafts && sum.changed ? ', ' : '') + (sum.changed ? sum.changed + ' changed' : '') + '. Teachers keep seeing the last published version until you publish.' + (lastPub ? ' Last published ' + esc(fmtStamp(lastPub)) + '.' : '') + '</p>' +
        '<button class="btn btn-primary" type="button" data-action="publish-week">Publish week</button></div>';
    }

    if (conflicts.length) {
      html += '<section class="section"><div class="section-head"><h2 class="eyebrow">Conflicts</h2></div><div class="conflicts">' + conflicts.map(function (p) {
        var fixTarget = (!p.b.published && p.a.published) ? p.b : (!p.a.published && p.b.published) ? p.a : (C.toMinutes(p.a.start) > C.toMinutes(p.b.start) ? p.a : p.b);
        var other = fixTarget === p.a ? p.b : p.a;
        return '<div class="conflict-item"><strong>' + ICON.warn + ' ' + esc(teacherName(p.a.teacherId)) + ' is double-booked on ' + esc(C.formatDate(p.a.date, 'weekday-short')) + '</strong>' +
          '<span>' + esc(C.formatRange(p.a.start, p.a.end)) + ' · ' + esc(locName(p.a.locationId)) + ' (' + esc(posLabel(p.a.positionId)) + ')</span>' +
          '<span>' + esc(C.formatRange(p.b.start, p.b.end)) + ' · ' + esc(locName(p.b.locationId)) + ' (' + esc(posLabel(p.b.positionId)) + ')</span>' +
          '<span class="conflict-actions"><button class="btn btn-sm btn-outline" type="button" data-action="edit-assignment" data-id="' + esc(fixTarget.id) + '">Fix ' + esc(C.formatTime(fixTarget.start)) + ' shift</button>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-action="edit-assignment" data-id="' + esc(other.id) + '">Edit the other one</button></span></div>';
      }).join('') + '</div></section>';
    }

    html += dayTabs(day, 'admin-day');
    var dayItems = weekItems.filter(function (a) { return a.date === day; }).sort(C.byTime);
    html += '<div class="day-title"><h2>' + esc(C.formatDate(day, 'long')) + (day === today ? ' <span class="muted" style="font-size:15px">· Today</span>' : '') + '</h2><span class="section-sub">' + dayItems.length + (dayItems.length === 1 ? ' shift' : ' shifts') + '</span></div>';
    if (!dayItems.length) html += '<div class="day-empty" style="margin-top:10px">No shifts on this day yet.</div>';
    else html += '<div class="rows" style="margin-top:10px">' + dayItems.map(function (a) { return adminRow(a, idx[a.id]); }).join('') + '</div>';
    html += '<div class="add-bar"><button class="btn btn-primary btn-block" type="button" data-action="new-assignment" data-date="' + day + '">' + ICON.plus + 'Add a shift on ' + esc(C.formatDate(day, 'weekday-short')) + '</button></div>';
    html += adminTabs('admin-week');
    return html;
  }

  function adminRow(a, conflictsWith) {
    var t = T()[a.teacherId];
    var cov = C.coverage(t, a);
    var st = C.publishState(a);
    return '<button type="button" class="arow' + (conflictsWith ? ' has-conflict' : '') + '" data-action="edit-assignment" data-id="' + esc(a.id) + '">' + avatar(t) +
      '<span class="a-main"><span class="a-name">' + esc(t ? t.name : 'Unknown teacher') + '</span>' +
      '<span class="a-time tnum">' + esc(C.formatRange(a.start, a.end)) + '</span>' +
      '<span class="a-what"><strong>' + esc(locName(a.locationId)) + '</strong> · ' + positionLine(a) + '</span>' +
      '<span class="a-badges">' + areaBadge(a.area) + coverageBadge(cov) + (st !== 'published' ? stateBadge(st) : '') + '</span>' +
      (a.note ? '<span class="a-note">' + esc(a.note.length > 90 ? a.note.slice(0, 88) + '…' : a.note) + '</span>' : '') +
      (conflictsWith ? '<span class="a-conflict">' + ICON.warn + ' Overlaps ' + conflictsWith.map(function (o) { return C.formatRange(o.start, o.end) + ' · ' + locName(o.locationId); }).map(esc).join('; ') + '</span>' : '') +
      '</span></button>';
  }

  // ---------------------------------------------------------------- admin: day board
  function viewAdminBoard() {
    ensureAdminWeek();
    if (!ui.boardDay || !C.inWeek(ui.boardDay, ui.adminWeek)) ui.boardDay = ui.adminDay;
    var day = ui.boardDay;
    var items = state.assignments.filter(function (a) { return a.date === day; }).sort(C.byTime);
    var idx = C.conflictIndex(items);
    var html = adminTop('Who is where') + weekNav('admin-week-nav') + dayTabs(day, 'board-day');
    html += '<div class="day-title"><h2>' + esc(C.formatDate(day, 'long')) + '</h2><span class="section-sub">' + items.length + ' shifts</span></div>';
    var groups = [['preschool', 'Preschool'], ['elementary', 'Elementary'], ['shared', 'Shared spaces']];
    groups.forEach(function (g) {
      var locs = state.locations.filter(function (l) { return l.area === g[0]; });
      if (!locs.length) return;
      html += '<section class="board-area"><h2 class="eyebrow">' + (g[0] === 'shared' ? esc(g[1]) : areaBadge(g[0])) + '</h2>';
      locs.forEach(function (l) {
        var here = items.filter(function (a) { return a.locationId === l.id; });
        html += '<div class="board-loc"><div class="l-name"><span>' + esc(l.name) + '</span><span class="muted small tnum">' + (here.length ? here.length + (here.length === 1 ? ' person' : ' people') : '') + '</span></div>' +
          (l.detail ? '<div class="l-detail">' + esc(l.detail) + '</div>' : '');
        if (!here.length) {
          html += '<button type="button" class="board-add" data-action="new-assignment" data-date="' + day + '" data-location="' + esc(l.id) + '">' + ICON.plus + 'No one assigned · add someone</button>';
        } else {
          html += '<div class="l-people">' + here.map(function (a) {
            var t = T()[a.teacherId]; var cov = C.coverage(t, a); var st = C.publishState(a);
            return '<button type="button" class="board-person' + (idx[a.id] ? ' has-conflict' : '') + '" data-action="edit-assignment" data-id="' + esc(a.id) + '">' +
              '<span class="bp-name">' + esc(t ? t.name : 'Unknown') + '</span><span class="bp-time tnum">' + esc(C.formatRange(a.start, a.end)) + '</span>' +
              '<span class="bp-pos">' + positionLine(a) + ' ' + coverageBadge(cov) + (st !== 'published' ? ' ' + stateBadge(st) : '') + (idx[a.id] ? ' <span class="badge badge-warn">' + ICON.warn + 'Double-booked</span>' : '') + '</span></button>';
          }).join('') + '<button type="button" class="board-add small" data-action="new-assignment" data-date="' + day + '" data-location="' + esc(l.id) + '">' + ICON.plus + 'Add someone here</button></div>';
        }
        html += '</div>';
      });
      html += '</section>';
    });
    var unplaced = items.filter(function (a) { return !L()[a.locationId]; });
    if (unplaced.length) html += '<section class="board-area"><h2 class="eyebrow">No location set</h2><div class="rows">' + unplaced.map(function (a) { return adminRow(a); }).join('') + '</div></section>';
    html += adminTabs('admin-board');
    return html;
  }

  // ---------------------------------------------------------------- admin: staff
  function viewAdminStaff() {
    var html = adminTop('Staff & rooms', '<button class="btn btn-sm btn-primary" type="button" data-action="new-teacher">' + ICON.plus + 'Add person</button>');
    html += '<p class="section-sub section" style="margin-top:14px">Set each person’s usual area and position. Every shift is compared against it, and anything outside their usual area is labeled “Covering…” on their schedule.</p>';
    html += '<div class="staff-list section">' + state.teachers.map(function (t) {
      return '<div class="staff-row' + (t.active === false ? ' is-inactive' : '') + '">' + avatar(t) +
        '<div><div class="s-name">' + esc(t.name) + (t.role === 'admin' ? ' <span class="badge">Admin</span>' : '') + (t.active === false ? ' <span class="badge">Inactive</span>' : '') + '</div>' +
        '<div class="s-sub">Usually ' + esc(usualAreaWord(t)) + ' · ' + esc(posLabel(t.usualPositionId)) + (t.usualLocationId ? ' · ' + esc(locName(t.usualLocationId)) : '') + '</div></div>' +
        '<div class="s-actions"><button class="btn btn-sm btn-outline" type="button" data-action="edit-teacher" data-id="' + esc(t.id) + '">Edit</button>' +
        '<a class="btn btn-sm btn-ghost" href="#preview-' + esc(t.id) + '" data-action="nav" data-route="preview-' + esc(t.id) + '">View as</a></div></div>';
    }).join('') + '</div>';
    var areaName = { preschool: 'Preschool', elementary: 'Elementary', shared: 'Shared' };
    html += '<section class="section"><div class="section-head"><h2 class="eyebrow">Rooms & locations</h2><button class="btn btn-sm btn-outline" type="button" data-action="new-location">' + ICON.plus + 'Add a room</button></div>' +
      '<p class="section-sub" style="margin-bottom:10px">Names and directions appear exactly like this on every teacher\u2019s card.</p>' +
      '<div class="staff-list">' + state.locations.map(function (l) {
        return '<div class="staff-row"><span class="avatar ' + (l.area === 'preschool' ? 'pre' : l.area === 'elementary' ? 'el' : '') + '" aria-hidden="true">' + ICON.pin + '</span>' +
          '<div><div class="s-name">' + esc(l.name) + '</div><div class="s-sub">' + esc(areaName[l.area] || l.area) + (l.detail ? ' \u00b7 ' + esc(l.detail) : '') + '</div></div>' +
          '<div class="s-actions"><button class="btn btn-sm btn-outline" type="button" data-action="edit-location" data-id="' + esc(l.id) + '">Edit</button></div></div>';
      }).join('') + '</div></section>';
    html += adminTabs('admin-staff');
    return html;
  }

  // ---------------------------------------------------------------- location editor sheet
  function openLocationEditor(l) {
    var model = l ? Object.assign({}, l) : { id: null, name: '', area: 'preschool', detail: '' };
    rememberFocus();
    ui.sheet = { kind: 'location', model: model, errors: [], isNew: !l };
    renderLayer();
  }
  function sheetLocation() {
    var s = ui.sheet, m = s.model;
    var used = m.id ? state.assignments.filter(function (a) { return a.locationId === m.id || (a.published && a.published.locationId === m.id); }).length : 0;
    function seg(value, label, cls) { return '<label class="' + (cls || '') + (m.area === value ? ' is-checked' : '') + '"><input type="radio" name="area" value="' + value + '"' + (m.area === value ? ' checked' : '') + '><span>' + label + '</span></label>'; }
    return '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="grab"></div>' +
      '<div class="sheet-head"><h2 id="sheet-title">' + (s.isNew ? 'Add a room' : 'Edit ' + esc(m.name)) + '</h2><button class="btn btn-sm btn-ghost" type="button" data-action="close-sheet">Cancel</button></div>' +
      '<form data-form="location" id="location-form" novalidate>' +
      (s.errors.length ? '<div class="errors" role="alert"><ul>' + s.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="field"><label for="l-name">Room or location name</label><input class="input" id="l-name" name="name" value="' + esc(m.name) + '" autofocus autocomplete="off" placeholder="Butterfly Room"></div>' +
      '<div class="field"><span class="label" id="l-area-label">Which building or area</span><div class="seg" role="radiogroup" aria-labelledby="l-area-label">' +
      seg('preschool', ICON.blocks + 'Preschool', 'seg-pre') + seg('elementary', ICON.book + 'Elementary', 'seg-el') + seg('shared', 'Shared') + '</div>' +
      '<p class="hint">Shared spaces (cafeteria, office) can be used for either area without a warning.</p></div>' +
      '<div class="field"><label for="l-detail">How to find it (optional)</label><input class="input" id="l-detail" name="detail" value="' + esc(m.detail || '') + '" placeholder="Preschool building, first door on the left"><p class="hint">How would you tell a new person to find this room? Shown under the room name on their card.</p></div>' +
      '<div class="sheet-actions"><button class="btn btn-primary btn-block" type="submit">' + (s.isNew ? 'Add room' : 'Save') + '</button>' +
      (s.isNew ? '' : (used ? '<p class="hint" style="text-align:center">' + esc(m.name) + ' is used by ' + used + ' shift' + (used === 1 ? '' : 's') + ', so it cannot be removed. Renaming it updates those shifts.</p>'
        : '<button class="btn btn-danger btn-block" type="button" data-action="delete-location" data-id="' + esc(m.id) + '">Remove this room</button>')) +
      '</div></form></div>';
  }
  function saveLocation() {
    var fd = new FormData(document.getElementById('location-form'));
    var m = Object.assign({}, ui.sheet.model);
    m.name = String(fd.get('name') || '').trim();
    m.area = String(fd.get('area') || 'shared');
    m.detail = String(fd.get('detail') || '').trim();
    var errors = [];
    if (!m.name) errors.push('Enter a name for the room.');
    if (state.locations.some(function (l) { return l.id !== m.id && l.name.toLowerCase() === m.name.toLowerCase(); })) errors.push('There is already a room called ' + m.name + '.');
    if (errors.length) { ui.sheet.errors = errors; ui.sheet.model = m; ui.sheet.keepFocus = true; renderLayer(); return; }
    if (!m.id) { m.id = C.newId('loc'); state.locations.push(m); }
    else { var i = state.locations.findIndex(function (l) { return l.id === m.id; }); if (i >= 0) state.locations[i] = m; }
    markEdited(); save(); ui.sheet = null; render(); toast(m.name + ' saved.');
  }
  function deleteLocation(id) {
    var l = L()[id]; if (!l) return;
    if (state.assignments.some(function (a) { return a.locationId === id || (a.published && a.published.locationId === id); })) { toast(l.name + ' is still used by shifts.'); return; }
    confirmDialog({
      title: 'Remove ' + l.name + '?', body: 'It will no longer appear when adding shifts. This cannot be undone.', confirmLabel: 'Remove', danger: true,
      onConfirm: function () {
        state.locations = state.locations.filter(function (x) { return x.id !== id; });
        state.teachers.forEach(function (t) { if (t.usualLocationId === id) t.usualLocationId = ''; });
        markEdited(); save(); ui.sheet = null; ui.dialog = null; render(); toast(l.name + ' removed.');
      }
    });
  }

  // ---------------------------------------------------------------- admin: menu
  function viewAdminMenu() {
    var html = adminTop('Menu');
    html += '<form class="card menu-card section" data-form="settings"><h2>School settings</h2>' +
      '<div class="field"><label for="schoolName">School name</label><input class="input" id="schoolName" name="schoolName" value="' + esc(state.settings.schoolName) + '"></div>' +
      '<div class="field"><label for="adminName">Your name (shown on notes)</label><input class="input" id="adminName" name="adminName" value="' + esc(state.settings.adminName) + '"></div>' +
      '<div class="field"><label for="adminPhone">Your phone (teachers can text it from a covering shift)</label><input class="input tnum" id="adminPhone" name="adminPhone" inputmode="tel" value="' + esc(state.settings.adminPhone || '') + '"></div>' +
      '<div class="field"><label for="adminContact">How teachers reach you</label><input class="input" id="adminContact" name="adminContact" value="' + esc(state.settings.adminContact) + '"><p class="hint">Shown at the bottom of every teacher’s schedule.</p></div>' +
      '<button class="btn btn-outline" type="submit">Save settings</button></form>';
    html += '<div class="card menu-card section"><h2>Demo controls</h2>' + demoControls() +
      '<label class="check"><input type="checkbox" data-change="show-pins"' + (state.settings.showDemoPins ? ' checked' : '') + '> Show demo PINs on the login screen</label>' +
      '<button class="btn btn-outline" type="button" data-action="reset-demo">Reset demo data</button>' +
      '<p class="hint">Restores the sample week and staff. Everything you changed is removed.</p></div>';
    html += '<div class="card menu-card section"><h2>Break clock</h2>' +
      '<a class="btn btn-outline" href="/admin/hours">' + ICON.clock + 'Hours worked</a>' +
      '<a class="btn btn-outline" href="/admin/badges">' + ICON.people + 'Badges and QR codes</a>' +
      '<a class="btn btn-outline" href="/kiosk">' + ICON.board + 'Open the kiosk on this device</a>' +
      '<p class="hint">Print a badge for each person from the badges page. A tablet at the office runs the kiosk; the break-room poster lets people clock from their own phone.</p></div>';
    html += '<div class="card menu-card section"><h2>Storage</h2><p class="small muted">' +
      (boot.storage === 'redis' ? 'Connected to the database. Everything you publish is saved for everyone.' :
        boot.storage === 'temporary' ? 'No database is connected yet, so data is kept in temporary server storage and is lost on each deploy. In Vercel, open the project’s Storage tab and add Upstash Redis, then redeploy.' :
        'Running locally with file storage (.data/).') + '</p>' +
      '<button class="btn btn-ghost" type="button" data-action="logout">' + ICON.logout + 'Log out</button></div>';
    html += adminTabs('admin-menu');
    return html;
  }

  // ---------------------------------------------------------------- dialog
  function viewDialog() {
    var d = ui.dialog;
    return '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title"><h2 id="dlg-title">' + esc(d.title) + '</h2><p>' + d.body + '</p>' +
      '<div class="dialog-actions"><button class="btn btn-outline" type="button" data-action="close-dialog">' + esc(d.cancelLabel || 'Go back') + '</button>' +
      '<button class="btn ' + (d.danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-action="confirm-dialog">' + esc(d.confirmLabel) + '</button></div></div>';
  }
  function confirmDialog(opts) { rememberFocus(); ui.dialog = opts; renderLayer(); }

  // ---------------------------------------------------------------- assignment editor sheet
  function openAssignmentEditor(a, defaults) {
    defaults = defaults || {};
    var model;
    if (a) model = Object.assign({}, a);
    else {
      var loc = defaults.locationId ? L()[defaults.locationId] : null;
      var blocks = state.settings.blocks || {};
      var full = blocks.full || ['07:30', '15:30'];
      model = {
        id: null, teacherId: defaults.teacherId || '', date: defaults.date || ui.adminDay || todayISO(), start: full[0], end: full[1],
        area: loc && loc.area !== 'shared' ? loc.area : '', locationId: defaults.locationId || '', positionId: '', coveringForTeacherId: '', note: ''
      };
    }
    rememberFocus();
    ui.sheet = { kind: 'assignment', model: model, errors: [], warnings: [], isNew: !a, reassign: false, original: a ? a.teacherId : '', prefill: !a && !!defaults.teacherId };
    renderLayer();
  }
  function optionList(list, value, labelFn) {
    return list.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === value ? ' selected' : '') + '>' + esc(labelFn(x)) + '</option>'; }).join('');
  }
  function locationOptions(area, value) {
    var html = '<option value="">Choose a room or location</option>';
    var groups = area ? [[area, C.areaLabel(area)], ['shared', 'Shared spaces']] : [['preschool', 'Preschool'], ['elementary', 'Elementary'], ['shared', 'Shared spaces']];
    groups.forEach(function (g) {
      var locs = state.locations.filter(function (l) { return l.area === g[0]; });
      if (locs.length) html += '<optgroup label="' + esc(g[1]) + '">' + optionList(locs, value, function (l) { return l.name; }) + '</optgroup>';
    });
    var sel = L()[value];
    if (sel && area && !C.areaMatches(sel.area, area)) {
      html += '<optgroup label="' + esc(C.areaLabel(sel.area)) + ' (other area)"><option value="' + esc(sel.id) + '" selected>' + esc(sel.name) + '</option></optgroup>';
    }
    return html;
  }
  function positionOptions(area, value) {
    var html = '<option value="">Choose the position for this shift</option>';
    var groups = area ? [[area, C.areaLabel(area) + ' positions'], ['both', 'Either area']] : [['preschool', 'Preschool positions'], ['elementary', 'Elementary positions'], ['both', 'Either area']];
    groups.forEach(function (g) {
      var ps = state.positions.filter(function (p) { return p.area === g[0] || (g[0] === 'both' && p.area === 'either'); });
      if (ps.length) html += '<optgroup label="' + esc(g[1]) + '">' + optionList(ps, value, function (p) { return p.label; }) + '</optgroup>';
    });
    var sel = P()[value];
    if (sel && area && !C.areaMatches(sel.area, area)) {
      html += '<optgroup label="' + esc(C.areaLabel(sel.area)) + ' position (other area)"><option value="' + esc(sel.id) + '" selected>' + esc(sel.label) + '</option></optgroup>';
    }
    return html;
  }
  function blockChips(m) {
    var blocks = state.settings.blocks || {};
    var defs = [['am', 'Morning'], ['pm', 'Afternoon'], ['full', 'Full day']];
    return '<div class="chips" role="group" aria-label="Quick time blocks">' + defs.map(function (d) {
      var b = blocks[d[0]]; if (!b) return '';
      var active = m.start === b[0] && m.end === b[1];
      return '<button type="button" class="chip' + (active ? ' is-active' : '') + '" data-action="set-block" data-start="' + b[0] + '" data-end="' + b[1] + '" aria-pressed="' + active + '">' + d[1] + ' <span class="muted tnum">' + esc(C.formatTime(b[0]).replace(':00', '')) + '–' + esc(C.formatTime(b[1]).replace(':00', '')) + '</span></button>';
    }).join('') + '</div>';
  }
  function reassignList(m) {
    var others = activeTeachers().filter(function (t) { return t.id !== m.teacherId; });
    var candidate = { id: m.id, date: m.date, start: m.start, end: m.end };
    return '<div class="reassign" id="reassign-list"><div class="preview-label">Reassign this shift to</div><div class="people">' + others.map(function (t) {
      var busy = C.conflictsForCandidate(Object.assign({}, candidate, { teacherId: t.id }), state.assignments);
      var cov = C.coverage(t, m);
      return '<button type="button" class="person" data-action="reassign-pick" data-id="' + esc(t.id) + '">' + avatar(t) +
        '<span><span class="p-name">' + esc(t.name) + '</span><br><span class="p-sub">' +
        (busy.length ? '<span class="warn-text">Busy: ' + esc(busy.map(function (b) { return C.formatRange(b.start, b.end) + ' ' + locName(b.locationId); }).join(', ')) + '</span>' : '<span class="ok-text">Free then</span>') +
        (cov.kind === 'cross' ? ' · would be covering ' + esc(C.areaLabel(m.area)) : ' · usually ' + esc(usualAreaWord(t))) + '</span></span></button>';
    }).join('') + '</div><button class="btn btn-sm btn-ghost" type="button" data-action="reassign-cancel">Keep ' + esc(C.firstName(teacherName(m.teacherId)) || 'current teacher') + '</button></div>';
  }
  function sheetAssignment() {
    var s = ui.sheet, m = s.model;
    var teachers = state.teachers.filter(function (t) { return t.active !== false || t.id === m.teacherId; });
    var html = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="grab"></div>' +
      '<div class="sheet-head"><h2 id="sheet-title">' + (s.isNew ? 'Add a shift' : 'Edit shift') + '</h2><button class="btn btn-sm btn-ghost" type="button" data-action="close-sheet">Cancel</button></div>' +
      '<form data-form="assignment" id="editor-form" novalidate>' +
      (s.errors.length ? '<div class="errors" role="alert"><ul>' + s.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="field"><label for="f-teacher">Who</label><select class="select" id="f-teacher" name="teacherId" autofocus><option value="">Choose a teacher</option>' +
      optionList(teachers, m.teacherId, function (t) { return t.name + (t.active === false ? ' (inactive)' : '') + ' — usually ' + usualAreaWord(t) + ', ' + posLabel(t.usualPositionId); }) + '</select>' +
      (!s.isNew ? '<button class="btn btn-sm btn-outline" type="button" data-action="reassign-open" style="justify-self:start">' + ICON.people + 'Reassign to someone else</button>' : '') + '</div>' +
      (s.reassign ? reassignList(m) : '') +
      '<div class="field"><label for="f-date">Date</label><div class="field-row"><input class="input" type="date" id="f-date" name="date" value="' + esc(m.date) + '">' +
      '<div class="hint" id="f-date-label" style="min-height:46px;display:flex;align-items:center">' + esc(C.isValidISODate(m.date) ? C.formatDate(m.date, 'long') : '') + '</div></div></div>' +
      '<div class="field"><span class="label">Time</span>' + blockChips(m) +
      '<div class="field-row"><div class="field"><label for="f-start" class="sr-only">Start</label><input class="input" type="time" id="f-start" name="start" value="' + esc(m.start) + '" step="300" aria-label="Start time"></div>' +
      '<div class="field"><label for="f-end" class="sr-only">End</label><input class="input" type="time" id="f-end" name="end" value="' + esc(m.end) + '" step="300" aria-label="End time"></div></div></div>' +
      '<div class="field"><span class="label" id="f-area-label">Campus area for this shift</span><div class="seg" role="radiogroup" aria-labelledby="f-area-label">' +
      '<label class="seg-pre' + (m.area === 'preschool' ? ' is-checked' : '') + '"><input type="radio" name="area" value="preschool"' + (m.area === 'preschool' ? ' checked' : '') + '><span>' + ICON.blocks + 'Preschool</span></label>' +
      '<label class="seg-el' + (m.area === 'elementary' ? ' is-checked' : '') + '"><input type="radio" name="area" value="elementary"' + (m.area === 'elementary' ? ' checked' : '') + '><span>' + ICON.book + 'Elementary</span></label></div>' +
      '<p class="hint" id="f-area-hint"></p></div>' +
      '<div class="field"><label for="f-location">Room or location</label><select class="select" id="f-location" name="locationId">' + locationOptions(m.area, m.locationId) + '</select></div>' +
      '<div class="field"><label for="f-position">Position for this shift</label><select class="select" id="f-position" name="positionId">' + positionOptions(m.area, m.positionId) + '</select><p class="hint">Set separately from the person’s usual role. The teacher sees exactly this label.</p></div>' +
      '<div class="field"><label for="f-covering">Covering for (optional)</label><select class="select" id="f-covering" name="coveringForTeacherId"><option value="">Nobody in particular</option>' +
      optionList(state.teachers.filter(function (t) { return t.id !== m.teacherId; }), m.coveringForTeacherId, function (t) { return t.name; }) + '</select><p class="hint">Shows as “covering for David Ortiz” on the card. Keep the reason in the note, if at all.</p></div>' +
      '<div class="field"><label for="f-note">Note to the teacher (optional)</label><textarea class="input" id="f-note" name="note" placeholder="What should they know? Where the lesson plans are, who else is in the room, who runs dismissal.">' + esc(m.note || '') + '</textarea></div>' +
      '<div id="editor-conflicts" aria-live="polite"></div>' +
      '<div><div class="preview-label">What the teacher will see</div><div id="editor-preview"></div></div>' +
      '<div class="sheet-actions"><button class="btn btn-primary btn-block" type="submit" data-publish="0">' + (s.isNew ? 'Add shift' : 'Save') + '</button>' +
      '<button class="btn btn-outline btn-block" type="submit" data-publish="1">' + (s.isNew ? 'Add & publish now' : 'Save & publish now') + '</button>' +
      (s.isNew ? '' : '<button class="btn btn-danger btn-block" type="button" data-action="delete-assignment" data-id="' + esc(m.id) + '">Remove this shift</button>') +
      '<p class="hint" style="text-align:center">“' + (s.isNew ? 'Add shift' : 'Save') + '” keeps it as a draft until you publish the week. “Publish now” makes just this shift visible right away.</p></div>' +
      '</form></div>';
    return html;
  }
  function readEditorForm() {
    var f = document.getElementById('editor-form');
    if (!f) return null;
    var fd = new FormData(f);
    var m = Object.assign({}, ui.sheet.model);
    ['teacherId', 'date', 'start', 'end', 'locationId', 'positionId', 'coveringForTeacherId', 'note'].forEach(function (k) {
      var v = fd.get(k); m[k] = v == null ? '' : String(v);
    });
    m.area = fd.get('area') ? String(fd.get('area')) : '';
    m.note = (m.note || '').trim();
    return m;
  }
  // Live parts of the editor: dependent selects, conflict warning, preview card.
  function updateEditorLive(changedField) {
    var f = document.getElementById('editor-form');
    if (!f) return;
    var m = readEditorForm();
    if (!m) return;
    var teacher = T()[m.teacherId];
    if (changedField === 'teacherId' && teacher) {
      // Prefill from the person's usual profile when the field is still empty.
      if (!m.area && teacher.usualArea !== 'both') {
        m.area = teacher.usualArea;
        var radio = f.querySelector('input[name="area"][value="' + m.area + '"]'); if (radio) radio.checked = true;
      }
      if (!m.positionId && teacher.usualPositionId && C.areaMatches((P()[teacher.usualPositionId] || {}).area, m.area)) m.positionId = teacher.usualPositionId;
      if (!m.locationId && teacher.usualLocationId && C.areaMatches((L()[teacher.usualLocationId] || {}).area, m.area)) m.locationId = teacher.usualLocationId;
      if (m.coveringForTeacherId === m.teacherId) m.coveringForTeacherId = '';
      var cfSel = f.querySelector('#f-covering');
      cfSel.innerHTML = '<option value="">Nobody in particular</option>' + optionList(state.teachers.filter(function (t) { return t.id !== m.teacherId; }), m.coveringForTeacherId, function (t) { return t.name; });
    }
    if (changedField === 'area' || changedField === 'teacherId' || changedField === undefined) {
      var locSel = f.querySelector('#f-location'), posSel = f.querySelector('#f-position');
      var loc = L()[m.locationId]; if (loc && m.area && !C.areaMatches(loc.area, m.area) && changedField === 'area') m.locationId = '';
      var pos = P()[m.positionId]; if (pos && m.area && !C.areaMatches(pos.area, m.area) && changedField === 'area') m.positionId = '';
      locSel.innerHTML = locationOptions(m.area, m.locationId);
      posSel.innerHTML = positionOptions(m.area, m.positionId);
    }
    var dateLabel = f.querySelector('#f-date-label'); if (dateLabel) dateLabel.textContent = C.isValidISODate(m.date) ? C.formatDate(m.date, 'long') : '';
    // Block chips reflect the current times.
    f.querySelectorAll('.chip').forEach(function (ch) {
      var on = ch.getAttribute('data-start') === m.start && ch.getAttribute('data-end') === m.end;
      ch.classList.toggle('is-active', on); ch.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // Area hint: say plainly when this is cross-coverage for this person.
    var areaHint = f.querySelector('#f-area-hint');
    if (areaHint) {
      var cov = teacher && m.area ? C.coverage(teacher, m) : null;
      areaHint.innerHTML = cov && cov.kind === 'cross' ? '<span class="cross-text">' + ICON.swap + ' This is cross-coverage for ' + esc(C.firstName(teacher.name)) + ', who usually works in ' + esc(C.areaLabel(teacher.usualArea)) + '. Their card will say “' + esc(cov.labelToday) + '”.</span>'
        : teacher && m.area ? esc(C.firstName(teacher.name)) + ' usually works in ' + esc(usualAreaWord(teacher)) + '.' : '';
    }
    ui.sheet.model = m;
    // Conflicts + warnings
    var box = f.querySelector('#editor-conflicts');
    var clashes = (m.teacherId && C.isValidISODate(m.date) && C.isValidTime(m.start) && C.isValidTime(m.end)) ? C.conflictsForCandidate(m, state.assignments) : [];
    var val = C.validateAssignment(m, { locations: L(), positions: P() });
    var boxHtml = '';
    if (clashes.length) boxHtml += '<div class="conflict-box"><strong>' + ICON.warn + ' ' + esc(C.firstName(teacher ? teacher.name : 'This teacher')) + ' is already booked then</strong>' +
      clashes.map(function (o) { return '<span>' + esc(C.formatRange(o.start, o.end)) + ' · ' + esc(locName(o.locationId)) + ' (' + esc(posLabel(o.positionId)) + ')</span>'; }).join('') +
      '<span class="small">You can still save, but fix the overlap before publishing.</span></div>';
    if (val.warnings.length) boxHtml += '<div class="conflict-box soft">' + val.warnings.map(function (w) { return '<span>' + ICON.info + ' ' + esc(w) + '</span>'; }).join('') + '</div>';
    box.innerHTML = boxHtml;
    // Preview
    var pv = f.querySelector('#editor-preview');
    if (teacher && m.area && m.positionId && m.locationId && C.isValidTime(m.start) && C.isValidTime(m.end)) {
      pv.innerHTML = todayCard(teacher, m, m.date, [], [], { compact: true });
    } else {
      pv.innerHTML = '<div class="day-empty">Choose a teacher, area, room and position to preview the card ' + (teacher ? esc(C.firstName(teacher.name)) : 'they') + ' will see.</div>';
    }
  }
  function saveAssignment(publishNow) {
    var m = readEditorForm();
    var val = C.validateAssignment(m, { locations: L(), positions: P() });
    if (val.errors.length) { ui.sheet.errors = val.errors; ui.sheet.model = m; ui.sheet.keepFocus = true; renderLayer(); return; }
    var clashes = C.conflictsForCandidate(m, state.assignments);
    if (publishNow && clashes.length) {
      ui.sheet.model = m;
      confirmDialog({
        title: 'Publish a double-booked shift?',
        body: esc(C.firstName(teacherName(m.teacherId))) + ' is already scheduled ' + esc(clashes.map(function (o) { return C.formatRange(o.start, o.end) + ' in ' + locName(o.locationId); }).join(' and ')) + '. They would see both. You can save it as a draft instead and fix the overlap first.',
        confirmLabel: 'Publish anyway', cancelLabel: 'Go back', danger: true,
        onConfirm: function () { ui.dialog = null; commitAssignment(m, true); }
      });
      return;
    }
    commitAssignment(m, publishNow);
  }
  function commitAssignment(m, publishNow) {
    m.updatedAt = nowStamp();
    if (!m.id) {
      m.id = C.newId('a'); m.published = null;
      state.assignments.push(m);
    } else {
      var i = state.assignments.findIndex(function (a) { return a.id === m.id; });
      if (i >= 0) state.assignments[i] = m; else state.assignments.push(m);
    }
    if (publishNow) state.assignments = C.publishOne(state.assignments, m.id, nowStamp());
    markEdited(); save();
    ui.sheet = null;
    if (C.isValidISODate(m.date)) { ui.adminWeek = C.weekStart(m.date); ui.adminDay = m.date; ui.boardDay = m.date; }
    render();
    var who = C.firstName(teacherName(m.teacherId));
    toast(publishNow ? 'Published. ' + who + ' can see this shift now.' : (m.published ? 'Saved. ' + who + ' sees the change after you publish.' : 'Saved as a draft. Publish the week when it is ready.'));
  }
  function deleteAssignment(id) {
    var a = state.assignments.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    confirmDialog({
      title: 'Remove this shift?',
      body: esc(teacherName(a.teacherId)) + ', ' + esc(C.formatDate(a.date, 'short')) + ', ' + esc(C.formatRange(a.start, a.end)) + ' in ' + esc(locName(a.locationId)) + '.' + (a.published ? ' It is already published, so it disappears from their schedule right away.' : ''),
      confirmLabel: 'Remove', danger: true,
      onConfirm: function () {
        state.assignments = state.assignments.filter(function (x) { return x.id !== id; });
        markEdited(); save(); ui.sheet = null; ui.dialog = null; render(); toast('Shift removed.');
      }
    });
  }
  function publishWeek() {
    var ws = ui.adminWeek;
    var weekItems = state.assignments.filter(function (a) { return C.inWeek(a.date, ws); });
    var conflicts = C.findConflicts(weekItems);
    var sum = C.weekSummary(state.assignments, ws);
    var affected = {};
    state.assignments.forEach(function (a) { if (C.touchesWeek(a, ws) && C.isDirty(a)) { affected[a.teacherId] = true; if (a.published) affected[a.published.teacherId] = true; } });
    var names = Object.keys(affected).map(function (id) { return C.firstName(teacherName(id)); });
    var doIt = function () {
      state.assignments = C.publishWeek(state.assignments, ws, nowStamp());
      markEdited(); save(); ui.dialog = null; render(); toast('Published. Teachers now see the week of ' + C.formatWeekLabel(ws) + '.');
    };
    if (conflicts.length) {
      confirmDialog({
        title: 'Publish with ' + conflicts.length + ' conflict' + (conflicts.length > 1 ? 's' : '') + '?',
        body: 'Someone is double-booked and would see both shifts. You can publish anyway and fix it after, or go back and fix it first.',
        confirmLabel: 'Publish anyway', danger: true, onConfirm: doIt
      });
    } else {
      confirmDialog({
        title: 'Publish the week of ' + C.formatWeekLabel(ws) + '?',
        body: sum.unpublished + ' change' + (sum.unpublished === 1 ? '' : 's') + (names.length ? ' for ' + esc(names.join(', ')) : '') + '. Each teacher sees only their own shifts.',
        confirmLabel: 'Publish', onConfirm: doIt
      });
    }
  }
  // Copies last week's regular shifts as drafts. One-off cover shifts ("covering for someone") are skipped.
  function copyPrevWeek() {
    var ws = ui.adminWeek, prev = C.addDays(ws, -7);
    var source = state.assignments.filter(function (a) { return C.inWeek(a.date, prev); });
    var skipped = source.filter(function (a) { return !!a.coveringForTeacherId; }).length;
    var copies = source.filter(function (a) { return !a.coveringForTeacherId; }).map(function (a) {
      var c = Object.assign({}, a); c.id = C.newId('a'); c.date = C.addDays(a.date, 7); c.published = null; c.updatedAt = nowStamp(); c.note = ''; return c;
    });
    state.assignments = state.assignments.concat(copies);
    markEdited(); save(); render();
    toast(copies.length + ' shifts copied as drafts' + (skipped ? ', ' + skipped + ' one-off cover shift' + (skipped === 1 ? '' : 's') + ' skipped' : '') + '. Notes were cleared.');
  }

  // ---------------------------------------------------------------- teacher editor sheet
  function openTeacherEditor(t) {
    var model = t ? Object.assign({}, t) : { id: null, name: '', role: 'teacher', usualArea: 'preschool', usualPositionId: '', usualLocationId: '', pin: '', active: true };
    rememberFocus();
    ui.sheet = { kind: 'teacher', model: model, errors: [], isNew: !t };
    renderLayer();
  }
  function sheetTeacher() {
    var s = ui.sheet, m = s.model;
    var shiftCount = m.id ? C.assignmentsReferencing(m.id, state.assignments).length : 0;
    var isSelf = session && session.teacherId === m.id;
    function seg(name, value, label, cls) { return '<label class="' + (cls || '') + (m[name] === value ? ' is-checked' : '') + '"><input type="radio" name="' + name + '" value="' + value + '"' + (m[name] === value ? ' checked' : '') + '><span>' + label + '</span></label>'; }
    return '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="grab"></div>' +
      '<div class="sheet-head"><h2 id="sheet-title">' + (s.isNew ? 'Add a person' : 'Edit ' + esc(C.firstName(m.name))) + '</h2><button class="btn btn-sm btn-ghost" type="button" data-action="close-sheet">Cancel</button></div>' +
      '<form data-form="teacher" id="teacher-form" novalidate>' +
      (s.errors.length ? '<div class="errors" role="alert"><ul>' + s.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="field"><label for="t-name">Name</label><input class="input" id="t-name" name="name" value="' + esc(m.name) + '" autofocus autocomplete="off"></div>' +
      '<div class="field"><span class="label" id="t-area-label">Usual area</span><div class="seg" role="radiogroup" aria-labelledby="t-area-label">' +
      seg('usualArea', 'preschool', ICON.blocks + 'Preschool', 'seg-pre') + seg('usualArea', 'elementary', ICON.book + 'Elementary', 'seg-el') + seg('usualArea', 'both', 'Both') + '</div>' +
      '<p class="hint">Shifts outside this area are labeled “Covering…” on their schedule. People marked Both never get a coverage label.</p></div>' +
      '<div class="field"><label for="t-position">Usual position</label><select class="select" id="t-position" name="usualPositionId"><option value="">Choose a position</option>' +
      optionList(state.positions, m.usualPositionId, function (p) { return p.label; }) + '</select></div>' +
      '<div class="field"><label for="t-location">Usual room (optional)</label><select class="select" id="t-location" name="usualLocationId"><option value="">None</option>' +
      optionList(state.locations, m.usualLocationId, function (l) { return l.name; }) + '</select><p class="hint">Pre-fills new shifts and lets the app say “Tomorrow: Butterfly Room, as usual.”</p></div>' +
      '<div class="field-row"><div class="field"><label for="t-pin">4-digit PIN</label><input class="input tnum" id="t-pin" name="pin" inputmode="numeric" maxlength="4" value="' + esc(m.pin) + '"></div>' +
      '<div class="field"><span class="label" id="t-role-label">Role</span><div class="seg" role="radiogroup" aria-labelledby="t-role-label">' + seg('role', 'teacher', 'Teacher') + seg('role', 'admin', 'Admin') + '</div></div></div>' +
      '<label class="check"><input type="checkbox" name="active"' + (m.active !== false ? ' checked' : '') + '> Active (can log in and be scheduled)</label>' +
      '<div class="sheet-actions"><button class="btn btn-primary btn-block" type="submit">' + (s.isNew ? 'Add person' : 'Save') + '</button>' +
      (s.isNew || isSelf ? '' : (shiftCount ? '<p class="hint" style="text-align:center">' + esc(C.firstName(m.name)) + ' has ' + shiftCount + ' shift' + (shiftCount === 1 ? '' : 's') + ' on the schedule. Remove those first, or mark them inactive.</p>'
        : '<button class="btn btn-danger btn-block" type="button" data-action="delete-teacher" data-id="' + esc(m.id) + '">Remove ' + esc(C.firstName(m.name)) + '</button>')) +
      '</div></form></div>';
  }
  function saveTeacher() {
    var f = document.getElementById('teacher-form');
    var fd = new FormData(f);
    var m = Object.assign({}, ui.sheet.model);
    m.name = String(fd.get('name') || '').trim();
    m.usualArea = String(fd.get('usualArea') || '');
    m.usualPositionId = String(fd.get('usualPositionId') || '');
    m.usualLocationId = String(fd.get('usualLocationId') || '');
    m.pin = String(fd.get('pin') || '').trim();
    m.role = String(fd.get('role') || 'teacher');
    m.active = fd.get('active') != null;
    var errors = C.validateTeacher(m);
    if (!m.usualPositionId) errors.push('Choose a usual position.');
    if (session && session.teacherId === m.id && m.role !== 'admin') errors.push('You cannot remove your own admin access.');
    if (session && session.teacherId === m.id && !m.active) errors.push('You cannot mark yourself inactive while logged in.');
    if (errors.length) { ui.sheet.errors = errors; ui.sheet.model = m; renderLayer(); return; }
    if (!m.id) { m.id = C.newId('t'); state.teachers.push(m); }
    else { var i = state.teachers.findIndex(function (t) { return t.id === m.id; }); if (i >= 0) state.teachers[i] = m; }
    markEdited(); save(); ui.sheet = null; render(); toast(m.name + ' saved.');
  }
  function deleteTeacher(id) {
    var t = T()[id]; if (!t) return;
    if (C.assignmentsReferencing(id, state.assignments).length) { toast(C.firstName(t.name) + ' is still on the schedule. Remove those shifts first.'); return; }
    confirmDialog({
      title: 'Remove ' + t.name + '?', body: 'They will no longer be able to log in. This cannot be undone.', confirmLabel: 'Remove', danger: true,
      onConfirm: function () { state.teachers = state.teachers.filter(function (x) { return x.id !== id; }); markEdited(); save(); ui.sheet = null; ui.dialog = null; render(); toast(t.name + ' removed.'); }
    });
  }

  // ---------------------------------------------------------------- actions
  function afterLogin() {
    ui.loginError = ''; ui.loginPerson = null; ui.loginMaster = false; ui.teacherWeekOffset = null; ui.route = null;
    var next = null;
    try { next = new URLSearchParams(location.search).get('next'); } catch (e) { /* ignore */ }
    if (next && /^\/[a-z]/i.test(next)) { location.href = next; return; }
    go('dash');
  }
  function login(teacherId, pin, master) {
    var body = master ? { teacherId: teacherId, master: master } : { teacherId: teacherId, pin: String(pin || '').trim() };
    api('POST', '/api/login', body).then(function (j) {
      if (j.__status !== 200) { ui.loginError = j.error || 'Could not sign in.'; render(); return; }
      return loadState().then(function () {
        if (!state) { ui.loginError = 'Signed in, but the schedule could not be loaded.'; render(); return; }
        afterLogin();
      });
    }).catch(function () { ui.loginError = 'Could not reach the server.'; render(); });
  }
  function logout() {
    if (saveQueued) flushSave();
    api('POST', '/api/logout').catch(function () { /* ignore */ }).then(function () {
      session = null; state = null; ui.sheet = null; ui.dialog = null; ui.loginPerson = null; ui.teacherWeekOffset = null; ui.route = null;
      loadStaff().then(function () { go('login'); });
    });
  }
  function resetDemo() {
    confirmDialog({
      title: 'Reset demo data?', body: 'Restores the sample week and staff. Anything you added or changed is removed.', confirmLabel: 'Reset', danger: true,
      onConfirm: function () {
        var keepDemoToday = state.settings.demoToday, keepDemoTime = state.settings.demoTime;
        var meNow = currentUser();
        state = freshState(); state.settings.demoToday = keepDemoToday; state.settings.demoTime = keepDemoTime; sanitizeSettings(state);
        // Keep the signed-in admin's account so the session stays valid.
        if (meNow && !T()[meNow.id]) state.teachers.unshift(meNow);
        markEdited(); save();
        ui.adminWeek = null; ui.adminDay = null; ui.boardDay = null; ui.dialog = null; ui.sheet = null; ui.teacherWeekOffset = null;
        render(); toast('Demo data reset.');
      }
    });
  }
  function scrollToId(id) {
    var el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); el.classList.add('is-flash'); setTimeout(function () { el.classList.remove('is-flash'); }, 1500); }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    switch (action) {
      case 'nav': e.preventDefault(); ui.sheet = null; ui.dialog = null; ui.teacherWeekOffset = null; go(el.getAttribute('data-route')); break;
      case 'scroll-to': {
        e.preventDefault();
        var setTo = el.getAttribute('data-set');
        if (setTo !== null && Number(setTo) !== ui.teacherWeekOffset) { ui.teacherWeekOffset = Number(setTo); render(); }
        scrollToId(el.getAttribute('data-target')); break;
      }
      case 'login-pick': ui.loginPerson = el.getAttribute('data-id'); ui.loginError = ''; render();
        var pin = document.getElementById('pin') || document.getElementById('master'); if (pin) { pin.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); focusEl(pin); } break;
      case 'logout': logout(); break;
      case 'login-master': ui.loginMaster = !ui.loginMaster; ui.loginError = ''; render(); break;
      case 'teacher-week': ui.teacherWeekOffset = Number(el.getAttribute('data-set')); render(); window.scrollTo(0, 0); break;
      case 'admin-week-nav': {
        var d = Number(el.getAttribute('data-delta'));
        ui.adminWeek = d === 0 ? homeWeek() : C.addDays(ui.adminWeek, 7 * d);
        ui.adminDay = null; ui.boardDay = null; ensureAdminWeek(); render(); break;
      }
      case 'admin-day': ui.adminDay = el.getAttribute('data-date'); render(); break;
      case 'dash-week': {
        var dd = Number(el.getAttribute('data-delta'));
        ui.dashWeek = dd === 0 ? C.upcomingSchoolWeekStart(todayISO()) : C.addDays(ui.dashWeek, 7 * dd);
        render(); break;
      }
      case 'board-day': ui.boardDay = el.getAttribute('data-date'); render(); break;
      case 'new-assignment': openAssignmentEditor(null, { date: el.getAttribute('data-date'), locationId: el.getAttribute('data-location') || '', teacherId: el.getAttribute('data-teacher') || '' }); break;
      case 'edit-assignment': {
        var a = state.assignments.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
        if (a) openAssignmentEditor(a); break;
      }
      case 'delete-assignment': deleteAssignment(el.getAttribute('data-id')); break;
      case 'publish-week': publishWeek(); break;
      case 'copy-prev-week': copyPrevWeek(); break;
      case 'set-block': {
        var f = document.getElementById('editor-form');
        if (f) { f.querySelector('#f-start').value = el.getAttribute('data-start'); f.querySelector('#f-end').value = el.getAttribute('data-end'); updateEditorLive('start'); }
        break;
      }
      case 'reassign-open': ui.sheet.model = readEditorForm() || ui.sheet.model; ui.sheet.reassign = true; ui.sheet.keepFocus = true; renderLayer();
        var rl = document.getElementById('reassign-list'); if (rl) rl.scrollIntoView({ block: 'nearest' }); break;
      case 'reassign-cancel': ui.sheet.model = readEditorForm() || ui.sheet.model; ui.sheet.reassign = false; ui.sheet.keepFocus = true; renderLayer(); break;
      case 'reassign-pick': {
        var m = readEditorForm() || ui.sheet.model;
        var from = m.teacherId, to = el.getAttribute('data-id');
        m.teacherId = to;
        if (from && from !== to) {
          m.coveringForTeacherId = from;
          if (!m.note) m.note = 'Covering for ' + C.firstName(teacherName(from)) + '.';
        }
        ui.sheet.model = m; ui.sheet.reassign = false; ui.sheet.keepFocus = true; renderLayer();
        toast('Reassigned to ' + teacherName(to) + '. Save when ready.');
        break;
      }
      case 'new-teacher': openTeacherEditor(null); break;
      case 'new-location': openLocationEditor(null); break;
      case 'edit-location': openLocationEditor(L()[el.getAttribute('data-id')]); break;
      case 'delete-location': deleteLocation(el.getAttribute('data-id')); break;
      case 'edit-teacher': openTeacherEditor(T()[el.getAttribute('data-id')]); break;
      case 'delete-teacher': deleteTeacher(el.getAttribute('data-id')); break;
      case 'close-sheet': ui.sheet = null; renderLayer(); break;
      case 'close-dialog': ui.dialog = null; renderLayer(); break;
      case 'confirm-dialog': if (ui.dialog && ui.dialog.onConfirm) ui.dialog.onConfirm(); else { ui.dialog = null; renderLayer(); } break;
      case 'reset-demo': resetDemo(); break;
      default: break;
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    var kind = f.getAttribute('data-form');
    if (kind === 'login') { var lf = new FormData(f); var who = String(lf.get('teacherId') || ''); if (!who) { ui.loginError = 'Pick your name first.'; render(); return; } ui.loginPerson = who; login(who, lf.get('pin'), ui.loginMaster ? String(lf.get('master') || '') : null); }
    else if (kind === 'assignment') saveAssignment(e.submitter && e.submitter.getAttribute('data-publish') === '1');
    else if (kind === 'teacher') saveTeacher();
    else if (kind === 'location') saveLocation();
    else if (kind === 'settings') {
      var fd = new FormData(f);
      state.settings.schoolName = String(fd.get('schoolName') || '').trim() || state.settings.schoolName;
      state.settings.adminName = String(fd.get('adminName') || '').trim() || state.settings.adminName;
      state.settings.adminPhone = String(fd.get('adminPhone') || '').trim();
      state.settings.adminContact = String(fd.get('adminContact') || '').trim();
      markEdited(); save(); render(); toast('Settings saved.');
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.closest('#editor-form')) updateEditorLive(e.target.name);
  });
  document.addEventListener('change', function (e) {
    var seg = e.target.closest('.seg'); if (seg) syncSegmented(seg);
    if (e.target.closest('#editor-form')) { updateEditorLive(e.target.name); return; }
    var key = e.target.getAttribute && e.target.getAttribute('data-change');
    if (key === 'login-person') { ui.loginPerson = e.target.value || null; ui.loginError = ''; render(); var pinEl = document.getElementById('pin') || document.getElementById('master'); focusEl(pinEl); return; }
    if (key === 'demo-today') {
      state.settings.demoToday = e.target.value || null; markEdited(); save();
      ui.adminWeek = null; ui.adminDay = null; ui.boardDay = null; ui.teacherWeekOffset = null; ui.dashWeek = null;
      render(); toast(state.settings.demoToday ? 'Today is now ' + C.formatDate(state.settings.demoToday, 'short') + ' (demo).' : 'Using the real date and time.');
    } else if (key === 'demo-time') {
      state.settings.demoTime = e.target.value || '10:00'; markEdited(); save(); render();
      toast('The time is now ' + C.formatTime(state.settings.demoTime) + ' (demo).');
    } else if (key === 'show-pins') {
      state.settings.showDemoPins = !!e.target.checked; markEdited(); save();
    }
  });
  // Escape closes only the top layer; Tab stays inside it.
  document.addEventListener('keydown', function (e) {
    if (!(ui.sheet || ui.dialog)) return;
    if (e.key === 'Escape') {
      if (ui.dialog) ui.dialog = null; else { ui.sheet = null; }
      renderLayer(); return;
    }
    if (e.key === 'Tab') {
      var box = document.querySelector(ui.dialog ? '.dialog' : '.sheet');
      if (!box) return;
      var f = box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], inside = box.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); focusEl(last); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); focusEl(first); }
    }
  });
  window.addEventListener('hashchange', function () {
    var h = readHash();
    if (h && h !== ui.route) { ui.sheet = null; ui.dialog = null; ui.route = h; render(); }
  });

  // ---------------------------------------------------------------- boot
  document.getElementById('app').innerHTML = '<main class="login"><p class="muted">Loading…</p></main>';
  ui.route = readHash();
  Promise.all([loadStaff(), loadState()]).then(function () {
    boot.loaded = true;
    if (session && state && !T()[session.teacherId]) { session = null; state = null; }
    render();
  });

  // Exposed for debugging and QA scripts.
  window.__staffSchedule = { getState: function () { return state; }, reset: function () { state = freshState(); save(); render(); } };
})();
