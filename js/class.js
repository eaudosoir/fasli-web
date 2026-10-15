/* فصلي — داخل الحصة: خريطة المقاعد، وضع العرض على الشاشة، بنك الأسئلة، وأين وصلت مع كل فصل */
'use strict';

/* ===== أين وصلت مع كل فصل ===== */
const Reach = {
  get(classId) { return (App.S.reach || {})[classId] || null; },
  async set(classId, rec) { await App.set('reach', { ...(App.S.reach || {}), [classId]: { ...rec, date: ymd() } }); },
  /* الدرس التالي حسب آخر درس أنهيته لهذا الفصل (لا حسب التقويم) */
  next(classId) {
    const c = App.cls[classId]; if (!c) return null;
    const plan = Curr.plan(c.grade); const w = Curr.lastDone(classId) + 1;
    return plan[w - 1] ? { week: w, title: plan[w - 1] } : null;
  }
};

function reachHtml(classId) {
  const r = Reach.get(classId), nx = Reach.next(classId);
  return `<div class="reach">${ic('route')}<div class="grow">
      ${r ? `<small>وصلت آخر مرة (${shortDate(r.date)})</small><b>${esc(r.text)}</b>` : `<small>أين وصلت مع هذا الفصل؟</small><b class="muted">لم تسجّل بعد</b>`}
      ${nx ? `<small class="rc-next">الدرس التالي حسب ما أنجزته: ${esc(nx.title)}</small>` : ''}</div>
    <button class="btn xs soft" data-reach="${classId}">${ic('edit')} سجّل</button></div>`;
}
async function reachSheet(classId) {
  const r = Reach.get(classId) || {};
  const c = App.cls[classId]; const plan = Curr.plan(c?.grade);
  const res = await sheet(`<p class="muted small">يُحفظ لكل فصل وحده، ويظهر لك عند فتح حصته القادمة.</p>
    ${plan.length ? `<label class="fld"><span>الدرس</span><select name="w">${plan.map((t, i) => `<option value="${i + 1}" ${(r.week || Reach.next(classId)?.week) === i + 1 ? 'selected' : ''}>أ${i + 1}: ${esc(t)}</option>`).join('')}</select></label>` : ''}
    <label class="fld"><span>أين توقفت؟</span><div class="voice-fld"><input name="t" value="${esc(r.text || '')}" placeholder="مثال: صفحة 24 — الفقرة الثانية، بقي النشاط">${micBtn('[name=t]')}</div></label>
    <label class="switch"><input type="checkbox" name="done"><span></span> أنهيت هذا الدرس بالكامل</label>
    <button class="btn primary block" data-ok>${ic('check')} حفظ</button>`, {
    title: `أين وصلت — ${esc(App.className(classId))}`, onMount: (el, close) => {
      bindMic(el);
      el.querySelector('[data-ok]').onclick = () => close({ text: el.querySelector('[name=t]').value.trim(), week: +(el.querySelector('[name=w]')?.value || 0), done: el.querySelector('[name=done]').checked });
    }
  });
  if (!res) return false;
  const title = res.week ? plan[res.week - 1] : '';
  await Reach.set(classId, { text: res.text || (res.done ? `أنهيت: ${title}` : title || '—'), week: res.week });
  if (res.done && res.week) await Curr.markDone(classId, res.week, true);
  toast('حُفظ أين وصلت', 'ok'); return true;
}

/* ===== خريطة المقاعد ===== */
const Seats = {
  cfg(classId) { return (App.S.seats || {})[classId] || null; },
  async save(classId, cfg) { await App.set('seats', { ...(App.S.seats || {}), [classId]: cfg }); },
  auto(classId, cols = 5) {
    const studs = App.classStudents(classId);
    const rows = Math.max(1, Math.ceil(studs.length / cols));
    const map = {}; studs.forEach((s, i) => map[i] = s.id);
    return { cols, rows, map };
  }
};
const SEAT_ACTS = [['att', 'غياب/حضور', 'checkSq'], ['late', 'تأخر', 'timer'], ['part', 'مشاركة', 'star'], ['menu', 'خيارات', 'more']];

function seatBody(classId, studs, status, ptsOf) {
  const cfg = Seats.cfg(classId);
  if (!cfg) return `<div class="empty">${ic('seat')}<h3>رتّب مقاعد ${esc(App.className(classId))}</h3><p>ضع كل طالب في مكان جلوسه الحقيقي، وبعدها لمسة على المقعد تسجّل غيابه أو تأخره أو مشاركته.</p>
    <div class="row gap center-row"><button class="btn primary" data-seat-auto>${ic('sparkle')} ترتيب سريع بالأسماء</button><button class="btn soft" data-seat-edit>${ic('edit')} ترتيب يدوي</button></div></div>`;
  const act = App._seatAct || 'att';
  const ids = new Set(studs.map(s => s.id));
  const cells = [];
  for (let i = 0; i < cfg.cols * cfg.rows; i++) {
    const sid = cfg.map[i];
    if (!sid || !ids.has(sid)) { cells.push(`<div class="seat empty"></div>`); continue; }
    const st = status(sid), n = ptsOf(sid);
    cells.push(`<button class="seat st-${st}" data-seat="${sid}"><span class="seat-n">${esc(shortName(App.stu[sid].name))}</span>${st !== 'present' ? `<i class="seat-st">${ATT[st].label}</i>` : ''}${n ? `<i class="seat-pt">★${n}</i>` : ''}</button>`);
  }
  const placed = new Set(Object.values(cfg.map));
  const missing = studs.filter(s => !placed.has(s.id));
  return `<div class="seat-acts">${SEAT_ACTS.map(([k, l, i]) => `<button class="${k === act ? 'on' : ''}" data-sact="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</div>
    <p class="hint">${{ att: 'لمسة على المقعد: غائب ↔ حاضر', late: 'لمسة على المقعد: متأخر ↔ حاضر', part: 'لمسة على المقعد: نقطة مشاركة +1 (مع إمكانية التراجع)', menu: 'لمسة على المقعد: كل الخيارات (واجب، ملاحظة، رسالة...)' }[act]}</p>
    <div class="board">السبورة</div>
    <div class="seat-grid" style="--cols:${cfg.cols}">${cells.join('')}</div>
    ${missing.length ? `<p class="muted small">طلاب بلا مقعد: ${missing.map(s => esc(shortName(s.name))).join('، ')}</p>` : ''}
    <button class="btn ghost block" data-seat-edit>${ic('edit')} تعديل ترتيب المقاعد</button>`;
}

function bindSeats(v, { classId, ctx, status, setStatus, rerender }) {
  $$('[data-sact]', v).forEach(b => b.onclick = () => { App._seatAct = b.dataset.sact; rerender(); });
  v.querySelector('[data-seat-auto]')?.addEventListener('click', async () => { await Seats.save(classId, Seats.auto(classId)); rerender(); });
  $$('[data-seat-edit]', v).forEach(b => b.onclick = () => App.go('seats', { classId }));
  $$('[data-seat]', v).forEach(b => b.onclick = async () => {
    const sid = b.dataset.seat, act = App._seatAct || 'att';
    if (navigator.vibrate) navigator.vibrate(12);
    if (act === 'att') { await setStatus(sid, status(sid) === 'absent' ? 'present' : 'absent'); return rerender(); }
    if (act === 'late') { await setStatus(sid, status(sid) === 'late' ? 'present' : 'late'); return rerender(); }
    if (act === 'part') { await addPoint({ studentId: sid, ...ctx, classId: App.stu[sid].classId, type: 'participation', reason: 'مشاركة في الدرس' }, `★ مشاركة لـ ${esc(shortName(App.stu[sid].name))}`); b.classList.add('pop'); return setTimeout(rerender, 150); }
    studentQuick(sid, ctx, rerender);
  });
}

/* محرر المقاعد */
Screens.seats = async (v, p) => {
  const classId = p.classId;
  let cfg = Seats.cfg(classId) || Seats.auto(classId);
  cfg = { ...cfg, map: { ...cfg.map } };
  const studs = App.classStudents(classId);
  const draw = () => {
    const placed = new Set(Object.values(cfg.map));
    const free = studs.filter(s => !placed.has(s.id));
    const cells = []; for (let i = 0; i < cfg.cols * cfg.rows; i++) { const sid = cfg.map[i]; cells.push(`<button class="seat ${sid ? '' : 'empty edit'}" data-cell="${i}">${sid && App.stu[sid] ? `<span class="seat-n">${esc(shortName(App.stu[sid].name))}</span>` : ic('plus')}</button>`); }
    v.innerHTML = topbar(`مقاعد ${esc(App.className(classId))}`) + `<div class="page">
      <p class="hint">${ic('info')} المس أي مقعد لتضع فيه طالبًا أو تبدّله. الصف الأول هو الأقرب للسبورة.</p>
      <div class="row gap wrap"><span class="lbl">الأعمدة</span>${chips('cols', ['3', '4', '5', '6', '7', '8'], String(cfg.cols))}</div>
      <div class="row gap wrap"><span class="lbl">الصفوف</span>${chips('rows', ['3', '4', '5', '6', '7', '8'], String(cfg.rows))}</div>
      <div class="board">السبورة</div>
      <div class="seat-grid" style="--cols:${cfg.cols}">${cells.join('')}</div>
      ${free.length ? `<p class="muted small">بلا مقعد (${free.length}): ${free.map(s => esc(shortName(s.name))).join('، ')}</p>` : `<p class="muted small center">${ic('check')} كل الطلاب في مقاعدهم</p>`}
      <div class="row gap"><button class="btn soft grow" data-auto>${ic('list')} بالترتيب الأبجدي</button><button class="btn soft grow" data-shuf>${ic('sync')} عشوائي</button></div>
      <button class="btn primary block mt" data-save>${ic('check')} حفظ الترتيب</button></div>`;
    bindBack(v); bindChips(v);
    $$('[data-chips="cols"],[data-chips="rows"]', v).forEach(g => g.addEventListener('change', () => { cfg.cols = +chipVal(v, 'cols') || cfg.cols; cfg.rows = +chipVal(v, 'rows') || cfg.rows; const max = cfg.cols * cfg.rows; Object.keys(cfg.map).forEach(k => { if (+k >= max) delete cfg.map[k]; }); draw(); }));
    v.querySelector('[data-auto]').onclick = () => { const a = Seats.auto(classId, cfg.cols); cfg.map = a.map; cfg.rows = Math.max(cfg.rows, a.rows); draw(); };
    v.querySelector('[data-shuf]').onclick = () => { const arr = [...studs].sort(() => Math.random() - .5); cfg.map = {}; arr.forEach((s, i) => cfg.map[i] = s.id); cfg.rows = Math.max(cfg.rows, Math.ceil(arr.length / cfg.cols)); draw(); };
    v.querySelector('[data-save]').onclick = async () => { await Seats.save(classId, cfg); toast('حُفظ ترتيب المقاعد', 'ok'); App.back(); };
    $$('[data-cell]', v).forEach(b => b.onclick = async () => {
      const i = +b.dataset.cell, cur = cfg.map[i];
      const placedNow = new Set(Object.values(cfg.map));
      const opts = [...(cur ? [{ value: '__clear', label: 'إفراغ المقعد', icon: ic('x') }] : []),
        ...studs.filter(s => !placedNow.has(s.id)).map(s => ({ value: s.id, label: s.name, icon: ic('users') })),
        ...studs.filter(s => placedNow.has(s.id) && s.id !== cur).map(s => ({ value: 'swap:' + s.id, label: s.name, sub: 'تبديل مع مقعده الحالي', icon: ic('sync') }))];
      const r = await choose(cur ? `مقعد ${App.stu[cur]?.name}` : 'مقعد فارغ', opts);
      if (!r) return;
      if (r === '__clear') delete cfg.map[i];
      else if (r.startsWith('swap:')) { const sid = r.slice(5); const j = Object.keys(cfg.map).find(k => cfg.map[k] === sid); if (cur) cfg.map[j] = cur; else delete cfg.map[j]; cfg.map[i] = sid; }
      else cfg.map[i] = r;
      draw();
    });
  };
  draw();
};

/* ===== بنك الأسئلة ===== */
Screens.qbank = async (v, p) => {
  const grade = p.grade || App.cls[App._lastClass]?.grade || 4;
  const plan = Curr.plan(grade);
  const week = p.week || Curr.weekOf().n || 1;
  const items = QB.list(grade, week);
  v.innerHTML = topbar('بنك الأسئلة') + `<div class="page">
    <div class="seg">${[4, 5, 6].map(g => `<button class="${g === grade ? 'on' : ''}" data-g="${g}">${GRADES[g]}</button>`).join('')}</div>
    <label class="fld"><span>الدرس</span><select data-w>${(plan.length ? plan : CURR_WEEKS.map(() => '')).map((t, i) => `<option value="${i + 1}" ${i + 1 === week ? 'selected' : ''}>أ${i + 1}${t ? ': ' + esc(t) : ''}</option>`).join('')}</select></label>
    ${!plan.length ? `<p class="hint">${ic('info')} لم يُدخل توزيع منهج هذا الصف بعد، أضف أسئلتك لكل أسبوع وستظهر في المسابقة.</p>` : ''}
    <div class="qb-list">${items.length ? items.map(([q, a, own], i) => `<div class="qb-item ${own ? 'own' : ''}"><span class="q-n">${i + 1}</span><div class="grow"><b>${esc(q)}</b><small>${ic('check')} ${esc(a)}</small></div>${own ? `<button class="icon-btn sm" data-delq="${esc(q)}" aria-label="حذف">${ic('trash')}</button>` : ''}</div>`).join('') : `<div class="empty sm">لا أسئلة لهذا الدرس بعد — أضف أسئلتك بالأسفل</div>`}</div>
    <section class="card"><div class="card-h"><h3>${ic('plus')} أضف سؤالًا من عندك</h3></div>
      <label class="fld"><span>السؤال</span><div class="voice-fld"><input name="q" placeholder="اكتب السؤال">${micBtn('[name=q]')}</div></label>
      <label class="fld"><span>الإجابة</span><div class="voice-fld"><input name="a" placeholder="الإجابة الصحيحة">${micBtn('[name=a]')}</div></label>
      <button class="btn gold block" data-addq>${ic('plus')} إضافة</button></section>
    ${items.length ? `<button class="btn primary block" data-ws>${ic('sheet')} ورقة عمل أو اختبار قصير من هذا الدرس</button>` : ''}</div>`;
  bindBack(v); bindMic(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-g]', v).forEach(b => b.onclick = () => setP({ grade: +b.dataset.g, week: Curr.weekOf().n || 1 }));
  v.querySelector('[data-w]').onchange = e => setP({ week: +e.target.value, grade });
  $$('[data-delq]', v).forEach(b => b.onclick = async () => { await QB.remove(grade, week, b.dataset.delq); setP({}); });
  v.querySelector('[data-ws]')?.addEventListener('click', () => App.go('worksheet', { grade, weeks: [week] }));
  v.querySelector('[data-addq]').onclick = async () => {
    const q = v.querySelector('[name=q]').value.trim(), a = v.querySelector('[name=a]').value.trim();
    if (!q || !a) return toast('اكتب السؤال والإجابة', 'bad');
    await QB.add(grade, week, q, a); toast('أضيف السؤال', 'ok'); setP({});
  };
};

/* نافذة سؤال كبيرة للعرض على الشاشة */
function questionOverlay(classId, startIdx = 0, week) {
  const QS = QB.forClass(classId, week); let i = startIdx % QS.items.length;
  const les = App.cls[classId] ? Curr.plan(App.cls[classId].grade)[QS.week - 1] : '';
  const el = overlay(`<div class="qo-wrap"><p class="muted">${esc(App.className(classId))}${les && !QS.general ? ' · ' + esc(les) : QS.general ? ' · أسئلة عامة' : ''}</p>
    <div class="qo-card"><span class="qo-n"></span><h2 class="qo-q"></h2><div class="qo-a" hidden></div></div>
    <div class="row gap center-row"><button class="btn gold lg" data-ans>${ic('eye')} الإجابة</button><button class="btn ghost lg" data-next>سؤال آخر ${ic('chev')}</button></div></div>`, 'dark present');
  const show = () => { const [q, a] = QS.items[i]; el.querySelector('.qo-n').textContent = `سؤال ${i + 1} من ${QS.items.length}`; el.querySelector('.qo-q').textContent = q; const A = el.querySelector('.qo-a'); A.textContent = a; A.hidden = true; };
  el.querySelector('[data-ans]').onclick = () => { el.querySelector('.qo-a').hidden = false; };
  el.querySelector('[data-next]').onclick = () => { i = (i + 1) % QS.items.length; show(); };
  show(); logUse('qbank');
}

/* ===== وضع العرض على الشاشة ===== */
async function presentMode(ctx) {
  const { classId, date, period } = ctx;
  const les = Curr.lesson(classId, date);
  Native.call('setImmersive', true);
  const el = overlay(`<div class="pm-wrap">
    <div class="pm-head"><img src="img/logo.png" alt=""><div><h1>${esc(App.className(classId))}</h1><p>${esc(App.S.subject || '')}${les?.title ? ' · ' + esc(les.title) : ''}</p></div>
      <div class="pm-clock"><b data-countdown>--:--</b><small>متبقٍ من الحصة</small></div></div>
    <div class="pm-stars"><h3>${ic('star')} نجوم الحصة</h3><div class="pm-st-list"></div></div>
    <div class="pm-tools">
      <button data-pm="q">${ic('help')}<span>سؤال</span></button><button data-pm="wheel">${ic('wheel')}<span>عجلة الأسماء</span></button>
      <button data-pm="timer">${ic('timer')}<span>المؤقت</span></button><button data-pm="groups">${ic('users')}<span>المجموعات</span></button></div>
    <p class="pm-foot">${esc(App.S.teacherName || '')} · ${hijri(new Date())}</p></div>`, 'dark present pm');
  const close0 = el._close; el._close = () => { Native.call('setImmersive', false); clearInterval(t); close0(); };
  el.querySelector('[data-ovx]').onclick = el._close;
  const refresh = async () => {
    const pts = (await DB.byIndex('points', 'date', date)).filter(x => x.period === period);
    const by = {}; pts.forEach(x => by[x.studentId] = (by[x.studentId] || 0) + (x.value || 1));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6);
    el.querySelector('.pm-st-list').innerHTML = top.length ? top.map(([sid, n], k) => `<span class="pm-st ${k < 3 ? 'top' : ''}">${['🥇', '🥈', '🥉'][k] || '⭐'} ${esc(shortName(App.stu[sid]?.name || ''))} <i>${n}</i></span>`).join('') : '<span class="muted">شارك لتظهر هنا ⭐</span>';
  };
  const t = setInterval(refresh, 4000); refresh(); App.tick();
  let qi = 0;
  $$('[data-pm]', el).forEach(b => b.onclick = () => {
    const k = b.dataset.pm;
    if (k === 'q') questionOverlay(classId, qi++);
    if (k === 'wheel') wheelTool(ctx);
    if (k === 'timer') timerTool();
    if (k === 'groups') groupsTool(ctx);
  });
  logUse('present');
}
