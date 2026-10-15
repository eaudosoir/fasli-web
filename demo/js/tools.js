/* فصلي — أدوات الحصة: مسابقة الحصة، عجلة الأسماء، مؤقت النشاط، تقسيم المجموعات */
'use strict';

/* سجل استخدام الأدوات (يستفاد منه في شواهد الأداء) */
async function logUse(k) {
  const log = (App.S.usageLog || []).slice(-1500);
  log.push({ k, d: ymd() });
  await App.set('usageLog', log);
}

/* الطلاب الحاضرون في الحصة (يستبعد الغائب والهارب والمستأذن) */
async function presentStudents(classId, date, period) {
  const studs = Merge.active(date) && App.cls[classId] ? App.students.filter(s => App.cls[s.classId]?.grade === App.cls[classId].grade) : App.classStudents(classId);
  const ids = new Set(studs.map(s => s.id));
  const att = (await DB.byIndex('attendance', 'date', date)).filter(a => a.period === period && ids.has(a.studentId));
  const out = new Set(att.filter(a => ['absent', 'escaped', 'excused'].includes(a.status)).map(a => a.studentId));
  return studs.filter(s => !out.has(s.id));
}

/* نافذة كاملة الشاشة */
function overlay(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'overlay ' + cls;
  el.innerHTML = `<button class="ov-x" data-ovx aria-label="إغلاق">${ic('x')}</button>${html}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const close = () => { el.classList.remove('open'); setTimeout(() => el.remove(), 250); App._sheets = App._sheets.filter(w => w !== el); };
  el._close = close;
  App._sheets.push(el);
  el.querySelector('[data-ovx]').onclick = close;
  return el;
}

/* ===== 1) مسابقة الحصة ===== */
Screens.quiz = async (v, p) => {
  const classId = p.classId, date = p.date || ymd(), period = p.period || 0;
  const rot = { ...(App.S.quizRot || {}) };
  const key = Merge.active(date) ? `grade${App.cls[classId].grade}` : classId;
  const st = rot[key] || { answered: [], round: 1, picks: [], pickDate: '' };
  const all = Merge.active(date) ? App.students.filter(s => App.cls[s.classId]?.grade === App.cls[classId].grade) : App.classStudents(classId);
  const present = await presentStudents(classId, date, period);
  let pool = present.filter(s => !st.answered.includes(s.id));
  const save = async () => { rot[key] = st; await App.set('quizRot', rot); };
  if (!all.length) { v.innerHTML = topbar('مسابقة الحصة') + `<div class="page"><div class="empty">${ic('users')}<h3>لا يوجد طلاب</h3></div></div>`; bindBack(v); return; }
  if (!pool.length && all.every(s => st.answered.includes(s.id))) { st.answered = []; st.round++; st.picks = []; await save(); pool = present; toast(`🎉 أجاب كل طلاب الفصل — بدأت الجولة ${st.round}`, 'ok'); }
  const pick = () => { const a = [...pool].sort(() => Math.random() - 0.5).slice(0, 10); st.picks = a.map(s => ({ id: s.id, r: '' })); st.pickDate = `${date}|${period}`; };
  if (st.pickDate !== `${date}|${period}` || !st.picks?.length) { pick(); await save(); }
  const answeredN = all.filter(s => st.answered.includes(s.id)).length;
  const QS = QB.forClass(classId, p.week); const qOf = i => QS.items[((st.qOff || 0) + i) % QS.items.length];
  const plan = App.cls[classId] ? Curr.plan(App.cls[classId].grade) : [];
  v.innerHTML = topbar('مسابقة الحصة') + `<div class="page">
    <div class="quiz-head"><div><h2>${esc(Merge.active(date) ? 'الصف ' + GRADES[App.cls[classId].grade] + ' (مدموج)' : App.className(classId))}</h2><p>الجولة ${st.round} · أجاب ${answeredN} من ${all.length} طالب</p></div>
      <div class="q-prog"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" class="qp-bg"/><circle cx="21" cy="21" r="17" class="qp-fg" style="stroke-dasharray:${(answeredN / all.length) * 106.8} 106.8"/></svg><b>${Math.round(answeredN / all.length * 100)}%</b></div></div>
    <div class="q-src">${ic('bank')}<div class="grow"><small>أسئلة ${QS.general ? 'عامة (لا أسئلة لهذا الدرس بعد)' : 'درس'}</small><b>${esc(QS.general ? 'عن الوطن' : plan[QS.week - 1] || 'الأسبوع ' + QS.week)}</b></div>
      ${plan.length ? `<select data-qweek>${plan.map((t, i) => `<option value="${i + 1}" ${i + 1 === QS.week ? 'selected' : ''}>أ${i + 1}</option>`).join('')}</select>` : ''}<button class="btn xs soft" data-go="qbank">البنك</button></div>
    <p class="hint">${ic('info')} 10 أسئلة، لكل سؤال طالب. المس السؤال لإظهار الإجابة، أو ${ic('screen')} لعرضه كبيرًا على الشاشة. من يجيب صحيحًا يُسجَّل «مشارك» ولا يُختار مرة أخرى حتى يجيب كل الفصل.</p>
    <div class="q-list">${st.picks.map((x, i) => { const s = App.stu[x.id]; if (!s) return ''; return `<div class="q-item ${x.r}" data-i="${i}">
      <span class="q-n">س${i + 1}</span><span class="grow"><b>${esc(s.name)}</b>${Merge.active(date) ? `<small>${esc(App.className(s.classId))}</small>` : ''}
        <span class="q-q" data-qa="${i}">${esc(qOf(i)[0])}<em hidden>${ic('check')} ${esc(qOf(i)[1])}</em></span></span>
      <button class="q-btn sw" data-qshow="${i}" aria-label="عرض السؤال">${ic('screen')}</button>
      ${x.r ? `<span class="q-r">${x.r === 'ok' ? '✓ أجاب' : '✗ لم يُجب'}</span><button class="icon-btn sm" data-undo="${i}" aria-label="تراجع">${ic('history')}</button>` :
        `<button class="q-btn ok" data-ok="${i}" aria-label="أجاب">${ic('check')}</button><button class="q-btn no" data-no="${i}" aria-label="لم يُجب">${ic('x')}</button><button class="q-btn sw" data-sw="${i}" aria-label="تبديل">${ic('sync')}</button>`}
    </div>`; }).join('')}</div>
    <div class="row gap"><button class="btn soft grow" data-new>${ic('sync')} اختيار 10 جدد</button><button class="btn ghost" data-reset>بدء جولة جديدة</button></div>
    <p class="muted small center">المتبقي في القائمة: ${pool.length} طالب حاضر لم يُجب بعد</p></div>`;
  bindBack(v);
  const re = () => App.render();
  $$('[data-ok]', v).forEach(b => b.onclick = async () => {
    const x = st.picks[+b.dataset.ok]; x.r = 'ok';
    if (!st.answered.includes(x.id)) st.answered.push(x.id);
    await DB.put('points', { id: uid(), studentId: x.id, classId: App.stu[x.id].classId, date, period, type: 'participation', reason: 'إجابة في مسابقة الحصة', value: 1, quiz: true, at: new Date().toISOString() });
    await save(); if (navigator.vibrate) navigator.vibrate(20); re();
  });
  $$('[data-no]', v).forEach(b => b.onclick = async () => { st.picks[+b.dataset.no].r = 'no'; await save(); re(); });
  $$('[data-sw]', v).forEach(b => b.onclick = async () => {
    const used = new Set(st.picks.map(x => x.id)); const alt = pool.filter(s => !used.has(s.id));
    if (!alt.length) return toast('لا يوجد طالب آخر في القائمة');
    st.picks[+b.dataset.sw] = { id: alt[Math.floor(Math.random() * alt.length)].id, r: '' }; await save(); re();
  });
  $$('[data-undo]', v).forEach(b => b.onclick = async () => {
    const x = st.picks[+b.dataset.undo];
    if (x.r === 'ok') { st.answered = st.answered.filter(id => id !== x.id); const pts = (await DB.byIndex('points', 'date', date)).filter(q => q.studentId === x.id && q.quiz && q.period === period); if (pts[0]) await DB.del('points', pts[0].id); }
    x.r = ''; await save(); re();
  });
  v.querySelector('[data-new]').onclick = async () => { pick(); st.qOff = ((st.qOff || 0) + 10) % QS.items.length; await save(); await logUse('quiz'); re(); };
  bindGo(v);
  $$('[data-qa]', v).forEach(b => b.onclick = () => { const e = b.querySelector('em'); e.hidden = !e.hidden; });
  $$('[data-qshow]', v).forEach(b => b.onclick = () => questionOverlay(classId, (st.qOff || 0) + +b.dataset.qshow, QS.week));
  v.querySelector('[data-qweek]')?.addEventListener('change', e => { App.stack[App.stack.length - 1].params = { ...p, week: +e.target.value }; st.qOff = 0; save().then(re); });
  v.querySelector('[data-reset]').onclick = async () => { if (await confirmBox('بدء جولة جديدة؟ يعود كل طلاب الفصل إلى قائمة الاختيار.')) { st.answered = []; st.round++; pick(); await save(); re(); } };
  if (!p._logged) { p._logged = true; logUse('quiz'); }
};

/* ===== 2) عجلة الأسماء ===== */
async function wheelTool(ctx) {
  const studs = await presentStudents(ctx.classId, ctx.date, ctx.period);
  if (studs.length < 2) return toast('يلزم طالبان حاضران على الأقل', 'bad');
  logUse('wheel');
  const el = overlay(`<div class="wheel-wrap"><h2>عجلة الأسماء</h2><p class="muted">${esc(App.className(ctx.classId))} · ${studs.length} طالب حاضر</p>
    <div class="wheel-box"><canvas width="720" height="720"></canvas><div class="wheel-pin"></div><button class="wheel-go" data-spin>أدِر</button></div>
    <div class="wheel-res" hidden><b></b><div class="row gap"><button class="btn primary" data-pt>${ic('star')} مشاركة +1</button><button class="btn ghost" data-rm>استبعده وأدِر</button></div></div></div>`, 'dark');
  const cv = el.querySelector('canvas'), cx = cv.getContext('2d');
  let list = [...studs], angle = 0, spinning = false, chosen = null;
  const colors = ['#16316E', '#D9A33A', '#2B4A93', '#B0801C', '#0F2756', '#E7C46A', '#3C78C9', '#8C6416'];
  const draw = () => {
    const n = list.length, R = 350, seg = 2 * Math.PI / n;
    cx.clearRect(0, 0, 720, 720); cx.save(); cx.translate(360, 360); cx.rotate(angle);
    list.forEach((s, i) => {
      cx.beginPath(); cx.moveTo(0, 0); cx.arc(0, 0, R, i * seg, (i + 1) * seg); cx.closePath();
      cx.fillStyle = colors[i % colors.length]; cx.fill(); cx.strokeStyle = 'rgba(255,255,255,.5)'; cx.lineWidth = 2; cx.stroke();
      if (n > 36) return;
      cx.save(); cx.rotate(i * seg + seg / 2); cx.textAlign = 'right'; cx.fillStyle = [1, 5].includes(i % colors.length) ? '#0B1F4D' : '#fff';
      cx.font = `700 ${n > 24 ? 20 : n > 16 ? 24 : 28}px FasliNaskh, 'Noto Naskh Arabic', serif`; cx.direction = 'rtl';
      cx.fillText(shortName(s.name), R - 24, 9); cx.restore();
    });
    cx.restore(); cx.beginPath(); cx.arc(360, 360, 54, 0, 2 * Math.PI); cx.fillStyle = '#fff'; cx.fill();
    if (n > 36) { cx.fillStyle = 'rgba(255,255,255,.9)'; cx.font = "700 26px FasliNaskh, serif"; cx.textAlign = 'center'; cx.fillText(`${n} طالب`, 360, 450); }
  };
  draw();
  const spin = () => {
    if (spinning || list.length < 2) return; spinning = true; el.querySelector('.wheel-res').hidden = true;
    const start = angle, total = 8 * Math.PI + Math.random() * 2 * Math.PI, dur = 4200, t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      angle = start + total * e; draw();
      if (k < 1) return requestAnimationFrame(step);
      spinning = false;
      const n = list.length, seg = 2 * Math.PI / n;
      const a = ((-Math.PI / 2 - angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      chosen = list[Math.floor(a / seg) % n];
      const r = el.querySelector('.wheel-res'); r.hidden = false; r.querySelector('b').textContent = chosen.name;
      if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
    };
    requestAnimationFrame(step);
  };
  el.querySelector('[data-spin]').onclick = spin;
  el.querySelector('[data-pt]').onclick = async () => { if (!chosen) return; await addPoint({ studentId: chosen.id, classId: chosen.classId, date: ctx.date, period: ctx.period, type: 'participation', reason: 'مشاركة (عجلة الأسماء)' }, `★ نقطة مشاركة لـ ${esc(shortName(chosen.name))}`); };
  el.querySelector('[data-rm]').onclick = () => { if (!chosen) return; list = list.filter(s => s !== chosen); chosen = null; draw(); spin(); };
}

/* ===== 3) مؤقت النشاط ===== */
function timerTool() {
  logUse('timer');
  const el = overlay(`<div class="tm-wrap"><h2>مؤقت النشاط</h2>
    <div class="tm-ring"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="96" class="tr-bg"/><circle cx="110" cy="110" r="96" class="tr-fg"/></svg><b class="tm-t">05:00</b></div>
    <div class="tm-pre">${[1, 2, 3, 5, 10, 15].map(m => `<button data-m="${m}" class="${m === 5 ? 'on' : ''}">${m} د</button>`).join('')}</div>
    <div class="row gap center-row"><button class="btn primary lg" data-go>${ic('timer')} ابدأ</button><button class="btn ghost lg" data-rs>إعادة</button></div></div>`, 'dark');
  let total = 300, left = 300, run = false, last = 0, raf;
  const fg = el.querySelector('.tr-fg'), C = 2 * Math.PI * 96;
  fg.style.strokeDasharray = C;
  const paint = () => { const s = Math.ceil(left); el.querySelector('.tm-t').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; fg.style.strokeDashoffset = C * (1 - left / total); el.classList.toggle('ending', run && left <= 10); };
  const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, .35, .7].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.4, a.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t + .3); o.start(a.currentTime + t); o.stop(a.currentTime + t + .3); }); } catch (e) { } if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); };
  const tick = t => { if (!run) return; left -= (t - last) / 1000; last = t; if (left <= 0) { left = 0; run = false; paint(); beep(); el.querySelector('[data-go]').innerHTML = `${ic('timer')} ابدأ`; el.classList.add('done'); return; } paint(); raf = requestAnimationFrame(tick); };
  el.querySelector('[data-go]').onclick = e => {
    if (left <= 0) left = total;
    run = !run; el.classList.remove('done');
    e.currentTarget.innerHTML = run ? 'إيقاف مؤقت' : `${ic('timer')} متابعة`;
    if (run) { last = performance.now(); raf = requestAnimationFrame(tick); }
  };
  el.querySelector('[data-rs]').onclick = () => { run = false; cancelAnimationFrame(raf); left = total; el.classList.remove('done'); el.querySelector('[data-go]').innerHTML = `${ic('timer')} ابدأ`; paint(); };
  $$('[data-m]', el).forEach(b => b.onclick = () => { $$('[data-m]', el).forEach(x => x.classList.toggle('on', x === b)); total = left = +b.dataset.m * 60; run = false; cancelAnimationFrame(raf); el.querySelector('[data-go]').innerHTML = `${ic('timer')} ابدأ`; el.classList.remove('done'); paint(); });
  paint();
}

/* ===== 4) تقسيم المجموعات (متوازنة حسب نقاط المشاركة) ===== */
async function groupsTool(ctx) {
  const studs = await presentStudents(ctx.classId, ctx.date, ctx.period);
  if (studs.length < 4) return toast('عدد الحاضرين قليل لتقسيم المجموعات', 'bad');
  const pts = await DB.all('points');
  const score = {}; pts.forEach(x => score[x.studentId] = (score[x.studentId] || 0) + (x.value || 1));
  const r = await sheet(`<p class="muted">${studs.length} طالب حاضر — يستبعد الغائبين تلقائيًا</p>
    <span class="lbl">عدد المجموعات</span>${chips('n', ['2', '3', '4', '5', '6', '7', '8'], '4')}
    <label class="switch"><input type="checkbox" name="bal" checked><span></span> توازن المجموعات حسب مستوى المشاركة</label>
    <button class="btn primary block" data-ok>${ic('users')} قسّم</button>`, { title: 'تقسيم المجموعات', onMount: (el, close) => { bindChips(el); el.querySelector('[data-ok]').onclick = () => close({ n: +chipVal(el, 'n') || 4, bal: el.querySelector('[name=bal]').checked }); } });
  if (!r) return;
  logUse('groups');
  const make = () => {
    let arr = [...studs].sort(() => Math.random() - 0.5);
    if (r.bal) arr.sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0));
    const g = Array.from({ length: r.n }, () => []);
    arr.forEach((s, i) => { const round = Math.floor(i / r.n), pos = i % r.n; g[round % 2 ? r.n - 1 - pos : pos].push(s); });
    return g;
  };
  const names = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];
  const show = groups => {
    const el = overlay(`<div class="gr-wrap"><h2>المجموعات</h2><p class="muted">${esc(App.className(ctx.classId))} · ${studs.length} طالب في ${groups.length} مجموعات</p>
      <div class="gr-grid">${groups.map((g, i) => `<div class="gr-card c${i % 8}"><h3>المجموعة ${names[i]}</h3><ol>${g.map((s, j) => `<li>${esc(shortName(s.name))}${j === 0 ? ' <i>القائد</i>' : ''}</li>`).join('')}</ol></div>`).join('')}</div>
      <div class="row gap center-row"><button class="btn primary" data-again>${ic('sync')} تقسيم جديد</button><button class="btn ghost" data-copy>نسخ</button></div></div>`, 'light');
    el.querySelector('[data-again]').onclick = () => { el._close(); show(make()); };
    el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(groups.map((g, i) => `المجموعة ${names[i]}:\n` + g.map(s => '- ' + s.name).join('\n')).join('\n\n')); toast('نُسخت المجموعات', 'ok'); } catch (e) { toast('تعذر النسخ', 'bad'); } };
  };
  show(make());
}

/* شريط أدوات الحصة */
function toolsBar() {
  return `<div class="tools-bar six">
    <button data-tool="present" class="hl">${ic('screen')}<span>العرض</span></button>
    <button data-tool="quiz">${ic('help')}<span>المسابقة</span></button>
    <button data-tool="wheel">${ic('wheel')}<span>العجلة</span></button>
    <button data-tool="timer">${ic('timer')}<span>المؤقت</span></button>
    <button data-tool="groups">${ic('users')}<span>المجموعات</span></button>
    <button data-tool="photo">${ic('camera')}<span>صورة</span></button></div>`;
}
function bindTools(v, ctx) {
  $$('[data-tool]', v).forEach(b => b.onclick = () => {
    const t = b.dataset.tool;
    if (t === 'quiz') App.go('quiz', ctx);
    if (t === 'present') presentMode(ctx);
    if (t === 'wheel') wheelTool(ctx);
    if (t === 'timer') timerTool();
    if (t === 'groups') groupsTool(ctx);
    if (t === 'photo') photoSheet({ classId: ctx.classId, date: ctx.date, perf: ctx.cover ? 'duties' : 'strategies' });
  });
}
