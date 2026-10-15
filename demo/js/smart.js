/* فصلي — الذكاء العملي: «حدث الآن»، لوحة الحصة، مؤشر حالة الفصل، اسأل فصلي، الخصوصية والوضع الليلي، تشفير النسخ */
'use strict';

/* ===== تسجيل حضور طالب من أي مكان (مع سجل التعديل) ===== */
async function setAttendance(sid, ctx, st) {
  const id = `${ctx.date}|${ctx.period}|${sid}`;
  const cur = await DB.get('attendance', id);
  const ses = await DB.get('sessions', `${ctx.date}|${ctx.period}|${ctx.classId}`);
  const rec = cur ? { ...cur } : { id, date: ctx.date, period: ctx.period, classId: App.stu[sid]?.classId || ctx.classId, studentId: sid, status: 'present', at: new Date().toISOString(), history: [] };
  if (cur && cur.status === st) return cur;
  if (cur && (ses?.complete || ctx.date !== ymd())) rec.history = [...(rec.history || []), { at: new Date().toISOString(), from: cur.status, to: st }];
  rec.status = st; rec.updatedAt = new Date().toISOString();
  await DB.put('attendance', rec);
  return { rec, prev: cur };
}

/* ===== «حدث الآن»: لمسة على اسم الطالب = كل الإجراءات السريعة في مكان واحد ===== */
async function studentQuick(sid, ctx, after) {
  const s = App.stu[sid]; if (!s) return;
  ctx = { date: ctx?.date || ymd(), period: ctx?.period ?? (Sched.live()?.entry.period || 0), classId: ctx?.classId || s.classId };
  const att = ctx.period ? await DB.get('attendance', `${ctx.date}|${ctx.period}|${sid}`) : null;
  const st = att?.status || 'present';
  const A = [
    ['absent', 'غائب', 'x', 'bad', true], ['late', 'متأخر', 'timer', 'warn', true], ['escaped', 'هارب', 'run', 'esc', true], ['present', 'حاضر', 'check', 'ok', true],
    ['nohw', 'لم يحل الواجب', 'book', 'info'], ['hw', 'مقصّر (اختر النوع)', 'note', 'info'],
    ['star', 'مشاركة ممتازة +2', 'sparkle', 'gold'], ['part', 'مشاركة +1', 'star', 'gold'],
    ['pos', 'سلوك إيجابي', 'medal', 'gold'], ['note', 'ملاحظة', 'edit', 'mut'],
    ['msg', 'تواصل مع ولي الأمر', 'wa', 'wa'], ['profile', 'ملف الطالب', 'users', 'mut']
  ].filter(a => !a[4] || ctx.period);
  const r = await sheet(`<div class="now-who"><span class="av">${esc(initials(s.name))}</span><div><b>${esc(s.name)}</b><small>${esc(App.className(s.classId))}${ctx.period ? ` · الآن: ${ATT[st].label}` : ''}</small></div></div>
    <div class="now-grid">${A.map(([k, l, i, c]) => `<button class="na c-${c} ${k === st ? 'cur' : ''}" data-a="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</div>`,
    { title: 'حدث الآن', onMount: (el, close) => $$('[data-a]', el).forEach(b => b.onclick = () => close(b.dataset.a)) });
  if (!r) return;
  const nm = esc(shortName(s.name));
  if (['absent', 'late', 'escaped', 'present'].includes(r)) {
    const res = await setAttendance(sid, ctx, r);
    toast(`${nm}: ${ATT[r].label}`, r === 'present' ? 'ok' : 'warn', res?.prev !== undefined ? { undo: async () => { if (res.prev) await DB.put('attendance', res.prev); else await DB.del('attendance', res.rec.id); App.render(); } } : {});
    if (navigator.vibrate) navigator.vibrate(15);
  }
  if (r === 'nohw') {
    const rec = { id: uid(), studentId: sid, classId: s.classId, date: ctx.date, period: ctx.period, kind: 'لم يحل الواجب', note: '', status: 'open', resolved: false, at: new Date().toISOString() };
    await DB.put('homework', rec);
    const n = (await DB.byIndex('homework', 'studentId', sid)).length;
    toast(`📚 ${nm}: لم يحل الواجب — المرة ${n}`, n >= 3 ? 'warn' : 'ok', { undo: async () => { await DB.del('homework', rec.id); App.render(); } });
  }
  if (r === 'hw') await homeworkSheet(sid, ctx);
  if (r === 'star') await addPoint({ studentId: sid, ...ctx, classId: s.classId, type: 'positive', reason: 'مشاركة ممتازة', value: 2 }, `✨ مشاركة ممتازة لـ ${nm}`);
  if (r === 'part') await addPoint({ studentId: sid, ...ctx, classId: s.classId, type: 'participation', reason: 'مشاركة في الدرس' }, `★ مشاركة لـ ${nm}`);
  if (r === 'pos') await pointsSheet(sid, ctx);
  if (r === 'note') await noteSheet(sid, ctx);
  if (r === 'msg') await messageSheet(sid, { kind: st !== 'present' && st !== 'excused' ? st : 'pos', date: ctx.date, period: ctx.period });
  if (r === 'profile') return App.go('student', { id: sid });
  after ? after() : App.render();
}

/* ===== لوحة الحصة: ما يهمك عن هذا الفصل في شاشة واحدة ===== */
async function sessionPanel(classId, studs) {
  const D = await Follow.load();
  const ids = new Set(studs.map(s => s.id));
  const hwOpen = {}; D.hw.filter(h => ids.has(h.studentId) && !h.resolved).forEach(h => (hwOpen[h.studentId] ||= []).push(h));
  const notes = D.notes.filter(n => ids.has(n.studentId) && !n.resolved && (n.importance === 'high' || n.needsContact)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const care = Care.attention(D).filter(x => ids.has(x.sid) && !x.contacted);
  if (!Object.keys(hwOpen).length && !notes.length && !care.length) return '';
  const nm = sid => esc(shortName(App.stu[sid]?.name || ''));
  return `<details class="ses-panel" ${App._panelOpen === false ? '' : 'open'}><summary>${ic('eye')} ما يهمك في هذا الفصل <span class="sp-c">${Object.keys(hwOpen).length + notes.length + care.length}</span></summary>
    ${Object.keys(hwOpen).length ? `<div class="sp-row"><b>${ic('book')} واجبات تنتظر المتابعة</b><div class="sp-chips">${Object.entries(hwOpen).sort((a, b) => b[1].length - a[1].length).map(([sid, a]) => `<button class="sp-chip ${a.length >= 3 ? 'hot' : ''}" data-sq="${sid}">${nm(sid)} <i>${a.length}</i></button>`).join('')}</div></div>` : ''}
    ${notes.length ? `<div class="sp-row"><b>${ic('note')} آخر ملاحظات مهمة</b>${notes.map(n => `<button class="sp-note" data-sq="${n.studentId}"><span>${nm(n.studentId)}:</span> <span class="sens">${esc(n.text)}</span> <small>${shortDate(n.date)}</small></button>`).join('')}</div>` : ''}
    ${care.length ? `<div class="sp-row"><b>${ic('pulse')} يحتاجون متابعة</b><div class="sp-chips">${care.map(x => `<button class="sp-chip warn" data-sq="${x.sid}" title="${esc(x.flags.map(f => f.t).join('، '))}">${nm(x.sid)}</button>`).join('')}</div></div>` : ''}
  </details>`;
}

/* ===== مؤشر حالة الفصل: ملخص نهاية الحصة مع مقارنة بالفصول الأخرى ===== */
async function classSummary(ctx) {
  const { classId, date, period } = ctx;
  const D = await Follow.load();
  const studs = App.classStudents(classId); const ids = new Set(studs.map(s => s.id));
  const att = D.att.filter(a => a.date === date && a.period === period && ids.has(a.studentId));
  const pres = att.filter(a => ['present', 'late'].includes(a.status)).length + (studs.length - att.length);
  const rate = studs.length ? Math.round(pres / studs.length * 100) : 0;
  const c = k => att.filter(a => a.status === k).length;
  const hw = D.hw.filter(h => h.date === date && h.period === period && ids.has(h.studentId));
  const pts = D.pts.filter(x => x.date === date && x.period === period && ids.has(x.studentId));
  const stars = pts.filter(x => x.type === 'positive' || (x.value || 1) >= 2).length;
  const parts = new Set(pts.map(x => x.studentId)).size;
  const care = Care.attention(D).filter(x => ids.has(x.sid) && !x.contacted).length;
  // المقارنة: نسبة الحضور والمشاركة هذا الأسبوع لكل فصل
  const [wf, wt] = weekRange(parseYmd(date));
  const cmp = App.classes.filter(k => App.classStudents(k.id).length).map(k => {
    const a = D.att.filter(x => x.classId === k.id && x.date >= wf && x.date <= wt);
    const p = D.pts.filter(x => x.classId === k.id && x.date >= wf && x.date <= wt).reduce((s, x) => s + (x.value || 1), 0);
    return { k, rate: a.length ? Math.round(a.filter(x => ['present', 'late'].includes(x.status)).length / a.length * 100) : null, ppl: Math.round(p / App.classStudents(k.id).length * 10) / 10 };
  }).filter(x => x.rate !== null).sort((a, b) => b.rate - a.rate || b.ppl - a.ppl);
  const mine = cmp.findIndex(x => x.k.id === classId);
  const grade = rate >= 95 && !hw.length ? ['ممتاز', 'ok'] : rate >= 85 ? ['جيد', 'gold'] : ['يحتاج متابعة', 'bad'];
  logUse('summary');
  return sheet(`<div class="cs-head"><div class="cs-ring" style="--p:${rate}"><b>${rate}%</b><small>الحضور</small></div>
      <div><h3>${esc(App.className(classId))}</h3><p class="muted small">الحصة ${ordinal(period)} · ${shortDate(date)}</p><span class="pill ${grade[1]}">حالة الفصل: ${grade[0]}</span></div></div>
    <div class="rep-tiles sm"><div><b>${c('absent')}</b><small>غائب</small></div><div><b>${c('late')}</b><small>متأخر</small></div><div><b>${c('escaped')}</b><small>هارب</small></div>
      <div><b>${new Set(hw.map(h => h.studentId)).size}</b><small>مقصّر في الواجب</small></div><div><b>${stars}</b><small>مشاركة مميزة</small></div><div><b>${parts}</b><small>طالب شارك</small></div></div>
    ${care ? `<p class="cs-warn">${ic('pulse')} ${care === 1 ? 'حالة واحدة تحتاج' : care === 2 ? 'حالتان تحتاجان' : care <= 10 ? `${care} حالات تحتاج` : `${care} حالة تحتاج`} متابعة في هذا الفصل</p>` : ''}
    ${cmp.length > 1 ? `<span class="lbl">مقارنة بالفصول هذا الأسبوع (الحضور · نقاط لكل طالب)</span><div class="cs-cmp">${cmp.map((x, i) => `<div class="${x.k.id === classId ? 'me' : ''}"><span>${i + 1}</span><b>${esc(x.k.name)}</b><i style="--w:${x.rate}%"></i><small>${x.rate}% · ${x.ppl}</small></div>`).join('')}</div>
      <p class="muted small center">ترتيب ${esc(App.className(classId))}: ${mine + 1} من ${cmp.length}</p>` : ''}
    <div class="row gap"><button class="btn soft grow" data-close>إغلاق</button></div>`, { title: 'مؤشر حالة الفصل' });
}

/* ===== اسأل فصلي: بحث ذكي بالعربية من بيانات التطبيق نفسها ===== */
const ASK_METRICS = [
  { k: 'late', re: /تأخر|تاخر|متأخر|متاخر|المتأخرين/, label: 'التأخر', unit: 'مرة', src: D => D.att.filter(a => a.status === 'late') },
  { k: 'absent', re: /غياب|غائب|غايب|الغائبين|الغايبين|غابوا|غاب/, label: 'الغياب', unit: 'حصة', src: D => D.att.filter(a => a.status === 'absent') },
  { k: 'escaped', re: /هروب|هارب|الهاربين|هربوا/, label: 'الهروب', unit: 'مرة', src: D => D.att.filter(a => a.status === 'escaped') },
  { k: 'hw', re: /واجب|الواجب|مقصر|المقصرين|يحلوا|يحل|تقصير/, label: 'تقصير الواجبات', unit: 'مرة', src: D => D.hw },
  { k: 'notes', re: /ملاحظ|سلوك|مخالف/, label: 'الملاحظات', unit: 'ملاحظة', src: D => D.notes },
  { k: 'pts', re: /مشارك|متميز|متفوق|نقاط|نجوم|أفضل|افضل/, label: 'المشاركة والنقاط', unit: 'نقطة', src: D => D.pts, sum: true }
];
function parseAsk(q) {
  const t = normName(q).replace(/[؟?]/g, ' ');
  const m = ASK_METRICS.find(x => x.re.test(t) || x.re.test(q));
  let from = '0000', to = '9999', when = 'منذ بداية الفصل';
  if (/(^|\s)اليوم(\s|$)/.test(t)) { [from, to] = periodRange('day'); when = 'اليوم'; }
  else if (/(^|\s)(امس|البارحه)(\s|$)/.test(t)) { from = to = ymd(addDays(new Date(), -1)); when = 'أمس'; }
  else if (/الاسبوع الماضي/.test(t)) { [from, to] = weekRange(addDays(new Date(), -7)); when = 'الأسبوع الماضي'; }
  else if (/اسبوع|الاسبوع/.test(t)) { [from, to] = periodRange('week'); when = 'هذا الأسبوع'; }
  else if (/شهر|الشهر/.test(t)) { [from, to] = periodRange('month'); when = 'هذا الشهر'; }
  // النطاق: فصل محدد (5ب، خامس ب) أو صف كامل (السادس)
  let classIds = null, scope = 'كل الفصول';
  const G = { 4: /رابع|الرابع|\b4/, 5: /خامس|الخامس|\b5/, 6: /سادس|السادس|\b6/ };
  const S = { 1: /(?:\s|^|\d)ا(?:\s|$)|\sأ(?:\s|$)|[456]ا\b/, 2: /(?:\s|^|\d)ب(?:\s|$)/, 3: /(?:\s|^|\d)ج(?:\s|$)/ };
  const tt = ' ' + t.replace(/([456])\s*([ابج])/g, '$1 $2') + ' ';
  const g = +Object.keys(G).find(k => G[k].test(tt)) || 0;
  if (g) {
    const sec = +Object.keys(S).find(k => new RegExp(`(?:${g}|${['', '', '', '', 'رابع', 'خامس', 'سادس'][g]})\\s+${['', 'ا', 'ب', 'ج'][k]}(?:\\s|$)`).test(tt)) || 0;
    if (sec) { classIds = [`g${g}s${sec}`]; scope = App.className(`g${g}s${sec}`); }
    else { classIds = App.classes.filter(c => c.grade === g).map(c => c.id); scope = `الصف ${GRADES[g]}`; }
  }
  const th = t.match(/(\d+)\s*(?:مرات|مره|مرة|فاكثر|او اكثر)/) || (/مرتين/.test(t) ? [0, 2] : /ثلاث/.test(t) ? [0, 3] : null);
  const min = th ? +th[1] : 1;
  const top = /اكثر|أكثر|افضل|أفضل|اعلى/.test(t) && !th;
  return { m, from, to, when, classIds, scope, min, top };
}
function runAsk(q, D) {
  const P = parseAsk(q);
  if (!P.m) return { P, rows: null };
  const by = {};
  P.m.src(D).filter(x => x.date >= P.from && x.date <= P.to).forEach(x => {
    const s = App.stu[x.studentId]; if (!s || s.active === false) return;
    if (P.classIds && !P.classIds.includes(s.classId)) return;
    by[x.studentId] = (by[x.studentId] || 0) + (P.m.sum ? (x.value || 1) : 1);
  });
  let rows = Object.entries(by).filter(([, n]) => n >= P.min).sort((a, b) => b[1] - a[1] || App.stu[a[0]].name.localeCompare(App.stu[b[0]].name, 'ar'));
  if (P.top) rows = rows.slice(0, 10);
  return { P, rows };
}
const ASK_EXAMPLES = ['من أكثر طلاب السادس تأخرًا هذا الشهر؟', 'الطلاب الذين لم يحلوا الواجب مرتين فأكثر', 'الهاربين هذا الأسبوع', 'طلاب 5ب المقصرين', 'أكثر الطلاب مشاركة في رابع أ', 'الغائبين اليوم'];
Screens.ask = async (v, p) => {
  const q = p.q || '';
  const D = q ? await Follow.load() : null;
  const R = q ? runAsk(q, D) : null;
  const nameHits = q && (!R?.P.m) ? App.students.filter(s => normName(s.name).includes(normName(q))).slice(0, 30) : [];
  v.innerHTML = topbar('اسأل فصلي') + `<div class="page">
    <div class="ask-box"><div class="voice-fld"><input data-ask value="${esc(q)}" placeholder="اسأل عن طلابك… مثل: الهاربين هذا الأسبوع" enterkeyhint="search">${micBtn('[data-ask]')}</div>
      <button class="btn primary" data-go-ask>${ic('search')} اسأل</button></div>
    ${!q ? `<p class="muted small">جرّب:</p><div class="ask-ex">${ASK_EXAMPLES.map(x => `<button class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="hint">${ic('info')} يفهم فصلي: <b>الغياب، التأخر، الهروب، الواجبات، الملاحظات، المشاركة</b> · <b>اليوم، أمس، هذا الأسبوع، الأسبوع الماضي، هذا الشهر</b> · <b>صف (السادس) أو فصل (5ب، خامس ب)</b> · <b>«مرتين فأكثر» أو «3 مرات»</b> · وأي جزء من اسم طالب.</div>` : ''}
    ${R?.P.m ? `<div class="ask-ans">${ic('sparkle')}<div><b>${esc(R.P.top ? `الأكثر في ${R.P.m.label}` : R.P.m.label)}${R.P.min > 1 ? ` (${R.P.min} فأكثر)` : ''}</b><small>${esc(R.P.scope)} · ${esc(R.P.when)} · ${R.rows.length} طالب</small></div></div>
      ${R.rows.length ? `<div class="stu-list">${R.rows.map(([sid, n], i) => `<button class="rank-row" data-open="${sid}"><span class="rk">${i + 1}</span><span class="grow"><b>${esc(App.stu[sid].name)}</b><small>${esc(App.className(App.stu[sid].classId))}</small></span><span class="count-b ${R.P.m.k === 'pts' ? 'gold' : 'bad'}">${n} <small>${R.P.m.unit}</small></span></button>`).join('')}</div>
        <div class="row gap"><button class="btn soft grow" data-copy>${ic('list')} نسخ القائمة</button><button class="btn soft grow" data-xls>${ic('download')} Excel</button></div>` : `<div class="empty sm">لا يوجد طلاب مطابقون 👏</div>`}` : ''}
    ${q && !R?.P.m ? (nameHits.length ? `<div class="stu-list">${nameHits.map(s => `<button class="rank-row" data-open="${s.id}"><span class="av">${esc(initials(s.name))}</span><span class="grow"><b>${esc(s.name)}</b><small>${esc(App.className(s.classId))}</small></span></button>`).join('')}</div>` : `<div class="empty sm">لم أفهم السؤال ولم أجد طالبًا بهذا الاسم — جرّب أحد الأمثلة</div>`) : ''}
  </div>`;
  bindBack(v); bindMic(v);
  const ask = val => { App.stack[App.stack.length - 1].params = { q: val.trim() }; App.render(); };
  const inp = v.querySelector('[data-ask]');
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ask(inp.value); } };
  v.querySelector('[data-go-ask]').onclick = () => ask(inp.value);
  $$('[data-ex]', v).forEach(b => b.onclick = () => ask(b.dataset.ex));
  $$('[data-open]', v).forEach(b => b.onclick = () => App.go('student', { id: b.dataset.open }));
  const lines = () => R.rows.map(([sid, n], i) => `${i + 1}. ${App.stu[sid].name} (${App.className(App.stu[sid].classId)}) — ${n}`).join('\n');
  v.querySelector('[data-copy]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${q}\n\n${lines()}`); toast('نُسخت القائمة', 'ok'); } catch (e) { toast('تعذر النسخ', 'bad'); } });
  v.querySelector('[data-xls]')?.addEventListener('click', async () => Native.saveFile(`فصلي-${R.P.m.label}.xlsx`, await buildXlsx(R.P.m.label, ['م', 'اسم الطالب', 'الفصل', 'العدد'], R.rows.map(([sid, n], i) => [i + 1, App.stu[sid].name, App.className(App.stu[sid].classId), n]), q), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  if (!q) setTimeout(() => inp.focus(), 250);
};

/* ===== الخصوصية والمظهر ===== */
const Look = {
  apply() {
    const S = App.S, b = document.body;
    b.classList.toggle('privacy', !!S.privacy);
    const dark = S.theme === 'dark' || (S.theme === 'auto' && (() => { const h = new Date().getHours(); return h >= 18 || h < 5; })());
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    b.classList.toggle('calm', !!S.calm);
    Native.call('setDarkBars', dark);
  },
  async togglePrivacy() { await App.set('privacy', !App.S.privacy); this.apply(); toast(App.S.privacy ? '🔒 وضع الخصوصية: الأرقام والملاحظات مخفية — المسها لإظهارها' : 'أُوقف وضع الخصوصية', 'ok'); App.render(); }
};
/* لمسة على عنصر مخفي تظهره مؤقتًا */
document.addEventListener('click', e => { const s = e.target.closest('.privacy .sens:not(.show)'); if (s) { e.preventDefault(); e.stopPropagation(); s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 8000); } }, true);

/* ===== تشفير النسخ الاحتياطية (AES-GCM بكلمة مرور يختارها المعلم) ===== */
const Crypt = {
  async key(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  b64: u => btoa(String.fromCharCode(...u)),
  ub64: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  async encrypt(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(pass, salt), new TextEncoder().encode(JSON.stringify(obj))));
    let bin = ''; for (let i = 0; i < data.length; i += 8192) bin += String.fromCharCode(...data.subarray(i, i + 8192));
    return { app: 'fasli', enc: 'aes-gcm', salt: this.b64(salt), iv: this.b64(iv), data: btoa(bin), exportedAt: new Date().toISOString() };
  },
  async decrypt(o, pass) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.ub64(o.iv) }, await this.key(pass, this.ub64(o.salt)), this.ub64(o.data));
    return JSON.parse(new TextDecoder().decode(plain));
  },
  /* كلمة مرور النسخ تُحفظ على الجهاز فقط (لا تدخل في النسخة نفسها) */
  pass() { return localStorage.getItem('fasliBackupPass') || ''; },
  setPass(p) { try { if (p) localStorage.setItem('fasliBackupPass', p); else localStorage.removeItem('fasliBackupPass'); } catch (e) { } }
};
async function backupPayload() {
  const b = await DB.exportAll();
  const pass = Crypt.pass();
  return pass && window.crypto?.subtle ? Crypt.encrypt(b, pass) : b;
}
async function openBackupFile(o) {
  if (o?.enc !== 'aes-gcm') return o;
  const tryPass = async p => { try { return await Crypt.decrypt(o, p); } catch (e) { return null; } };
  if (Crypt.pass()) { const r = await tryPass(Crypt.pass()); if (r) return r; }
  const p = await sheet(`<p>هذه النسخة مشفّرة. أدخل كلمة مرور النسخ الاحتياطية:</p><input type="password" name="p" autocomplete="off"><button class="btn primary block mt" data-ok>فتح</button>`,
    { title: 'نسخة مشفّرة', onMount: (el, close) => { setTimeout(() => el.querySelector('[name=p]').focus(), 200); el.querySelector('[data-ok]').onclick = () => close(el.querySelector('[name=p]').value); } });
  if (!p) throw new Error('أُلغيت الاستعادة');
  const r = await tryPass(p); if (!r) throw new Error('كلمة المرور غير صحيحة');
  return r;
}
