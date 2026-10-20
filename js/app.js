/* فصلي — النواة: الحالة، التنقل، الجدول، الرئيسية، مساعد الحصة */
'use strict';

const App = {
  S: {}, classes: [], cls: {}, students: [], stu: {}, timetable: [], bell: DEFAULT_BELL, lists: DEFAULT_LISTS,
  stack: [], _sheets: [], _alerted: {}, _autoOpened: {}, _hiddenAt: 0, locked: false,

  async start() {
    try {
      await DB.open();
      await seedIfEmpty();
      await upgradeSeed();
      await this.load();
    } catch (e) {
      $('#view').innerHTML = `<div class="empty"><h3>تعذر فتح قاعدة البيانات</h3><p>${esc(e.message)}</p></div>`;
      return;
    }
    this.renderNav();
    try { Look.apply(); setInterval(() => Look.apply(), 60000); } catch (e) { }
    setTimeout(() => $('#splash')?.classList.add('hide'), 1600);
    setTimeout(() => $('#splash')?.remove(), 2200);
    if (this.S.lockEnabled && await DB.getSetting('pinHash')) await this.lock();
    try { await Cloud.offerRestore(); } catch (e) { console.warn(e); }
    const po = Native.call('getPendingOpen');
    let opened = false;
    if (po) { try { const o = JSON.parse(po); this.openFromNotification(o.classId, o.period); opened = true; } catch (e) { } }
    if (!opened) opened = this.tryAutoOpen();
    if (!opened) this.go('home');
    this.syncNative();
    setTimeout(() => AutoBackup.run(), 6000);
    setInterval(() => this.tick(), 1000);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('popstate', () => { });
  },

  async load() {
    const settings = await DB.all('settings');
    this.S = { ...DEFAULT_SETTINGS };
    settings.forEach(s => this.S[s.key] = s.value);
    this.bell = this.S.bell || DEFAULT_BELL;
    this.lists = { ...DEFAULT_LISTS, ...(this.S.lists || {}) };
    this.classes = (await DB.all('classes')).sort((a, b) => a.grade - b.grade || a.section - b.section);
    this.cls = Object.fromEntries(this.classes.map(c => [c.id, c]));
    await this.loadStudents();
    this.timetable = await DB.all('timetable');
  },
  async loadStudents() {
    this.students = (await DB.all('students')).filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    this.stu = Object.fromEntries((await DB.all('students')).map(s => [s.id, s]));
  },
  async set(key, value) { this.S[key] = value; await DB.setSetting(key, value); },
  className: id => id === 'wait' ? 'انتظار' : (App.cls[id]?.name || '—'),
  classStudents(cid) { return this.students.filter(s => s.classId === cid); },

  /* ===== التنقل ===== */
  go(screen, params = {}, replace = false) {
    if (replace) this.stack.pop();
    this.stack.push({ screen, params });
    this.render();
  },
  back() {
    const open = this._sheets.filter(w => document.body.contains(w));
    if (open.length) { open[open.length - 1]._close(null); return true; }
    if (this.locked) return true;
    if (this.stack.length > 1) { this.stack.pop(); this.render(); return true; }
    if (this.stack[0]?.screen !== 'home') { this.stack = []; this.go('home'); return true; }
    return false;
  },
  async render() {
    const cur = this.stack[this.stack.length - 1];
    const fn = Screens[cur.screen];
    const view = $('#view');
    view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === (NAV_ROOT[cur.screen] || cur.screen)));
    document.body.dataset.screen = cur.screen;
    try { await fn(view, cur.params); } catch (e) { console.error(e); view.innerHTML = `<div class="empty">${ic('alert')}<h3>حدث خطأ</h3><p>${esc(e.message)}</p></div>`; }
    window.scrollTo(0, 0);
  },
  renderNav() {
    $('#nav').innerHTML = NAV.map(n => `<button class="nav-item ${n.center ? 'center' : ''}" data-nav="${n.id}">
      <span class="nav-ic">${ic(n.icon)}</span><span class="nav-lb">${n.label}</span></button>`).join('');
    $$('#nav .nav-item').forEach(b => b.onclick = () => {
      if (b.dataset.nav === 'session') return this.openCurrentSession();
      this.stack = []; this.go(b.dataset.nav);
    });
  },
  openCurrentSession() {
    const live = Sched.live();
    this.stack = this.stack.slice(0, 1).length ? [this.stack[0]] : [];
    if (!this.stack.length || this.stack[0].screen !== 'home') this.stack = [{ screen: 'home', params: {} }];
    if (live?.entry) return this.go('session', { classId: live.entry.classId, period: live.entry.period, date: ymd() });
    this.go('session', {});
  },

  /* ===== دورة الحياة ===== */
  onVisibility() {
    if (document.hidden) { this._hiddenAt = Date.now(); return; }
    if (this.S.lockEnabled && this._hiddenAt && Date.now() - this._hiddenAt > (this.S.lockAfterMin || 3) * 60000) this.lock();
    this._hiddenAt = 0;
    if (!this.tryAutoOpen() && this.stack[this.stack.length - 1]?.screen === 'home') this.render();
  },
  tryAutoOpen() {
    if (!this.S.autoOpen) return false;
    const live = Sched.live();
    if (!live?.entry) return false;
    const key = `${ymd()}|${live.entry.period}`;
    if (this._autoOpened[key]) return false;
    this._autoOpened[key] = true;
    this.stack = [{ screen: 'home', params: {} }];
    this.go('session', { classId: live.entry.classId, period: live.entry.period, date: ymd(), auto: true });
    return true;
  },
  openFromNotification(classId, period) { // يستدعى من أندرويد عند الضغط على التنبيه
    this.stack = [{ screen: 'home', params: {} }];
    this.go('session', { classId, period: +period, date: ymd() });
  },

  /* ===== المؤقت ومساعد الحصة ===== */
  async tick() {
    const live = Sched.live() || Sched.liveWait();
    $$('[data-countdown]').forEach(el => {
      if (!live) { el.textContent = '--:--'; return; }
      const sec = Math.max(0, Math.round((live.end - nowMin()) * 60));
      el.textContent = `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
    });
    $$('[data-ring]').forEach(el => {
      if (!live) return;
      const p = Math.min(1, Math.max(0, (nowMin() - live.start) / (live.end - live.start)));
      el.style.strokeDashoffset = String(2 * Math.PI * 52 * p);
    });
    if (live?.entry && live.entry.classId !== 'wait') {
      const key = `${ymd()}|${live.entry.period}`;
      const left = live.end - nowMin();
      const mins = this.S.alertMinutes || 5;
      if (left <= mins && left > 0 && !this._alerted[key]) {
        this._alerted[key] = true;
        const done = await Sched.sessionDone(ymd(), live.entry.period, live.entry.classId);
        this.assistantBanner(live, done);
      }
      if (this.stack.length && !this._autoOpened[key] && this.S.autoOpen && left > 1 && (nowMin() - live.start) < 1.5 && !this.locked) this.tryAutoOpen();
    }
  },
  async assistantBanner(live, done) {
    try { navigator.vibrate?.([200, 100, 200]); } catch (e) { }
    const items = [];
    if (!done) items.push('لم تعتمد الحضور بعد');
    const rc = Reach.get(live.entry.classId); if (!rc || rc.date !== ymd()) items.push('لم تسجّل أين وصلت');
    try { const ids = new Set(App.classStudents(live.entry.classId).map(s => s.id)); const n = Care.attention(await Follow.load()).filter(x => ids.has(x.sid) && !x.contacted).length; if (n) items.push(`${n} ${n === 1 ? 'طالب يحتاج' : 'طلاب يحتاجون'} متابعة`); } catch (e) { }
    const today = ymd();
    const hw = (await DB.byIndex('homework', 'date', today)).filter(h => h.period === live.entry.period && h.classId === live.entry.classId).length;
    const pts = (await DB.byIndex('points', 'date', today)).filter(h => h.period === live.entry.period && h.classId === live.entry.classId).length;
    const b = document.createElement('div');
    b.className = 'assistant-banner';
    b.innerHTML = `<div class="ab-ic">${ic('timer')}</div><div class="ab-tx"><b>باقي ${this.S.alertMinutes || 5} دقائق على نهاية حصة ${esc(this.className(live.entry.classId))}</b>
      <small>${items.length ? '⚠️ ' + items.join(' · ') : '✓ الحضور معتمد'} · مشاركات: ${pts} · واجبات مسجلة: ${hw}</small></div>
      <button class="btn sm light" data-open>افتح</button><button class="btn sm light" data-sum>الملخص</button><button class="icon-btn light" data-x>${ic('x')}</button>`;
    document.body.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));
    const close = () => { b.classList.remove('show'); setTimeout(() => b.remove(), 300); };
    b.querySelector('[data-x]').onclick = close;
    b.querySelector('[data-sum]').onclick = () => { close(); classSummary({ classId: live.entry.classId, date: ymd(), period: live.entry.period }); };
    b.querySelector('[data-open]').onclick = () => { close(); this.go('session', { classId: live.entry.classId, period: live.entry.period, date: ymd() }); };
    setTimeout(close, 60000);
  },
  syncNative() {
    if (!Native.has()) return;
    const periods = this.timetable.map(t => {
      const p = this.bell.periods.find(x => x.n === t.period); if (!p) return null;
      return { day: t.day, period: t.period, start: p.start, end: p.end, classId: t.classId, label: t.classId === 'wait' ? 'الانتظار' : `${this.className(t.classId)} — ${t.subject || this.S.subject}` };
    }).filter(Boolean);
    let tasks = []; try { tasks = Tasks.reminders(); } catch (e) { }
    Native.call('syncSchedule', JSON.stringify({ periods, tasks, alertBefore: this.S.alertMinutes || 5, startAlert: !!this.S.startAlert, enabled: this.S.notify !== false }));
  },

  /* ===== القفل ===== */
  bioReady() { return !!this.S.bioUnlock && Native.has() && Native.call('biometricStatus') === 'ok'; },
  onBioResult(ok) { if (this._bioCb) this._bioCb(ok); else if (this._bioSetup) { const f = this._bioSetup; this._bioSetup = null; f(ok); } },
  lock() {
    if (this.locked) return Promise.resolve();
    this.locked = true;
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'lockscreen';
      let pin = '';
      el.innerHTML = `<div class="lock-inner"><h2><img class="lock-brand" src="img/brand-white.png" alt="فصلي"></h2><p>أدخل الرمز السري</p>
        <div class="pin-dots">${'<i></i>'.repeat(4)}</div><div class="pin-err"></div>
        <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => `<button ${k === '' ? 'disabled class="ghost"' : ''} data-k="${k}">${k}</button>`).join('')}</div>
        ${this.bioReady() ? `<button class="bio-btn" data-bio>${ic('face')}<span>الفتح بالوجه أو البصمة</span></button>` : ''}</div>`;
      document.body.appendChild(el);
      const unlock = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); this.locked = false; this._bioCb = null; resolve(); };
      this._bioCb = ok => { if (ok) unlock(); };
      el.querySelector('[data-bio]')?.addEventListener('click', () => Native.call('biometricAuth'));
      if (this.bioReady()) setTimeout(() => Native.call('biometricAuth'), 350);
      const dots = () => $$('.pin-dots i', el).forEach((d, i) => d.classList.toggle('on', i < pin.length));
      $$('.pinpad button', el).forEach(b => b.onclick = async () => {
        const k = b.dataset.k;
        if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
        dots();
        if (pin.length === 4) {
          const salt = await DB.getSetting('pinSalt', '');
          if (await sha256(salt + pin) === await DB.getSetting('pinHash')) {
            unlock();
          } else { $('.pin-err', el).textContent = 'الرمز غير صحيح'; el.querySelector('.pin-dots').classList.add('shake'); setTimeout(() => { pin = ''; dots(); el.querySelector('.pin-dots').classList.remove('shake'); }, 450); }
        }
      });
    });
  }
};

const NAV = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'students', label: 'الطلاب', icon: 'users' },
  { id: 'session', label: 'الحصة', icon: 'checkSq', center: true },
  { id: 'followup', label: 'المتابعة', icon: 'flag' },
  { id: 'reports', label: 'التقارير', icon: 'chart' }
];
const NAV_ROOT = { reset: 'home', photos: 'home', worksheet: 'home', remedial: 'followup', monthly: 'home', platforms: 'home', ask: 'home', seats: 'session', qbank: 'home', attention: 'followup', weekly: 'home', ideas: 'home', quiz: 'session', stars: 'home', curriculum: 'home', covers: 'home', merge: 'home', portfolio: 'home', student: 'students', more: 'home', timetable: 'home', calendar: 'home', settings: 'home', madrasati: 'home', lists: 'home', backup: 'home' };

/* ===== الجدول الدراسي ===== */
const Sched = {
  dayIdx(d = new Date()) { const g = d.getDay(); return g <= 4 ? g : -1; },
  periodTimes(n) { return App.bell.periods.find(p => p.n === n); },
  lessonsOn(d = new Date()) {
    const di = this.dayIdx(d);
    return App.timetable.filter(t => t.day === di && t.classId !== 'wait').sort((a, b) => a.period - b.period)
      .map(t => ({ entry: t, ...this.periodTimes(t.period) })).filter(x => x.start);
  },
  waitsOn(d = new Date()) {
    const di = this.dayIdx(d);
    return App.timetable.filter(t => t.day === di && t.classId === 'wait').sort((a, b) => a.period - b.period)
      .map(t => ({ entry: t, ...this.periodTimes(t.period) })).filter(x => x.start);
  },
  liveWait() {
    const m = nowMin();
    for (const l of this.waitsOn()) { const s = toMin(l.start), e = toMin(l.end); if (m >= s && m < e) return { ...l, start: s, end: e }; }
    return null;
  },
  live() { // الحصة الحالية (إن وجدت)
    const m = nowMin();
    for (const l of this.lessonsOn()) { const s = toMin(l.start), e = toMin(l.end); if (m >= s && m < e) return { ...l, start: s, end: e }; }
    return null;
  },
  bellNow() { // وضع اليوم الدراسي: حصة/فسحة/قبل/بعد
    const m = nowMin(), P = App.bell.periods;
    if (m >= toMin(App.bell.breakStart) && m < toMin(App.bell.breakEnd)) return { kind: 'break', end: toMin(App.bell.breakEnd) };
    for (const p of P) if (m >= toMin(p.start) && m < toMin(p.end)) return { kind: 'period', n: p.n, start: toMin(p.start), end: toMin(p.end) };
    if (m < toMin(P[0].start)) return { kind: 'before' };
    return { kind: 'after' };
  },
  next() {
    const m = nowMin();
    const today = [...this.lessonsOn(), ...this.waitsOn()].sort((a, b) => toMin(a.start) - toMin(b.start)).find(l => toMin(l.start) > m);
    if (today) return { ...today, when: 'today', inMin: toMin(today.start) - m };
    for (let i = 1; i <= 7; i++) {
      const d = addDays(new Date(), i); const ls = [...this.lessonsOn(d), ...this.waitsOn(d)].sort((a, b) => a.entry.period - b.entry.period);
      if (ls.length) return { ...ls[0], when: i === 1 ? 'tomorrow' : dayName(d), date: d };
    }
    return null;
  },
  async sessionDone(date, period, classId) { const s = await DB.get('sessions', `${date}|${period}|${classId}`); return !!s?.complete; }
};

/* ===== الشاشات ===== */
const Screens = {};

Screens.home = async (v) => {
  const S = App.S, now = new Date(), today = ymd();
  const lessons = Sched.lessonsOn();
  const live = Sched.live(), lw = Sched.liveWait(), bn = Sched.bellNow(), nx = Sched.next();
  const [att, hw, notes, pts, sessions] = await Promise.all([
    DB.byIndex('attendance', 'date', today), DB.byIndex('homework', 'date', today), DB.byIndex('notes', 'date', today),
    DB.byIndex('points', 'date', today), DB.byIndex('sessions', 'date', today)]);
  const doneSet = new Set(sessions.filter(s => s.complete).map(s => `${s.period}|${s.classId}`));
  const cnt = k => att.filter(a => a.status === k).length;
  const FD = await Follow.load();
  const pending = await Follow.needsContact(FD);
  const care = Care.attention(FD).filter(x => !x.contacted);
  const openHw = (await DB.all('homework')).filter(h => !h.resolved).length;
  const hour = now.getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const teacherFirst = (S.teacherName || '').replace(/^أ\.\s*/, '').split(' ')[0];

  let nowCard;
  if (live) {
    const done = doneSet.has(`${live.entry.period}|${live.entry.classId}`);
    nowCard = `<div class="now-card live">
      <div class="now-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="r-bg"/><circle cx="60" cy="60" r="52" class="r-fg" data-ring style="stroke-dasharray:${2 * Math.PI * 52}"/></svg>
        <div class="now-ring-tx"><b data-countdown>--:--</b><small>متبقٍ</small></div></div>
      <div class="now-info"><span class="pill live-pill"><i></i> الحصة ${ordinal(live.entry.period)} الآن</span>
        <h2>${esc(App.className(live.entry.classId))}</h2><p>${esc(live.entry.subject || S.subject)}<br>${fmt12(App.bell.periods.find(p => p.n === live.entry.period).start).replace(/ [صم]$/, '')} – ${fmt12(App.bell.periods.find(p => p.n === live.entry.period).end)}</p>
        ${(() => { const l = Curr.lesson(live.entry.classId); return l?.title ? `<p class="now-les">${ic('book')} ${esc(l.title)}</p>` : ''; })()}
        <div class="now-checks"><span class="${done ? 'ok' : 'warn'}">${ic(done ? 'check' : 'alert')} ${done ? 'الحضور معتمد' : 'الحضور غير معتمد'}</span></div>
        <button class="btn light" data-go-live>${ic('door')} افتح الحصة</button></div></div>`;
  } else if (lw) {
    nowCard = `<div class="now-card live wait-card">
      <div class="now-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="r-bg"/><circle cx="60" cy="60" r="52" class="r-fg" data-ring style="stroke-dasharray:${2 * Math.PI * 52}"/></svg>
        <div class="now-ring-tx"><b data-countdown>--:--</b><small>متبقٍ</small></div></div>
      <div class="now-info"><span class="pill live-pill"><i></i> الحصة ${ordinal(lw.entry.period)} الآن</span>
        <h2>حصة انتظار</h2><p>${fmt12(lw.entry && Sched.periodTimes(lw.entry.period).start).replace(/ [صم]$/, '')} – ${fmt12(Sched.periodTimes(lw.entry.period).end)}</p>
        <button class="btn light" data-cover="${lw.entry.period}">${ic('checkSq')} تحضير الفصل</button></div></div>`;
  } else if (bn.kind === 'break' && Sched.dayIdx() >= 0) {
    nowCard = `<div class="now-card calm"><div class="now-big">☕</div><div class="now-info"><span class="pill">الفسحة</span><h2>وقت الفسحة</h2><p>تنتهي ${fmt12(App.bell.breakEnd)}${nx?.when === 'today' ? ` · بعدها ${esc(App.className(nx.entry.classId))} الحصة ${ordinal(nx.entry.period)}` : ''}</p></div></div>`;
  } else if (nx) {
    const when = nx.when === 'today' ? `تبدأ بعد ${fmtDur(nx.inMin)}` : nx.when === 'tomorrow' ? `غدًا ${fmt12(nx.start)}` : `${nx.when} ${fmt12(nx.start)}`;
    nowCard = `<div class="now-card calm"><div class="now-big">${ic('clock')}</div><div class="now-info"><span class="pill">${nx.when === 'today' ? 'الحصة القادمة' : 'أقرب حصة'}</span>
      <h2>${nx.entry.classId === 'wait' ? 'حصة انتظار' : esc(App.className(nx.entry.classId))}</h2><p>الحصة ${ordinal(nx.entry.period)} · ${when}</p>
      ${nx.when === 'today' && nx.entry.classId !== 'wait' ? `<button class="btn light" data-go-next>${ic('door')} تحضير مسبق</button>` : ''}</div></div>`;
  } else {
    nowCard = `<div class="now-card calm"><div class="now-big">${ic('cal')}</div><div class="now-info"><span class="pill">الجدول</span><h2>لم يُدخل جدولك بعد</h2><p>أضف حصصك الـ18 ليعرف فصلي حصتك الحالية تلقائيًا</p><button class="btn light" data-go="timetable">${ic('grid')} إعداد الجدول</button></div></div>`;
  }

  const m = nowMin();
  const di = Sched.dayIdx();
  const extra = [
    ...App.timetable.filter(t => t.day === di && t.classId === 'wait').map(t => { const pt = Sched.periodTimes(t.period); return pt && { kind: 'wait', label: 'انتظار', n: t.period, start: pt.start, end: pt.end }; }).filter(Boolean),
    ...(App.S.duties || []).filter(d => d.day === di).map(d => ({ kind: 'duty', label: d.label.split('—')[0].trim(), n: '', start: d.start, end: d.end }))
  ];
  const items = [...lessons.map(l => ({ kind: 'lesson', l, start: l.start, end: l.end })), ...extra].sort((x, y) => toMin(x.start) - toMin(y.start));
  const timeline = items.length ? items.map(it => {
    const s = toMin(it.start), e = toMin(it.end);
    const st = m >= e ? 'past' : m >= s ? 'now' : 'next';
    if (it.kind !== 'lesson') return `<div class="tl-item ${st} tl-${it.kind}"><span class="tl-p">${it.kind === 'duty' ? ic('bell') : it.n}</span><span class="tl-tx"><b>${esc(it.label)}</b><small>${fmt12(it.start)}</small></span></div>`;
    const l = it.l; const done = doneSet.has(`${l.entry.period}|${l.entry.classId}`);
    return `<button class="tl-item ${st}" data-ses="${l.entry.classId}|${l.entry.period}"><span class="tl-p">${l.entry.period}</span>
      <span class="tl-tx"><b>${esc(App.className(l.entry.classId))}</b><small>${fmt12(l.start)}</small></span>${done ? `<span class="tl-ok">${ic('check')}</span>` : ''}</button>`;
  }).join('') : `<div class="muted pad">${di < 0 ? 'إجازة نهاية الأسبوع 🌿' : 'لا توجد حصص لك اليوم'}</div>`;

  v.innerHTML = `
  <header class="hero">
    <div class="hero-top"><div class="brand"><img class="brand-wm" src="img/brand-white.png" alt="فصلي"></div>
      <div class="row"><button class="icon-btn light priv-btn ${S.privacy ? 'on' : ''}" data-priv aria-label="وضع الخصوصية">${ic(S.privacy ? 'lock' : 'eye')}</button><button class="icon-btn light" data-go="ask" aria-label="اسأل فصلي">${ic('search')}</button><button class="icon-btn light" data-go="calendar" aria-label="التقويم">${ic('cal')}</button><button class="icon-btn light" data-go="more" aria-label="المزيد">${ic('grid')}</button></div></div>
    <div class="hero-greet"><h1>${greet}، ${esc(teacherFirst ? 'أ. ' + teacherFirst : '')}</h1>
      <p>${dayName(now)} · ${hijri(now)} · ${greg(now)}</p></div>
  </header>
  <div class="page home">
    ${nowCard}
    <section class="card"><div class="card-h"><h3>${ic('clock')} حصص اليوم</h3><span class="muted">${lessons.length} حصص${Sched.waitsOn().length ? ` + ${Sched.waitsOn().length} انتظار` : ''}</span></div><div class="timeline">${timeline}</div></section>
    <section><div class="sec-h"><h3>ملخص اليوم</h3></div>
      <div class="stats">
        ${stat('الحصص', lessons.length + Sched.waitsOn().length, 'clock', 'c1')}${stat('الغياب', cnt('absent'), 'x', 'c2')}${stat('المتأخرون', cnt('late'), 'timer', 'c3')}
        ${stat('الهاربون', cnt('escaped'), 'run', 'c6')}${stat('تقصير الواجبات', hw.length, 'book', 'c4')}${stat('الملاحظات', notes.length, 'note', 'c5')}
      </div></section>
    ${Merge.host() ? `<button class="merge-card" data-go="merge">${ic('merge')}<div><b>اليوم خميس الدمج: الصفوف في فصل ${SECTIONS[Merge.host()]}</b><small>عند فتح الحصة يظهر لك كل طلاب الصف</small></div>${ic('chev')}</button>` : ''}
    ${todayCenter({ FD, pending, care, lessons, today, pts })}
    <section><div class="sec-h"><h3>اختصارات</h3></div>
      <div class="shortcuts">
        ${sc('session', 'checkSq', 'الحضور', 'g1')}${sc('students', 'users', 'الطلاب', 'g2')}${sc('followup', 'flag', 'المتابعة', 'g3')}${sc('reports', 'chart', 'التقارير', 'g4')}
        ${sc('stars', 'trophy', 'نجوم الأسبوع', 'g6')}${sc('curriculum', 'route', 'توزيع المنهج', 'g5')}${sc('portfolio', 'folder', 'شواهد الأداء', 'g7')}${sc('timetable', 'grid', 'جدولي', 'g8')}
        ${sc('weekly', 'send', 'رسالة الأسبوع', 'g9')}${sc('attention', 'pulse', 'يحتاجون متابعة', 'g10')}${sc('qbank', 'bank', 'بنك الأسئلة', 'g11')}${sc('platforms', 'sync', 'المزامنة', 'g12')}
        ${sc('monthly', 'cal', 'التقرير الشهري', 'g3')}${sc('remedial', 'aid', 'الخطة العلاجية', 'g10')}${sc('worksheet', 'sheet', 'ورقة عمل', 'g5')}${sc('photos', 'camera', 'صور الشواهد', 'g7')}
      </div></section>
    <p class="foot-sign">تصميم وبرمجة: أ. عبدالله ال عواد</p>
  </div>
  <button class="ideas-fab" data-go="ideas" aria-label="أفكار التطبيق">${ic('bulb')}${(S.appIdeas || []).filter(x => !x.done).length ? `<i>${(S.appIdeas || []).filter(x => !x.done).length}</i>` : ''}<span>أفكاري</span></button>`;
  bindGo(v);
  v.querySelector('[data-priv]')?.addEventListener('click', () => Look.togglePrivacy());
  $$('[data-tc]', v).forEach(b => b.onclick = () => { const [s, x] = b.dataset.tc.split('|'); App.go(s, s === 'ask' ? { q: x } : x ? { tab: x } : {}); });
  v.querySelector('[data-go-live]')?.addEventListener('click', () => App.go('session', { classId: live.entry.classId, period: live.entry.period, date: today }));
  v.querySelector('[data-go-next]')?.addEventListener('click', () => App.go('session', { classId: nx.entry.classId, period: nx.entry.period, date: today }));
  v.querySelector('[data-cover]')?.addEventListener('click', e => App.go('session', { cover: true, period: +e.currentTarget.dataset.cover }));
  $$('[data-ses]', v).forEach(b => b.onclick = () => { const [c, p] = b.dataset.ses.split('|'); App.go('session', { classId: c, period: +p, date: today }); });
  const nowIt = v.querySelector('.tl-item.now') || v.querySelector('.tl-item.next');
  if (nowIt) nowIt.parentElement.scrollLeft = nowIt.offsetLeft - nowIt.parentElement.clientWidth + nowIt.offsetWidth + 8;
  App.tick();
};

/* ===== مركز «اليوم»: سكرتيرك الصغير كل صباح ===== */
function todayCenter({ FD, pending, care, lessons, today, pts }) {
  const yest = ymd(addDays(new Date(), -1)), since = ymd(addDays(new Date(), -30));
  const act = x => App.stu[x.studentId] && App.stu[x.studentId].active !== false;
  const old = [...FD.hw, ...FD.notes].filter(x => act(x) && x.date < today && caseSt(x) === 'open');
  const fromY = old.filter(x => x.date === yest).length;
  const follow = [...FD.hw, ...FD.notes].filter(x => act(x) && caseSt(x) === 'follow').length;
  const abs = {}; FD.att.filter(a => a.date >= since && a.status === 'absent' && act(a)).forEach(a => abs[a.studentId] = (abs[a.studentId] || 0) + 1);
  const topAbs = Object.entries(abs).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const nm = sid => esc(shortName(App.stu[sid]?.name || ''));
  const L = [];
  if (lessons.length) L.push(['clock', `${lessons.length} حصص اليوم`, `أولها ${esc(App.className(lessons[0].entry.classId))} ${fmt12(lessons[0].start)}${pts.length ? ` · ${pts.length} مشاركة حتى الآن` : ''}`, 'timetable', '']);
  const tt = Tasks.on(today).filter(t => !t.done), tl = Tasks.open().filter(t => t.date < today);
  if (tt.length || tl.length) L.push(['checkSq', `${tt.length ? `${tt.length} ${tt.length === 1 ? 'مهمة' : 'مهام'} اليوم` : ''}${tt.length && tl.length ? ' · ' : ''}${tl.length ? `${tl.length} متأخرة` : ''}`, esc([...tt, ...tl].slice(0, 3).map(t => t.title).join('، ')), 'calendar', tl.length ? 'warn' : '']);
  if (pending.length) L.push(['flag', `${pending.length} ${pending.length <= 10 && pending.length > 2 ? 'حالات تحتاج' : pending.length === 1 ? 'حالة تحتاج' : pending.length === 2 ? 'حالتان تحتاجان' : 'حالة تحتاج'} تواصلًا`, 'ملاحظات مهمة، تكرار الواجبات، الغياب أو الهروب', 'followup', 'bad']);
  if (care.length) L.push(['pulse', `${care.length} ${care.length === 1 ? 'طالب يحتاج' : care.length === 2 ? 'طالبان يحتاجان' : 'طلاب يحتاجون'} متابعة هذا الأسبوع`, care.slice(0, 3).map(x => nm(x.sid)).join('، ') + (care.length > 3 ? '...' : ''), 'attention', 'warn']);
  if (old.length) L.push(['history', `${old.length} حالات مفتوحة من أيام سابقة`, `${fromY ? `منها ${fromY} من أمس · ` : ''}${follow ? `${follow} تحت المتابعة` : 'لم يُتخذ فيها إجراء'}`, 'followup|hw', 'warn']);
  if (topAbs.length) L.push(['x', 'الأكثر غيابًا (30 يومًا)', topAbs.map(([s, n]) => `${nm(s)} (${n})`).join('، '), 'ask|الأكثر غيابا هذا الشهر', '']);
  if (App.students.length && Cloud.shareDue()) L.push(['cloud', 'ارفع نسخة الأسبوع إلى Google Drive', App.S.lastCloudShare ? `آخر رفع: ${shortDate(App.S.lastCloudShare.slice(0, 10))}` : 'احمِ بياناتك من ضياع الجهاز — ضغطة واحدة', 'backup', '']);
  if (!L.length) return '';
  return `<section class="card today-c"><div class="card-h"><h3>${ic('sparkle')} مركز اليوم</h3><button class="btn xs soft" data-go="ask">${ic('search')} اسأل فصلي</button></div>
    ${L.map(([i, t, s, go, c]) => `<button class="tc-row ${c}" data-tc="${go}"><span>${ic(i)}</span><div><b>${t}</b><small>${s}</small></div>${ic('chev')}</button>`).join('')}</section>`;
}

function stat(label, val, icon, c) { return `<div class="stat ${c}"><span class="stat-ic">${ic(icon)}</span><b>${val}</b><small>${label}</small></div>`; }
function sc(go, icon, label, c) { return `<button class="shortcut ${c}" data-go="${go}"><span>${ic(icon)}</span><b>${label}</b></button>`; }
function bindGo(root) { $$('[data-go]', root).forEach(b => b.onclick = () => { if (b.dataset.go === 'session') return App.openCurrentSession(); App.go(b.dataset.go); }); }
const ORD = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];
const ordinal = n => ORD[n] || n;
const fmtDur = m => { m = Math.round(m); if (m < 60) return `${m} دقيقة`; const h = Math.floor(m / 60), r = m % 60; return `${h} ساعة${r ? ` و${r} د` : ''}`; };
function topbar(title, { back = true, actions = '' } = {}) {
  return `<header class="topbar">${back ? `<button class="icon-btn" data-back aria-label="رجوع">${ic('back')}</button>` : '<span></span>'}<h1>${title}</h1><div class="row">${actions}</div></header>`;
}
function bindBack(v) { $$('[data-back]', v).forEach(b => b.onclick = () => App.back()); }

/* شاشة "المزيد" */
Screens.more = async (v) => {
  v.innerHTML = topbar('المزيد') + `<div class="page"><div class="menu-list">
    ${menuItem('platforms', 'sync', 'المزامنة مع مدرستي ونور', 'سحب الطلاب والواجبات والدرجات وتعبئة الغياب')}
    ${menuItem('ask', 'search', 'اسأل فصلي', 'بحث ذكي: «الهاربين هذا الأسبوع»، «أكثر طلاب السادس تأخرًا»')}
    ${menuItem('weekly', 'send', 'رسالة الأسبوع لأولياء الأمور', 'ملخص أداء كل طالب في رسالة واتساب جاهزة')}
    ${menuItem('portal', 'users', 'بوابة الطالب', 'حساب لكل طالب وبطاقات دخول لأولياء الأمور')}
    ${menuItem('monthly', 'cal', 'التقرير الشهري', 'تقرير مصوّر أنيق لكل طالب يُرسل لولي الأمر')}
    ${menuItem('remedial', 'aid', 'الخطة العلاجية', 'رصد المتعثرين وخطط دعم فردية بنتائجها')}
    ${menuItem('worksheet', 'sheet', 'ورقة عمل واختبار قصير', 'من بنك الأسئلة بنماذج مختلفة لكل فصل ونموذج إجابة')}
    ${menuItem('photos', 'camera', 'صور الشواهد', 'صوّر أنشطتك فتُضاف لملف الإنجاز تلقائيًا')}
    ${menuItem('attention', 'pulse', 'يحتاجون متابعة', 'تنبيه مبكر بمن بدأ يتراجع هذا الأسبوع')}
    ${menuItem('qbank', 'bank', 'بنك الأسئلة', 'أسئلة كل درس للمسابقة والعرض على الشاشة')}
    ${menuItem('stars', 'trophy', 'نجوم الأسبوع والشهادات', 'أفضل 3 في كل فصل وشهادات تميّز جاهزة')}
    ${menuItem('curriculum', 'route', 'توزيع المنهج', 'درس كل أسبوع وتقدّمك في الخطة')}
    ${menuItem('portfolio', 'folder', 'شواهد الأداء الوظيفي', 'العناصر الـ11 لملف الإنجاز تلقائيًا')}
    ${menuItem('covers', 'clock', 'سجل حصص الانتظار', 'كل الفصول التي غطّيتها')}
    ${menuItem('merge', 'merge', 'ترتيب الخميس', 'دمج الفصول بالتناوب')}
    ${menuItem('ideas', 'bulb', 'أفكار التطبيق', 'ملاحظاتك لتطوير فصلي — أرسلها دفعة واحدة')}
    ${menuItem('timetable', 'grid', 'جدولي الدراسي', 'الحصص الـ18 وأوقات الجرس والفسحة')}
    ${menuItem('calendar', 'cal', 'التقويم', 'هجري وميلادي مع سجل كل يوم')}
    ${menuItem('lists', 'list', 'القوائم', 'السلوك الإيجابي والسلبي وأنواع التقصير')}
    ${menuItem('backup', 'shield', 'النسخ الاحتياطي', 'حفظ واستعادة بياناتك')}
    ${menuItem('reset', 'trash', 'تصفير البيانات', 'مسح كامل أو جزئي: سجلات، فصول، فترة — بنسخة احتياطية تلقائية')}
    ${menuItem('settings', 'settings', 'الإعدادات', 'بياناتك، القفل، التنبيهات')}
  </div><div class="about"><img class="about-brand" src="img/brand-navy.png" alt="فصلي"><small>إدارة صفك بسهولة · الإصدار ${Native.call('appVersion') || '1.0'}</small><small>تصميم وبرمجة: أ. عبدالله ال عواد</small></div></div>`;
  bindBack(v); bindGo(v);
};
const menuItem = (go, icon, t, s) => `<button class="menu-item" data-go="${go}"><span class="mi-ic">${ic(icon)}</span><span class="mi-tx"><b>${t}</b><small>${s}</small></span>${ic('chev', 'mi-ch')}</button>`;

/* ===== أفكار التطبيق: ملاحظات المعلم لتطوير فصلي ===== */
const IDEA_KINDS = [['add', 'إضافة ميزة', '✨'], ['edit', 'تعديل', '🛠️'], ['look', 'الشكل والتصميم', '🎨'], ['bug', 'مشكلة', '⚠️']];
Screens.ideas = async (v, p) => {
  const ideas = App.S.appIdeas || [];
  const open = ideas.filter(x => !x.done), done = ideas.filter(x => x.done);
  const kindOf = k => IDEA_KINDS.find(x => x[0] === k) || IDEA_KINDS[0];
  const card = x => `<div class="idea ${x.done ? 'done' : ''} k-${x.kind}" data-id="${x.id}">
      <span class="idea-k">${kindOf(x.kind)[2]}</span>
      <div class="grow"><b>${esc(x.text)}</b><small>${kindOf(x.kind)[1]} · ${shortDate(x.date)}${x.screen ? ' · ' + esc(x.screen) : ''}</small></div>
      <button class="icon-btn sm" data-toggle="${x.id}" aria-label="تم">${ic(x.done ? 'history' : 'check')}</button>
      <button class="icon-btn sm" data-del="${x.id}" aria-label="حذف">${ic('trash')}</button></div>`;
  v.innerHTML = topbar('أفكار التطبيق') + `<div class="page">
    <div class="ideas-hero"><span class="ih-ic">${ic('bulb')}</span><div><b>دفتر أفكارك لتطوير فصلي</b><small>سجّل أي فكرة أو ملاحظة أثناء الحصة، ثم أرسلها كلها دفعة واحدة لتُضاف في التحديث القادم.</small></div></div>
    <section class="card idea-form">
      <div class="chips" data-chips="kind">${IDEA_KINDS.map(([k, l, e], i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-v="${k}">${e} ${l}</button>`).join('')}</div>
      <label class="fld"><span>في أي شاشة؟ (اختياري)</span><select name="screen"><option value="">—</option>${['الرئيسية', 'الحصة والحضور', 'المشاركة', 'الواجبات', 'الطلاب', 'ملف الطالب', 'المتابعة', 'التقارير', 'الجدول', 'التقويم', 'الرسائل', 'الإعدادات'].map(s => `<option>${s}</option>`).join('')}</select></label>
      <label class="fld"><span>الفكرة أو الملاحظة</span><div class="voice-fld"><textarea name="text" rows="3" placeholder="مثال: أريد زرًا لتصدير كشف الغياب الأسبوعي مباشرة"></textarea>${micBtn('[name=text]')}</div></label>
      <button class="btn gold block" data-add>${ic('plus')} حفظ الفكرة</button>
    </section>
    ${open.length ? `<div class="sec-h"><h3>أفكار لم تُرسل بعد (${open.length})</h3></div><div class="idea-list">${open.map(card).join('')}</div>
      <div class="row gap"><button class="btn wa grow" data-send>${ic('wa')} إرسال الكل</button><button class="btn soft grow" data-copy>نسخ القائمة</button></div>` :
      `<div class="empty sm">لا توجد أفكار جديدة — أي ملاحظة تخطر لك سجّلها هنا</div>`}
    ${done.length ? `<div class="sec-h"><h3 class="muted">أُرسلت أو نُفّذت (${done.length})</h3></div><div class="idea-list">${done.map(card).join('')}</div>` : ''}
  </div>`;
  bindBack(v); bindChips(v); bindMic(v);
  const save = async arr => { await App.set('appIdeas', arr); App.render(); };
  v.querySelector('[data-add]').onclick = async () => {
    const text = v.querySelector('[name=text]').value.trim();
    if (!text) return toast('اكتب الفكرة أولًا', 'bad');
    await save([...ideas, { id: uid(), kind: chipVal(v, 'kind') || 'add', screen: v.querySelector('[name=screen]').value, text, date: ymd(), done: false }]);
    toast('💡 حُفظت الفكرة', 'ok');
  };
  $$('[data-toggle]', v).forEach(b => b.onclick = () => save(ideas.map(x => x.id === b.dataset.toggle ? { ...x, done: !x.done } : x)));
  $$('[data-del]', v).forEach(b => b.onclick = async () => { if (await confirmBox('حذف هذه الفكرة؟', { ok: 'حذف', danger: true })) save(ideas.filter(x => x.id !== b.dataset.del)); });
  const listText = () => `أفكار تطوير تطبيق فصلي (${open.length}):\n\n` + open.map((x, i) => `${i + 1}. [${kindOf(x.kind)[1]}${x.screen ? ' — ' + x.screen : ''}] ${x.text}`).join('\n');
  v.querySelector('[data-copy]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(listText()); toast('نُسخت القائمة — الصقها في محادثة Claude', 'ok'); } catch (e) { toast('تعذر النسخ', 'bad'); } });
  v.querySelector('[data-send]')?.addEventListener('click', async () => {
    Native.open(`https://wa.me/?text=${encodeURIComponent(listText())}`);
    if (await confirmBox('هل أرسلت الأفكار؟ سأنقلها إلى قائمة «أُرسلت».', { ok: 'نعم، أُرسلت' })) save(ideas.map(x => x.done ? x : { ...x, done: true }));
  });
};

window.addEventListener('DOMContentLoaded', () => App.start());
