'use strict';

/* ---------- Constants ---------- */
const STORE_KEY = 'doshit:v1';
const COLORS = ['blue', 'green', 'orange', 'red', 'purple', 'pink', 'teal', 'indigo'];
const EMOJIS = ['💧', '🏃', '📖', '🧘', '😴', '🥗', '💪', '🚶', '✍️', '🎸', '🦷', '💊',
  '🧹', '📵', '☀️', '🙏', '🎯', '💰', '🚭', '🍎', '🧠', '🌿', '🎨', '📞'];
const DOW_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STARTERS = [
  { name: 'Drink water', emoji: '💧', color: 'blue' },
  { name: 'Move 30 min', emoji: '🏃', color: 'green' },
  { name: 'Read 10 pages', emoji: '📖', color: 'purple' },
  { name: 'Meditate', emoji: '🧘', color: 'teal' },
  { name: 'Sleep by 11', emoji: '😴', color: 'indigo' },
  { name: 'Eat a vegetable', emoji: '🥗', color: 'orange' },
  { name: 'No phone in bed', emoji: '📵', color: 'red' },
  { name: 'Floss', emoji: '🦷', color: 'pink' },
];
const FLAME = '<svg class="flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.6 3-1 4.8-2.6 6.6C7.9 10.8 6.5 12.4 6.5 15a5.5 5.5 0 0 0 11 0c0-2.2-.9-3.9-1.9-5.2-.1 1.5-.8 2.6-2 3.1.5-3.7-.2-7.3-1.6-10.4Z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>';
const CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
const CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

/* ---------- Dates (local, keyed YYYY-MM-DD) ---------- */
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const startOfWeek = d => addDays(d, -((d.getDay() + 6) % 7)); // Monday

/* ---------- State ---------- */
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.habits)) return { log: {}, settings: { theme: 'auto' }, ...s };
  } catch (e) { /* storage blocked or corrupt: start fresh */ }
  return { version: 1, habits: [], log: {}, settings: { theme: 'auto' }, onboarded: false };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Couldn’t save on this device'); }
}

const uid = () => Math.random().toString(36).slice(2, 10);
const habitById = id => state.habits.find(h => h.id === id);

/* ---------- Habit logic ---------- */
const isDue = (h, d) => keyOf(d) >= h.createdAt && (!h.days.length || h.days.includes(d.getDay()));
const isDone = (h, k) => (state.log[k] || []).includes(h.id);
const dueOn = d => state.habits.filter(h => isDue(h, d));

function setDone(h, k, done) {
  const arr = state.log[k] || (state.log[k] = []);
  const i = arr.indexOf(h.id);
  if (done && i < 0) arr.push(h.id);
  if (!done && i >= 0) arr.splice(i, 1);
  if (!arr.length) delete state.log[k];
  save();
}

// Consecutive scheduled days done, ending today (or yesterday if today isn't done yet).
function habitStreak(h) {
  let d = today();
  if (isDue(h, d) && !isDone(h, keyOf(d))) d = addDays(d, -1);
  const start = fromKey(h.createdAt);
  let n = 0;
  for (; d >= start; d = addDays(d, -1)) {
    if (!isDue(h, d)) continue;
    if (isDone(h, keyOf(d))) n++; else break;
  }
  return n;
}

function habitBest(h) {
  const t = today();
  let best = 0, run = 0;
  for (let d = fromKey(h.createdAt); d <= t; d = addDays(d, 1)) {
    if (!isDue(h, d)) continue;
    if (isDone(h, keyOf(d))) best = Math.max(best, ++run);
    else if (keyOf(d) !== keyOf(t)) run = 0;
  }
  return best;
}

const habitTotal = h => Object.values(state.log).filter(a => a.includes(h.id)).length;

// Share of due days done over the last `days` days. Today only counts once it's done.
function habitRate(h, days = 30) {
  const t = today();
  let due = 0, done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(t, -i);
    if (!isDue(h, d)) continue;
    const ok = isDone(h, keyOf(d));
    if (i === 0 && !ok) continue;
    due++; if (ok) done++;
  }
  return due ? Math.round((done / due) * 100) : 0;
}

function dayFraction(d) {
  const due = dueOn(d);
  if (!due.length) return null;
  const k = keyOf(d);
  return due.filter(h => isDone(h, k)).length / due.length;
}

const earliest = () => state.habits.reduce((m, h) => (h.createdAt < m ? h.createdAt : m), keyOf(today()));

// Days in a row where every due habit was done. Days with nothing due are skipped.
function overallStreak() {
  if (!state.habits.length) return 0;
  let d = today();
  const f0 = dayFraction(d);
  if (f0 !== null && f0 < 1) d = addDays(d, -1);
  const start = fromKey(earliest());
  let n = 0;
  for (; d >= start; d = addDays(d, -1)) {
    const f = dayFraction(d);
    if (f === null) continue;
    if (f === 1) n++; else break;
  }
  return n;
}

function overallBest() {
  const t = today();
  let best = 0, run = 0;
  for (let d = fromKey(earliest()); d <= t; d = addDays(d, 1)) {
    const f = dayFraction(d);
    if (f === null) continue;
    if (f === 1) best = Math.max(best, ++run);
    else if (keyOf(d) !== keyOf(t)) run = 0;
  }
  return best;
}

function overallRate(days = 30) {
  const t = today();
  let due = 0, done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(t, -i), k = keyOf(d);
    for (const h of dueOn(d)) {
      const ok = isDone(h, k);
      if (i === 0 && !ok) continue;
      due++; if (ok) done++;
    }
  }
  return due ? Math.round((done / due) * 100) : 0;
}

const scheduleText = h => {
  if (!h.days.length || h.days.length === 7) return 'Every day';
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter(x => h.days.includes(x));
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '6,0') return 'Weekends';
  return sorted.map(x => DOW_NAMES[x]).join(', ');
};

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* unsupported */ } };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------- Today ---------- */
function habitItem(h, k, interactive) {
  const done = isDone(h, k);
  const streak = habitStreak(h);
  const sub = streak > 0
    ? `<div class="habit-sub hot">${FLAME}${plural(streak, 'day')}</div>`
    : `<div class="habit-sub">${esc(scheduleText(h))}</div>`;
  return `<li class="habit${done ? ' done' : ''}" data-id="${h.id}" data-color="${h.color}">
    <div class="habit-icon">${h.emoji}</div>
    <div class="habit-main"><div class="habit-name">${esc(h.name)}</div>${sub}</div>
    ${interactive ? `<button class="check" aria-label="Mark ${esc(h.name)} ${done ? 'not done' : 'done'}" aria-pressed="${done}">${CHECK}</button>` : ''}
  </li>`;
}

function renderToday() {
  const t = today(), k = keyOf(t);
  $('#todayDate').textContent = t.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const due = dueOn(t);
  const later = state.habits.filter(h => !due.includes(h));
  $('#habitList').innerHTML = due.map(h => habitItem(h, k, true)).join('');
  $('#laterList').innerHTML = later.map(h => habitItem(h, k, false)).join('');
  $('#laterHeader').hidden = !later.length;
  $('#emptyToday').hidden = state.habits.length > 0;
  $('#summary').hidden = state.habits.length === 0;
  renderSummary();
}

function renderSummary() {
  const t = today(), k = keyOf(t);
  const due = dueOn(t);
  const done = due.filter(h => isDone(h, k)).length;
  const frac = due.length ? done / due.length : 0;
  $('#ringFill').style.strokeDashoffset = String(213.6 * (1 - frac));
  $('#summaryCount').textContent = due.length ? `${done} of ${due.length} done` : 'Rest day';
  $('#summaryLabel').textContent = !due.length ? 'Nothing due today'
    : done === due.length ? 'All done. Nice work.'
    : done === 0 ? 'Tap a circle when you’re done'
    : `${due.length - done} to go`;
  const s = overallStreak();
  $('#overallStreakNum').textContent = s;
  $('#overallStreak').classList.toggle('zero', s === 0);
}

function toggleToday(li) {
  const h = habitById(li.dataset.id);
  if (!h) return;
  const k = keyOf(today());
  const wasAll = dayFraction(today()) === 1;
  const prevStreak = overallStreak();
  const nowDone = !isDone(h, k);
  setDone(h, k, nowDone);
  buzz(nowDone ? 12 : 6);

  // Update the card in place so the animation plays.
  const fresh = document.createElement('template');
  fresh.innerHTML = habitItem(h, k, true).trim();
  li.querySelector('.habit-sub').replaceWith(fresh.content.querySelector('.habit-sub'));
  li.classList.toggle('done', nowDone);
  const btn = li.querySelector('.check');
  btn.setAttribute('aria-pressed', String(nowDone));
  btn.setAttribute('aria-label', `Mark ${h.name} ${nowDone ? 'not done' : 'done'}`);
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');

  renderSummary();
  if (overallStreak() > prevStreak) {
    const b = $('#overallStreak');
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }
  if (!wasAll && dayFraction(today()) === 1) setTimeout(celebrate, 450);
}

/* ---------- Progress ---------- */
function renderProgress() {
  $('#pStreak').textContent = overallStreak();
  $('#pBest').textContent = overallBest();
  $('#pRate').textContent = `${overallRate()}%`;

  const t = today(), mon = startOfWeek(t);
  let week = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const f = d > t ? null : dayFraction(d);
    const label = DOW_SHORT[d.getDay()];
    const isT = keyOf(d) === keyOf(t);
    const mark = f === 1
      ? `<div class="full">${CHECK}</div>`
      : `<svg class="mini-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="t" cx="18" cy="18" r="14"/>${f ? `<circle class="f" cx="18" cy="18" r="14" style="stroke-dashoffset:${87.96 * (1 - f)}"/>` : ''}</svg>`;
    week += `<div class="wday${isT ? ' is-today' : ''}">${label}${mark}</div>`;
  }
  $('#weekStrip').innerHTML = week;

  // 12 weeks, Monday-first columns, ending this week.
  const first = addDays(mon, -7 * 11);
  let heat = '';
  for (let i = 0; i < 84; i++) {
    const d = addDays(first, i);
    if (d > t) { heat += '<i class="future"></i>'; continue; }
    const f = dayFraction(d);
    const l = f === null || f === 0 ? 0 : f === 1 ? 4 : f >= 0.66 ? 3 : f >= 0.33 ? 2 : 1;
    heat += `<i data-l="${l}"${keyOf(d) === keyOf(t) ? ' class="today"' : ''} title="${keyOf(d)}"></i>`;
  }
  $('#heatmap').innerHTML = heat;

  $('#habitStats').innerHTML = state.habits.length
    ? state.habits.map(h => {
      const s = habitStreak(h), r = habitRate(h);
      return `<li><button class="stat-line" data-id="${h.id}" data-color="${h.color}">
        <div class="habit-icon">${h.emoji}</div><div class="name">${esc(h.name)}</div>
        <div class="meta">${s ? `<b>${s}d</b>` : ''}<span class="bar"><span style="width:${r}%"></span></span>${r}%</div>
      </button></li>`;
    }).join('')
    : '<li><div class="stat-line" style="color:var(--text2)">Add a habit to see stats here.</div></li>';
}

/* ---------- Tabs ---------- */
let currentTab = 'today';
function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'today') renderToday(); else renderProgress();
  window.scrollTo(0, 0);
}

function renderAll() {
  if (currentTab === 'today') renderToday(); else renderProgress();
  if (detailId) renderDetail();
}

/* ---------- Detail page ---------- */
let detailId = null;
let detailMonth = null;

function openDetail(id) {
  detailId = id;
  const t = today();
  detailMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  renderDetail();
  const p = $('#pageDetail');
  p.scrollTop = 0;
  p.classList.add('open');
  p.setAttribute('aria-hidden', 'false');
}

function closeDetail() {
  const p = $('#pageDetail');
  p.classList.remove('open');
  p.setAttribute('aria-hidden', 'true');
  detailId = null;
  renderAll();
}

function renderDetail() {
  const h = habitById(detailId);
  if (!h) { closeDetail(); return; }
  const t = today(), tk = keyOf(t);
  const s = habitStreak(h);
  const y = detailMonth.getFullYear(), m = detailMonth.getMonth();
  const created = fromKey(h.createdAt);
  const canPrev = new Date(y, m, 1) > new Date(created.getFullYear(), created.getMonth(), 1);
  const canNext = new Date(y, m + 1, 1) <= t;

  let cal = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<div class="dow">${x}</div>`).join('');
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  cal += '<div></div>'.repeat(lead);
  const daysIn = new Date(y, m + 1, 0).getDate();
  for (let i = 1; i <= daysIn; i++) {
    const d = new Date(y, m, i), k = keyOf(d);
    const due = isDue(h, d), done = isDone(h, k), future = d > t;
    const cls = ['day', done ? 'done' : due && !future ? 'due' : 'off', k === tk ? 'today' : ''].join(' ');
    cal += due && !future
      ? `<button class="${cls}" data-day="${k}" aria-label="${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}, ${done ? 'done' : 'not done'}">${i}</button>`
      : `<div class="${cls}">${i}</div>`;
  }

  $('#detailBody').innerHTML = `
    <div class="detail-hero" data-color="${h.color}">
      <div class="habit-icon">${h.emoji}</div>
      <h1>${esc(h.name)}</h1>
      <p>${esc(scheduleText(h))}</p>
    </div>
    <div class="big-streak${s ? '' : ' zero'}">
      <div class="num">${FLAME}${s}</div>
      <div class="lbl">day streak</div>
    </div>
    <div class="stat-row">
      <div class="card stat"><div class="stat-num">${habitBest(h)}</div><div class="stat-label">Best streak</div></div>
      <div class="card stat"><div class="stat-num">${habitTotal(h)}</div><div class="stat-label">Times done</div></div>
      <div class="card stat"><div class="stat-num">${habitRate(h)}%</div><div class="stat-label">Last 30 days</div></div>
    </div>
    <div class="card month" data-color="${h.color}">
      <div class="month-head">
        <button data-month="-1" aria-label="Previous month"${canPrev ? '' : ' disabled'}>${CHEV_L}</button>
        <strong>${detailMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button data-month="1" aria-label="Next month"${canNext ? '' : ' disabled'}>${CHEV_R}</button>
      </div>
      <div class="cal">${cal}</div>
      <p class="cal-hint">Tap a day to fix a missed check-in.</p>
    </div>`;
}

/* ---------- Habit sheet (add / edit) ---------- */
let editingId = null;
let draft = null;
let deleteArmed = false;

function openSheet(id) {
  const s = $(id);
  $('#backdrop').classList.add('open');
  s.classList.add('open');
  s.setAttribute('aria-hidden', 'false');
}

function closeSheets() {
  $('#backdrop').classList.remove('open');
  document.querySelectorAll('.sheet.open').forEach(s => {
    s.classList.remove('open');
    s.setAttribute('aria-hidden', 'true');
  });
  document.activeElement && document.activeElement.blur();
}

function openHabitSheet(id = null) {
  editingId = id;
  deleteArmed = false;
  const h = id && habitById(id);
  const usedColors = state.habits.map(x => x.color);
  draft = h
    ? { name: h.name, emoji: h.emoji, color: h.color, days: [...h.days], repeat: h.days.length ? 'custom' : 'daily' }
    : { name: '', emoji: EMOJIS[state.habits.length % EMOJIS.length], color: COLORS.find(c => !usedColors.includes(c)) || 'blue', days: [], repeat: 'daily' };

  $('#habitSheetTitle').textContent = h ? 'Edit habit' : 'New habit';
  $('#habitSubmit').textContent = h ? 'Save' : 'Add habit';
  $('#habitDelete').hidden = !h;
  $('#habitDelete').textContent = 'Delete habit';
  $('#habitName').value = draft.name;
  $('#formError').hidden = true;
  renderDraft();
  openSheet('#sheetHabit');
}

function renderDraft() {
  const sheet = $('#sheetHabit');
  sheet.dataset.color = draft.color;
  $('#previewIcon').textContent = draft.emoji;
  $('#emojiGrid').innerHTML = EMOJIS.map(e =>
    `<button type="button" data-emoji="${e}" class="${e === draft.emoji ? 'on' : ''}" aria-label="Icon ${e}" aria-pressed="${e === draft.emoji}">${e}</button>`).join('');
  $('#swatches').innerHTML = COLORS.map(c =>
    `<button type="button" data-color="${c}" data-pick="${c}" class="${c === draft.color ? 'on' : ''}" aria-label="${c}" aria-pressed="${c === draft.color}"></button>`).join('');
  const custom = draft.repeat === 'custom';
  $('#repeatSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.repeat === 'custom') === custom));
  $('#dayPicker').hidden = !custom;
  $('#dayPicker').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d =>
    `<button type="button" data-dow="${d}" class="${draft.days.includes(d) ? 'on' : ''}" aria-label="${DOW_NAMES[d]}" aria-pressed="${draft.days.includes(d)}">${DOW_SHORT[d]}</button>`).join('');
}

function bounce(el) { el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce'); }

function submitHabit(e) {
  e.preventDefault();
  const name = $('#habitName').value.trim();
  const err = $('#formError');
  if (!name) { err.textContent = 'Give your habit a name.'; err.hidden = false; $('#habitName').focus(); return; }
  if (draft.repeat === 'custom' && !draft.days.length) {
    err.textContent = 'Pick at least one day.'; err.hidden = false; return;
  }
  const days = draft.repeat === 'daily' || draft.days.length === 7 ? [] : [...draft.days].sort();
  if (editingId) {
    Object.assign(habitById(editingId), { name, emoji: draft.emoji, color: draft.color, days });
    toast('Saved');
  } else {
    state.habits.push({ id: uid(), name, emoji: draft.emoji, color: draft.color, days, createdAt: keyOf(today()) });
    toast('Habit added');
  }
  state.onboarded = true;
  save();
  closeSheets();
  renderAll();
}

function deleteHabit() {
  const btn = $('#habitDelete');
  if (!deleteArmed) { deleteArmed = true; btn.textContent = 'Tap again to delete'; buzz(20); return; }
  const id = editingId;
  state.habits = state.habits.filter(h => h.id !== id);
  for (const k of Object.keys(state.log)) {
    state.log[k] = state.log[k].filter(x => x !== id);
    if (!state.log[k].length) delete state.log[k];
  }
  save();
  closeSheets();
  if (detailId === id) closeDetail(); else renderAll();
  toast('Habit deleted');
}

/* ---------- Settings ---------- */
function applyTheme() {
  const t = state.settings.theme || 'auto';
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#000000' : '#F2F2F7';
  $('#themeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.theme === t));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `doshit-backup-${keyOf(today())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s || !Array.isArray(s.habits) || typeof s.log !== 'object') throw new Error('bad shape');
      state = { version: 1, settings: { theme: 'auto' }, ...s, onboarded: true };
      save(); applyTheme(); closeSheets(); renderAll();
      toast(`Imported ${plural(state.habits.length, 'habit')}`);
    } catch (e) { toast('That file isn’t a DoShit backup'); }
  };
  r.readAsText(file);
}

let eraseArmed = false;
function eraseAll() {
  const btn = $('#btnErase');
  if (!eraseArmed) { eraseArmed = true; btn.textContent = 'Tap again to erase everything'; buzz(20); return; }
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  state = load();
  eraseArmed = false;
  btn.textContent = 'Erase all data';
  closeSheets(); applyTheme(); renderAll();
  showOnboarding();
}

/* ---------- Celebration ---------- */
function celebrate() {
  const s = overallStreak();
  const n = dueOn(today()).length;
  $('#celebrateSub').textContent = `All ${plural(n, 'habit')} done today`;
  $('#celebrateStreak').innerHTML = `${FLAME}${plural(s, 'day')} streak`;
  const t = today(), mon = startOfWeek(t);
  let dots = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const on = d <= t && dayFraction(d) === 1;
    dots += `<div>${DOW_SHORT[d.getDay()]}<i class="${on ? 'on' : ''}${keyOf(d) === keyOf(t) ? ' now' : ''}"></i></div>`;
  }
  $('#celebrateDots').innerHTML = dots;
  const o = $('#celebrate');
  o.classList.add('open');
  o.setAttribute('aria-hidden', 'false');
  buzz([20, 60, 30]);
  confetti();
}

function closeCelebrate() {
  const o = $('#celebrate');
  o.classList.remove('open');
  o.setAttribute('aria-hidden', 'true');
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti'), ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const cols = ['--blue', '--green', '--orange', '--pink', '--purple', '--teal'].map(v => css.getPropertyValue(v).trim());
  const parts = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.38,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)],
  }));
  const end = performance.now() + 2600;
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (now < end && $('#celebrate').classList.contains('open')) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(performance.now());
}

/* ---------- Onboarding ---------- */
const picked = new Set();

function showOnboarding() {
  picked.clear();
  $('#obGrid').innerHTML = STARTERS.map((s, i) =>
    `<button type="button" data-i="${i}" data-color="${s.color}" aria-pressed="false"><span>${s.emoji}</span><span>${esc(s.name)}</span></button>`).join('');
  updateObButton();
  const o = $('#onboarding');
  o.classList.add('open');
  o.setAttribute('aria-hidden', 'false');
}

function updateObButton() {
  const b = $('#obStart');
  b.textContent = picked.size ? `Start with ${plural(picked.size, 'habit')}` : 'Pick at least one';
  b.setAttribute('aria-disabled', String(!picked.size));
}

function finishOnboarding(withPicks) {
  if (withPicks) {
    if (!picked.size) { buzz(20); return; }
    const k = keyOf(today());
    [...picked].sort((a, b) => a - b).forEach(i => {
      const s = STARTERS[i];
      state.habits.push({ id: uid(), name: s.name, emoji: s.emoji, color: s.color, days: [], createdAt: k });
    });
  }
  state.onboarded = true;
  save();
  const o = $('#onboarding');
  o.classList.remove('open');
  o.setAttribute('aria-hidden', 'true');
  renderAll();
  if (!withPicks) openHabitSheet();
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action],[data-tab]');
  if (!el) return;
  if (el.dataset.tab) return showTab(el.dataset.tab);
  switch (el.dataset.action) {
    case 'add': return openHabitSheet();
    case 'close': return closeSheets();
    case 'back': return closeDetail();
    case 'edit': return openHabitSheet(detailId);
    case 'close-celebrate': return closeCelebrate();
  }
});

$('#habitList').addEventListener('click', e => {
  const li = e.target.closest('.habit');
  if (!li) return;
  if (e.target.closest('.check')) toggleToday(li);
  else openDetail(li.dataset.id);
});
$('#laterList').addEventListener('click', e => {
  const li = e.target.closest('.habit');
  if (li) openDetail(li.dataset.id);
});
$('#habitStats').addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) openDetail(b.dataset.id);
});

$('#detailBody').addEventListener('click', e => {
  const mb = e.target.closest('[data-month]');
  if (mb && !mb.disabled) {
    detailMonth = new Date(detailMonth.getFullYear(), detailMonth.getMonth() + Number(mb.dataset.month), 1);
    return renderDetail();
  }
  const day = e.target.closest('[data-day]');
  if (day) {
    const h = habitById(detailId);
    setDone(h, day.dataset.day, !isDone(h, day.dataset.day));
    buzz(10);
    renderDetail();
  }
});

$('#btnSettings').addEventListener('click', () => {
  eraseArmed = false;
  $('#btnErase').textContent = 'Erase all data';
  openSheet('#sheetSettings');
});
$('#backdrop').addEventListener('click', closeSheets);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('#celebrate').classList.contains('open')) closeCelebrate();
  else if (document.querySelector('.sheet.open')) closeSheets();
  else if (detailId) closeDetail();
});

$('#habitForm').addEventListener('submit', submitHabit);
$('#habitName').addEventListener('input', () => { $('#formError').hidden = true; });
$('#habitDelete').addEventListener('click', deleteHabit);
$('#emojiGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-emoji]');
  if (!b) return;
  draft.emoji = b.dataset.emoji;
  renderDraft(); bounce($('#previewIcon')); buzz(5);
});
$('#swatches').addEventListener('click', e => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  draft.color = b.dataset.pick;
  renderDraft(); buzz(5);
});
$('#repeatSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-repeat]');
  if (!b) return;
  draft.repeat = b.dataset.repeat;
  if (draft.repeat === 'custom' && !draft.days.length) draft.days = [1, 2, 3, 4, 5];
  $('#formError').hidden = true;
  renderDraft();
});
$('#dayPicker').addEventListener('click', e => {
  const b = e.target.closest('[data-dow]');
  if (!b) return;
  const d = Number(b.dataset.dow);
  const i = draft.days.indexOf(d);
  if (i >= 0) draft.days.splice(i, 1); else draft.days.push(d);
  $('#formError').hidden = true;
  renderDraft();
});

$('#themeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-theme]');
  if (!b) return;
  state.settings.theme = b.dataset.theme;
  save(); applyTheme();
});
$('#btnExport').addEventListener('click', exportData);
$('#importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
$('#btnErase').addEventListener('click', eraseAll);

$('#obGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  const i = Number(b.dataset.i);
  if (picked.has(i)) picked.delete(i); else picked.add(i);
  b.classList.toggle('on', picked.has(i));
  b.setAttribute('aria-pressed', String(picked.has(i)));
  buzz(5);
  updateObButton();
});
$('#obStart').addEventListener('click', () => finishOnboarding(true));
$('#obSkip').addEventListener('click', () => finishOnboarding(false));

// Re-render when the app comes back from the background (it may be a new day).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  state = load();
  renderAll();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------- Boot ---------- */
applyTheme();
renderToday();
if (!state.onboarded && !state.habits.length) showOnboarding();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}
