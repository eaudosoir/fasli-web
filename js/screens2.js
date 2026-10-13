/* فصلي — التقارير، الجدول، التقويم، مدرستي، الإعدادات، القوائم، النسخ الاحتياطي */
'use strict';

/* ===== التقارير ===== */
const REPORTS = [
  ['class', 'حضور الفصل', 'checkSq'], ['student', 'طالب منفرد', 'users'], ['absence', 'الغياب والهروب', 'x'],
  ['homework', 'الواجبات', 'book'], ['behavior', 'السلوك والمشاركة', 'star'], ['admin', 'تقرير الإدارة', 'school']
];
const RANGES = [['day', 'يومي'], ['week', 'أسبوعي'], ['month', 'شهري'], ['custom', 'مخصص']];

Screens.reports = async (v, p) => {
  const type = p.type || 'class', range = p.range || (p.type === 'admin' ? 'month' : 'week');
  const classId = p.classId || (type === 'admin' ? 'all' : (App.classes.find(c => App.classStudents(c.id).length)?.id || App.classes[0].id));
  let [from, to] = range === 'custom' ? [p.from || ymd(addDays(new Date(), -7)), p.to || ymd()] : periodRange(range);
  if (range === 'term') [from, to] = periodRange('term');
  const studentId = p.studentId || App.classStudents(classId)[0]?.id;
  v.innerHTML = topbar('التقارير', { back: App.stack.length > 1 }) + `<div class="page reports">
    <div class="rep-types">${REPORTS.map(([k, l, i]) => `<button class="rep-type ${k === type ? 'on' : ''}" data-type="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</div>
    <div class="card rep-filters">
      <div class="seg small">${RANGES.map(([k, l]) => `<button data-range="${k}" class="${k === range ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${range === 'custom' ? `<div class="row gap"><label class="fld grow"><span>من</span><input type="date" name="from" value="${from}"></label><label class="fld grow"><span>إلى</span><input type="date" name="to" value="${to}"></label></div>` : `<p class="muted small center">${shortDate(from)} — ${shortDate(to)}</p>`}
      <div class="row gap"><label class="fld grow"><span>الفصل</span><select name="classId">${type !== 'student' ? `<option value="all" ${classId === 'all' ? 'selected' : ''}>كل الفصول</option>` : ''}${App.classes.map(c => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${type === 'student' ? `<label class="fld grow"><span>الطالب</span><select name="studentId">${App.classStudents(classId === 'all' ? App.classes[0].id : classId).map(s => `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}</div>
      <button class="btn primary block" data-run>${ic('chart')} عرض التقرير</button>
    </div>
    <div id="rep-out"></div></div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-type]', v).forEach(b => b.onclick = () => setP({ type: b.dataset.type, run: false, classId: b.dataset.type === 'student' && classId === 'all' ? App.classes[0].id : classId }));
  $$('[data-range]', v).forEach(b => b.onclick = () => setP({ range: b.dataset.range, run: p.run }));
  v.querySelector('[name=classId]').onchange = e => setP({ classId: e.target.value, studentId: null, run: false });
  const run = async () => {
    const q = { type, classId: v.querySelector('[name=classId]').value, studentId: v.querySelector('[name=studentId]')?.value, from: v.querySelector('[name=from]')?.value || from, to: v.querySelector('[name=to]')?.value || to };
    App.stack[App.stack.length - 1].params = { ...p, ...q, range, run: true };
    await renderReport($('#rep-out'), q);
    $('#rep-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  v.querySelector('[data-run]').onclick = run;
  if (p.run) await run();
};

async function renderReport(out, q) {
  const D = await Follow.load();
  const inR = x => x.date >= q.from && x.date <= q.to;
  const inC = x => q.classId === 'all' || (x.classId || App.stu[x.studentId]?.classId) === q.classId;
  const studs = q.classId === 'all' ? App.students : App.classStudents(q.classId);
  const att = D.att.filter(x => inR(x) && inC(x)), hw = D.hw.filter(x => inR(x) && inC(x)), notes = D.notes.filter(x => inR(x) && inC(x)), pts = D.pts.filter(x => inR(x) && inC(x)), ct = D.contacts.filter(x => inR(x) && inC(x));
  const cname = q.classId === 'all' ? 'كل الفصول' : App.cls[q.classId].full;
  const title = { admin: 'التقرير الشهري لإدارة المدرسة', class: 'تقرير حضور الفصل', student: 'تقرير طالب', absence: 'تقرير الغياب والتأخر والهروب', homework: 'تقرير المقصرين في الواجبات', behavior: 'تقرير المشاركة والسلوك والملاحظات' }[q.type];
  let header = [], rows = [], tiles = '', extra = '';
  const cnt = (arr, k) => arr.filter(a => a.status === k).length;
  if (q.type === 'class') {
    const sessions = new Set(att.map(a => `${a.date}|${a.period}|${a.classId}`)).size;
    tiles = tilesHtml([['الحصص المسجلة', sessions], ['الغياب', cnt(att, 'absent')], ['التأخر', cnt(att, 'late')], ['الاستئذان', cnt(att, 'excused')], ['الهروب', cnt(att, 'escaped')], ['نسبة الحضور', att.length ? Math.round((cnt(att, 'present') + cnt(att, 'late')) / att.length * 100) + '%' : '—']]);
    header = ['م', 'اسم الطالب', ...(q.classId === 'all' ? ['الفصل'] : []), 'حاضر', 'غائب', 'متأخر', 'مستأذن', 'هارب', 'نسبة الحضور'];
    rows = studs.map((s, i) => { const a = att.filter(x => x.studentId === s.id); return [i + 1, s.name, ...(q.classId === 'all' ? [App.className(s.classId)] : []), cnt(a, 'present'), cnt(a, 'absent'), cnt(a, 'late'), cnt(a, 'excused'), cnt(a, 'escaped'), a.length ? Math.round((cnt(a, 'present') + cnt(a, 'late')) / a.length * 100) + '%' : '—']; });
  } else if (q.type === 'student') {
    const s = App.stu[q.studentId]; if (!s) { out.innerHTML = '<div class="empty">اختر طالبًا</div>'; return; }
    const mine = arr => arr.filter(x => x.studentId === s.id);
    const a = mine(D.att.filter(inR)), h = mine(D.hw.filter(inR)), n = mine(D.notes.filter(inR)), pp = mine(D.pts.filter(inR)), c = mine(D.contacts.filter(inR));
    tiles = tilesHtml([['نسبة الحضور', a.length ? Math.round((cnt(a, 'present') + cnt(a, 'late')) / a.length * 100) + '%' : '—'], ['الغياب', cnt(a, 'absent')], ['التأخر', cnt(a, 'late')], ['الهروب', cnt(a, 'escaped')], ['تقصير الواجبات', h.length], ['النقاط', pp.reduce((x, y) => x + (y.value || 1), 0)]]);
    header = ['التاريخ', 'النوع', 'التفاصيل'];
    rows = [
      ...a.filter(x => x.status !== 'present').map(x => [x.date, 'الحضور', `${ATT[x.status].label} — الحصة ${ordinal(x.period)}`]),
      ...h.map(x => [x.date, 'الواجبات', `${x.kind}${x.note ? ' — ' + x.note : ''}${x.resolved ? ' (عولجت)' : ''}`]),
      ...pp.map(x => [x.date, 'المشاركة', `${x.type === 'participation' ? 'مشاركة' : x.reason} (+${x.value || 1})`]),
      ...n.map(x => [x.date, 'ملاحظة ' + x.kind, `${x.text}${x.action ? ' — ' + x.action : ''}`]),
      ...c.map(x => [x.date, 'تواصل', `${x.with} (${x.channel}): ${x.reason}${x.result ? ' — ' + x.result : ''}`])
    ].sort((x, y) => y[0].localeCompare(x[0])).map(r => [shortDate(r[0]), r[1], r[2]]);
    extra = `<div class="rep-who"><b>${esc(s.name)}</b><span>${esc(App.cls[s.classId]?.full)}</span></div>`;
  } else if (q.type === 'absence') {
    const recs = att.filter(a => ['absent', 'late', 'escaped', 'excused'].includes(a.status)).sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
    tiles = tilesHtml([['الغياب', cnt(att, 'absent')], ['التأخر', cnt(att, 'late')], ['الهروب', cnt(att, 'escaped')], ['الاستئذان', cnt(att, 'excused')]]);
    header = ['التاريخ', 'الحصة', 'اسم الطالب', 'الفصل', 'الحالة'];
    rows = recs.map(a => [shortDate(a.date), ordinal(a.period), App.stu[a.studentId]?.name || '—', App.className(a.classId), ATT[a.status].label]);
  } else if (q.type === 'homework') {
    const by = {}; hw.forEach(h => (by[h.studentId] ||= []).push(h));
    tiles = tilesHtml([['حالات التقصير', hw.length], ['عدد الطلاب', Object.keys(by).length], ['لم تُعالج', hw.filter(h => !h.resolved).length], ['عولجت', hw.filter(h => h.resolved).length]]);
    header = ['م', 'اسم الطالب', 'الفصل', 'عدد المرات', 'لم تعالج', 'الأنواع', 'آخر تاريخ'];
    rows = Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([sid, arr], i) => [i + 1, App.stu[sid]?.name || '—', App.className(App.stu[sid]?.classId), arr.length, arr.filter(h => !h.resolved).length, [...new Set(arr.map(h => h.kind))].join('، '), shortDate(arr.map(h => h.date).sort().pop())]);
  } else if (q.type === 'admin') {
    const cl = (q.classId === 'all' ? App.classes : [App.cls[q.classId]]).filter(c => App.classStudents(c.id).length);
    const allAtt = D.att.filter(inR), allHw = D.hw.filter(inR), allNotes = D.notes.filter(inR), allPts = D.pts.filter(inR);
    const sesN = (await DB.all('sessions')).filter(x => inR(x) && x.complete);
    tiles = tilesHtml([['حصص معتمدة', sesN.length], ['حصص انتظار', sesN.filter(x => x.cover).length], ['الغياب', cnt(allAtt, 'absent')], ['التأخر', cnt(allAtt, 'late')], ['الهروب', cnt(allAtt, 'escaped')], ['تقصير الواجبات', allHw.length], ['ملاحظات مهمة', allNotes.filter(n => n.importance === 'high').length], ['نقاط التحفيز', allPts.reduce((a, b) => a + (b.value || 1), 0)]]);
    header = ['الفصل', 'الطلاب', 'نسبة الحضور', 'غياب', 'تأخر', 'هروب', 'تقصير واجبات', 'ملاحظات', 'درس الخطة'];
    rows = cl.map(c => { const ids = new Set(App.classStudents(c.id).map(s => s.id)); const a = allAtt.filter(x => ids.has(x.studentId)); return [c.name, ids.size, a.length ? Math.round((cnt(a, 'present') + cnt(a, 'late')) / a.length * 100) + '%' : '—', cnt(a, 'absent'), cnt(a, 'late'), cnt(a, 'escaped'), allHw.filter(x => ids.has(x.studentId)).length, allNotes.filter(x => ids.has(x.studentId)).length, Curr.status(c.id).label]; });
    const attn = {}; allAtt.forEach(a => { if (['absent', 'escaped'].includes(a.status)) attn[a.studentId] = (attn[a.studentId] || 0) + 1; });
    const watch = Object.entries(attn).filter(([sid, n]) => n >= 3 && App.stu[sid]).sort((a, b) => b[1] - a[1]).slice(0, 15);
    extra = watch.length ? `<div class="rep-watch"><b>${ic('alert')} طلاب يحتاجون متابعة الإدارة (غياب أو هروب 3 مرات فأكثر)</b><ol>${watch.map(([sid, n]) => `<li>${esc(App.stu[sid].name)} — ${esc(App.className(App.stu[sid].classId))} (${n})</li>`).join('')}</ol></div>` : '';
    out._adminText = `سعادة وكيل شؤون الطلاب ${App.S.vpStudents || ''} المحترم\nالسلام عليكم ورحمة الله وبركاته\n\nملخص ${title} (${q.from} إلى ${q.to}):\n` + rows.map(r => `• ${r[0]}: حضور ${r[2]}، غياب ${r[3]}، تأخر ${r[4]}، هروب ${r[5]}`).join('\n') + (watch.length ? `\n\nطلاب يحتاجون متابعة:\n` + watch.map(([sid, n]) => `- ${App.stu[sid].name} (${App.className(App.stu[sid].classId)}) ${n} مرات`).join('\n') : '') + `\n\n${App.S.teacherName}\nمعلم ${App.S.subject}`;
  } else if (q.type === 'behavior') {
    tiles = tilesHtml([['المشاركات', pts.filter(x => x.type === 'participation').length], ['سلوك إيجابي', pts.filter(x => x.type === 'positive').length], ['ملاحظات سلوكية', notes.filter(n => n.kind === 'سلوكية').length], ['ملاحظات تعليمية', notes.filter(n => n.kind === 'تعليمية').length], ['تواصل', ct.length]]);
    header = ['م', 'اسم الطالب', ...(q.classId === 'all' ? ['الفصل'] : []), 'المشاركات', 'نقاط إيجابية', 'مجموع النقاط', 'ملاحظات', 'عالية الأهمية'];
    rows = studs.map(s => { const pp = pts.filter(x => x.studentId === s.id), nn = notes.filter(x => x.studentId === s.id); return [0, s.name, ...(q.classId === 'all' ? [App.className(s.classId)] : []), pp.filter(x => x.type === 'participation').length, pp.filter(x => x.type === 'positive').length, pp.reduce((a, b) => a + (b.value || 1), 0), nn.length, nn.filter(x => x.importance === 'high').length]; })
      .filter(r => r.slice(-5).some(x => x)).sort((a, b) => b[b.length - 3] - a[a.length - 3]).map((r, i) => { r[0] = i + 1; return r; });
  }
  const rangeTx = q.from === q.to ? `${shortDate(q.from)} (${hijri(parseYmd(q.from))})` : `من ${shortDate(q.from)} إلى ${shortDate(q.to)}`;
  out.innerHTML = `<div class="report print-area">
    <div class="rep-head"><img src="img/logo.svg" alt=""><div><h2>${title}</h2><p>${esc(App.S.school)} · ${esc(cname)} · ${rangeTx}</p></div></div>
    ${extra}${tiles}
    ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty sm">لا توجد بيانات في هذه الفترة</div>'}
    <div class="rep-sign"><span>المعلم: ${esc(App.S.teacherName)}</span><span>التوقيع: ..................</span><span>${hijri(new Date())}</span></div>
  </div>
  <div class="rep-actions no-print"><button class="btn primary grow" data-print>${ic('print')} طباعة / PDF</button><button class="btn soft grow" data-xlsx>${ic('download')} Excel</button><button class="btn ghost" data-share aria-label="مشاركة">${ic('share')}</button></div>
  ${q.type === 'admin' ? `<button class="btn wa block no-print" data-vp>${ic('wa')} إرسال الملخص لوكيل شؤون الطلاب</button>` : ''}`;
  out.querySelector('[data-vp]')?.addEventListener('click', () => Native.open(`https://wa.me/${phoneIntl(App.S.vpStudentsPhone)}?text=${encodeURIComponent(out._adminText || '')}`));
  const fname = `${title}-${q.from}`.replace(/\s+/g, '-');
  out.querySelector('[data-print]').onclick = () => { logUse('export'); Native.print(title); };
  const xlsx = () => buildXlsx(title.slice(0, 28), header, rows, `${title} — ${App.S.school} — ${cname} — ${rangeTx}`);
  out.querySelector('[data-xlsx]').onclick = async () => { logUse('export'); Native.saveFile(fname + '.xlsx', await xlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); };
  out.querySelector('[data-share]').onclick = async () => Native.shareFile(fname + '.xlsx', await xlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
const tilesHtml = arr => `<div class="rep-tiles">${arr.map(([l, v]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>`;

/* ===== الجدول الدراسي ===== */
Screens.timetable = async (v, p) => {
  const tab = p.tab || 'grid';
  const P = App.bell.periods;
  const count = App.timetable.filter(t => t.classId !== 'wait').length;
  const waits = App.timetable.filter(t => t.classId === 'wait').length;
  const cell = (d, n) => App.timetable.find(t => t.day === d && t.period === n);
  const today = Sched.dayIdx();
  let body;
  if (tab === 'grid') {
    body = `<div class="tt-count ${count === 18 ? 'ok' : ''}"><b>${count}</b> / 18 حصة ${count === 18 ? '✓' : ''}${waits ? ` <span class="muted">+ ${waits} انتظار</span>` : ''}<small>اضغط أي خانة لإضافة حصة أو تغييرها</small></div>
    <div class="tt-wrap"><table class="tt"><thead><tr><th></th>${P.map(x => `<th><b>${x.n}</b><small>${fmt12(x.start).replace(/ [صم]/, '')}</small></th>${x.n === 3 ? '<th class="brk">فسحة</th>' : ''}`).join('')}</tr></thead>
    <tbody>${DAYS.map((d, di) => `<tr class="${di === today ? 'today' : ''}"><th>${d}</th>${P.map(x => { const c = cell(di, x.n); return `<td><button class="tt-cell ${c ? (c.classId === 'wait' ? 'wait' : 'on g' + App.cls[c.classId]?.grade) : ''}" data-cell="${di}|${x.n}">${c ? esc(App.className(c.classId)) : '+'}</button></td>${x.n === 3 ? '<td class="brk"></td>' : ''}`; }).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="tt-legend"><span class="g4">رابع</span><span class="g5">خامس</span><span class="g6">سادس</span><span class="gw">انتظار</span></div>
    <section class="card"><div class="card-h"><h3>${ic('bell')} المناوبة والإشراف</h3><button class="btn xs soft" data-duty-add>${ic('plus')} إضافة</button></div>
      ${(App.S.duties || []).length ? (App.S.duties || []).map((d, i) => `<div class="rec"><span class="rec-ic">${ic('bell')}</span><div class="grow"><b>${esc(d.label)}</b><small>${DAYS[d.day]} · ${fmt12(d.start)} – ${fmt12(d.end)}</small></div><button class="icon-btn sm" data-duty-del="${i}">${ic('trash')}</button></div>`).join('') : '<p class="muted pad">لا يوجد</p>'}</section>
    <section class="card"><div class="card-h"><h3>توزيع حصصك على الفصول</h3></div><div class="cls-dist">${App.classes.map(c => { const n = App.timetable.filter(t => t.classId === c.id).length; return `<div class="${n ? 'on' : ''}"><b>${esc(c.name)}</b><span>${n}</span></div>`; }).join('')}</div></section>`;
  } else {
    body = `<section class="card"><div class="card-h"><h3>${ic('bell')} أوقات الجرس</h3></div>
      ${P.map(x => `<div class="bell-row"><b>الحصة ${ordinal(x.n)}</b><input type="time" data-bs="${x.n}" value="${x.start}"><span>—</span><input type="time" data-be="${x.n}" value="${x.end}"></div>`).join('')}
      <div class="bell-row brk"><b>الفسحة</b><input type="time" name="bs" value="${App.bell.breakStart}"><span>—</span><input type="time" name="be" value="${App.bell.breakEnd}"></div>
      <div class="row gap"><button class="btn primary grow" data-save-bell>حفظ الأوقات</button><button class="btn ghost" data-reset-bell>الافتراضي</button></div></section>`;
  }
  v.innerHTML = topbar('جدولي الدراسي') + `<div class="page"><div class="seg">${[['grid', 'الجدول الأسبوعي'], ['bell', 'أوقات الجرس']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  bindBack(v);
  $$('[data-tab]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { tab: b.dataset.tab }; App.render(); });
  $$('[data-cell]', v).forEach(b => b.onclick = async () => {
    const [d, n] = b.dataset.cell.split('|').map(Number); const c = cell(d, n);
    const r = await sheet(`<p class="muted">${DAYS[d]} — الحصة ${ordinal(n)}</p><div class="class-grid">${App.classes.map(x => `<button class="class-tile ${c?.classId === x.id ? 'on' : ''}" data-pick="${x.id}"><b>${esc(x.name)}</b></button>`).join('')}<button class="class-tile ${c?.classId === 'wait' ? 'on' : ''}" data-pick="wait"><b>انتظار</b></button></div>
      <label class="fld"><span>المادة</span><input name="sub" value="${esc(c?.subject || App.S.subject)}"></label>
      ${c ? `<button class="btn danger-ghost block" data-clear>${ic('trash')} حذف الحصة</button>` : ''}`, {
      title: 'تحديد الحصة', onMount: (el, close) => {
        $$('[data-pick]', el).forEach(x => x.onclick = () => close({ classId: x.dataset.pick, subject: el.querySelector('[name=sub]').value.trim() }));
        el.querySelector('[data-clear]')?.addEventListener('click', () => close('clear'));
      }
    });
    if (!r) return;
    if (r === 'clear') await DB.del('timetable', c.id);
    else await DB.put('timetable', { id: `${d}|${n}`, day: d, period: n, classId: r.classId, subject: r.classId === 'wait' ? 'انتظار' : (r.subject || App.S.subject) });
    App.timetable = await DB.all('timetable'); App.syncNative(); App.render();
  });
  $$('[data-duty-del]', v).forEach(b => b.onclick = async () => { const a = [...(App.S.duties || [])]; a.splice(+b.dataset.dutyDel, 1); await App.set('duties', a); App.render(); });
  v.querySelector('[data-duty-add]')?.addEventListener('click', async () => {
    const r = await sheet(`<label class="fld"><span>الوصف</span><input name="l" placeholder="إشراف — المقصف"></label>
      <label class="fld"><span>اليوم</span><select name="d">${DAYS.map((x, i) => `<option value="${i}">${x}</option>`).join('')}</select></label>
      <div class="row gap"><label class="fld grow"><span>من</span><input type="time" name="s" value="07:00"></label><label class="fld grow"><span>إلى</span><input type="time" name="e" value="07:20"></label></div>
      <button class="btn primary block" data-ok>حفظ</button>`, { title: 'مناوبة أو إشراف', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close({ label: el.querySelector('[name=l]').value.trim() || 'إشراف', day: +el.querySelector('[name=d]').value, start: el.querySelector('[name=s]').value, end: el.querySelector('[name=e]').value }) });
    if (r) { await App.set('duties', [...(App.S.duties || []), r]); App.render(); }
  });
  v.querySelector('[data-save-bell]')?.addEventListener('click', async () => {
    const nb = { periods: P.map(x => ({ n: x.n, start: $(`[data-bs="${x.n}"]`, v).value, end: $(`[data-be="${x.n}"]`, v).value })), breakStart: $('[name=bs]', v).value, breakEnd: $('[name=be]', v).value };
    if (nb.periods.some(x => !x.start || !x.end || toMin(x.end) <= toMin(x.start))) return toast('تحقق من الأوقات', 'bad');
    App.bell = nb; await App.set('bell', nb); App.syncNative(); toast('حُفظت أوقات الجرس', 'ok');
  });
  v.querySelector('[data-reset-bell]')?.addEventListener('click', async () => { App.bell = DEFAULT_BELL; await App.set('bell', DEFAULT_BELL); App.syncNative(); App.render(); });
};

/* ===== مهام التقويم ===== */
const TASK_KINDS = [['task', 'مهمة', '📌'], ['meet', 'اجتماع', '👥'], ['exam', 'اختبار', '📝'], ['due', 'موعد تسليم', '⏳'], ['event', 'مناسبة', '🎉']];
const TASK_REMIND = [['', 'بدون تذكير'], ['0', 'في وقتها'], ['15', 'قبل 15 دقيقة'], ['60', 'قبل ساعة'], ['1440', 'قبل يوم']];
const Tasks = {
  all() { return App.S.tasks || []; },
  on(d) { return this.all().filter(t => t.date === d).sort((a, b) => (a.done - b.done) || (a.time || '99').localeCompare(b.time || '99')); },
  open() { return this.all().filter(t => !t.done); },
  async save(arr) { await App.set('tasks', arr); App.syncNative(); },
  kind(k) { return TASK_KINDS.find(x => x[0] === k) || TASK_KINDS[0]; },
  /* تذكيرات الجهاز للمهام القادمة */
  reminders() {
    const now = Date.now();
    return this.open().filter(t => t.remind !== '' && t.remind != null).map(t => {
      const [h, m] = (t.time || '07:00').split(':').map(Number); const d = parseYmd(t.date); d.setHours(h, m, 0, 0);
      return { at: d.getTime() - (+t.remind) * 60000, title: `${this.kind(t.kind)[2]} ${t.title}`, body: `${dayName(d)} ${shortDate(t.date).split(' ')[1]}${t.time ? ' · ' + fmt12(t.time) : ''}${t.note ? ' — ' + t.note : ''}` };
    }).filter(r => r.at > now).sort((a, b) => a.at - b.at).slice(0, 30);
  },
  async toggle(id) { await this.save(this.all().map(t => t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : new Date().toISOString() } : t)); }
};
async function taskSheet(t, date) {
  const n = t || { date: date || ymd(), kind: 'task', remind: '' };
  const r = await sheet(`<span class="lbl">النوع</span><div class="chips" data-chips="kind">${TASK_KINDS.map(([k, l, e]) => `<button type="button" class="chip ${n.kind === k ? 'on' : ''}" data-v="${k}">${e} ${l}</button>`).join('')}</div>
    <label class="fld"><span>المهمة</span><div class="voice-fld"><input name="title" value="${esc(n.title || '')}" placeholder="مثال: تسليم كشف الدرجات للوكيل">${micBtn('[name=title]')}</div></label>
    <div class="row gap"><label class="fld grow"><span>التاريخ</span><input type="date" name="date" value="${n.date}"></label><label class="fld grow"><span>الوقت (اختياري)</span><input type="time" name="time" value="${n.time || ''}"></label></div>
    <label class="fld"><span>التذكير على الجهاز</span><select name="remind">${TASK_REMIND.map(([k, l]) => `<option value="${k}" ${String(n.remind ?? '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="fld"><span>ملاحظة (اختياري)</span><input name="note" value="${esc(n.note || '')}"></label>
    <div class="row gap"><button class="btn primary grow" data-ok>${ic('check')} حفظ</button>${t ? `<button class="btn danger-ghost" data-del>${ic('trash')} حذف</button>` : ''}</div>`, {
    title: t ? 'تعديل مهمة' : 'مهمة جديدة', onMount: (el, close) => {
      bindChips(el); bindMic(el);
      if (!t) setTimeout(() => el.querySelector('[name=title]').focus(), 250);
      el.querySelector('[data-ok]').onclick = () => {
        const title = el.querySelector('[name=title]').value.trim();
        if (!title) return toast('اكتب المهمة', 'bad');
        const remind = el.querySelector('[name=remind]').value;
        if (remind !== '' && !el.querySelector('[name=time]').value && remind !== '1440') toast('بدون وقت سيكون التذكير الساعة 7:00 ص');
        close({ ...n, id: n.id || uid(), title, kind: chipVal(el, 'kind') || 'task', date: el.querySelector('[name=date]').value || ymd(), time: el.querySelector('[name=time]').value, remind, note: el.querySelector('[name=note]').value.trim(), done: !!n.done, at: n.at || new Date().toISOString() });
      };
      el.querySelector('[data-del]')?.addEventListener('click', () => close('__del'));
    }
  });
  if (!r) return false;
  if (r === '__del') {
    const old = Tasks.all(); await Tasks.save(old.filter(x => x.id !== t.id));
    toast('حُذفت المهمة', '', { undo: async () => { await Tasks.save(old); App.render(); } }); return true;
  }
  await Tasks.save([...Tasks.all().filter(x => x.id !== r.id), r]);
  if (Native.has() && r.remind !== '') Native.call('requestNotificationPermission');
  toast(t ? 'عُدّلت المهمة' : `${Tasks.kind(r.kind)[2]} أضيفت المهمة إلى ${shortDate(r.date)}`, 'ok'); return true;
}
const taskRow = t => `<div class="task ${t.done ? 'done' : ''} ${!t.done && t.date < ymd() ? 'late' : ''}"><button class="task-chk" data-tdone="${t.id}" aria-label="تم">${t.done ? ic('check') : ''}</button>
  <button class="task-tx" data-tedit="${t.id}"><b>${Tasks.kind(t.kind)[2]} ${esc(t.title)}</b><small>${t.time ? fmt12(t.time) : 'طوال اليوم'}${t.remind !== '' && t.remind != null ? ` · ${ic('bell')}` : ''}${t.note ? ' · ' + esc(t.note) : ''}${!t.done && t.date < ymd() ? ' · متأخرة' : ''}</small></button></div>`;
function bindTasks(root) {
  $$('[data-tdone]', root).forEach(b => b.onclick = async () => { await Tasks.toggle(b.dataset.tdone); if (navigator.vibrate) navigator.vibrate(12); App.render(); });
  $$('[data-tedit]', root).forEach(b => b.onclick = async () => { if (await taskSheet(Tasks.all().find(x => x.id === b.dataset.tedit))) App.render(); });
}

/* ===== التقويم ===== */
Screens.calendar = async (v, p) => {
  const base = p.month ? parseYmd(p.month) : new Date();
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  const sel = p.sel || ymd();
  const [from, to] = [ymd(first), ymd(new Date(y, m, days))];
  const [att, hw, notes, ses] = await Promise.all([DB.range('attendance', 'date', from, to), DB.range('homework', 'date', from, to), DB.range('notes', 'date', from, to), DB.range('sessions', 'date', from, to)]);
  const tasksM = Tasks.all().filter(t => t.date >= from && t.date <= to);
  const has = d => ({ t: tasksM.some(x => x.date === d && !x.done), s: ses.some(x => x.date === d), a: att.some(x => x.date === d && x.status !== 'present'), h: hw.some(x => x.date === d), n: notes.some(x => x.date === d) });
  const hm = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'long', year: 'numeric' });
  const hTitle = [...new Set([hm.format(first), hm.format(new Date(y, m, days))])].join(' – ');
  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, m, d), k = ymd(dt), h = has(k), we = dt.getDay() >= 5;
    cells += `<button class="cal-d ${k === ymd() ? 'today' : ''} ${k === sel ? 'sel' : ''} ${we ? 'we' : ''}" data-d="${k}"><b>${d}</b><small>${hijriDayNum(dt)}</small><i>${h.t ? '<em class="t"></em>' : ''}${h.s ? '<em class="s"></em>' : ''}${h.a ? '<em class="a"></em>' : ''}${h.h ? '<em class="h"></em>' : ''}${h.n ? '<em class="n"></em>' : ''}</i></button>`;
  }
  const sd = parseYmd(sel);
  const dl = Sched.lessonsOn(sd);
  const dAtt = att.filter(x => x.date === sel), dHw = hw.filter(x => x.date === sel), dN = notes.filter(x => x.date === sel);
  v.innerHTML = topbar('التقويم') + `<div class="page">
    <div class="card cal"><div class="cal-h"><button class="icon-btn" data-mv="1">${ic('back')}</button><div><b>${new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'long', year: 'numeric' }).format(first)}</b><small>${hTitle}</small></div><button class="icon-btn" data-mv="-1">${ic('chev')}</button></div>
      <div class="cal-w">${['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-g">${cells}</div>
      <div class="cal-legend"><span><em class="t"></em>مهام</span><span><em class="s"></em>حضور معتمد</span><span><em class="a"></em>غياب/تأخر</span><span><em class="h"></em>واجبات</span><span><em class="n"></em>ملاحظات</span></div></div>
    <section class="card"><div class="card-h"><h3>${ic('checkSq')} مهام ${dayName(sd)}</h3><button class="btn xs gold" data-tadd>${ic('plus')} مهمة</button></div>
      ${Tasks.on(sel).length ? `<div class="task-list">${Tasks.on(sel).map(taskRow).join('')}</div>` : `<p class="muted pad">لا مهام في هذا اليوم — أضف اجتماعًا أو موعد تسليم أو أي تذكير</p>`}
      ${(() => { const late = Tasks.open().filter(t => t.date < ymd()); return late.length && sel === ymd() ? `<p class="muted small">${ic('alert')} مهام متأخرة لم تُنجز:</p><div class="task-list">${late.map(taskRow).join('')}</div>` : ''; })()}</section>
    <section class="card"><div class="card-h"><h3>${dayName(sd)} ${greg(sd)}</h3><small class="muted">${hijri(sd)}</small></div>
      ${dl.length ? `<div class="menu-list">${dl.map(l => `<button class="menu-item" data-ses="${l.entry.classId}|${l.entry.period}"><span class="mi-ic num-ic">${l.entry.period}</span><span class="mi-tx"><b>${esc(App.className(l.entry.classId))}</b><small>${ses.some(s => s.date === sel && s.period === l.entry.period && s.complete) ? '✓ الحضور معتمد' : 'لم يُعتمد الحضور'}</small></span>${ic('chev', 'mi-ch')}</button>`).join('')}</div>` : '<p class="muted pad">لا حصص في هذا اليوم</p>'}
      <div class="rep-tiles sm"><div><b>${dAtt.filter(a => a.status === 'absent').length}</b><small>غياب</small></div><div><b>${dAtt.filter(a => a.status === 'late').length}</b><small>تأخر</small></div><div><b>${dHw.length}</b><small>واجبات</small></div><div><b>${dN.length}</b><small>ملاحظات</small></div></div>
    </section></div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-mv]', v).forEach(b => b.onclick = () => setP({ month: ymd(new Date(y, m + (+b.dataset.mv), 1)) }));
  $$('[data-d]', v).forEach(b => b.onclick = () => setP({ sel: b.dataset.d, month: ymd(first) }));
  $$('[data-ses]', v).forEach(b => b.onclick = () => { const [c, pp] = b.dataset.ses.split('|'); App.go('session', { classId: c, period: +pp, date: sel }); });
  v.querySelector('[data-tadd]').onclick = async () => { if (await taskSheet(null, sel)) App.render(); };
  bindTasks(v);
};

/* ===== التكامل مع مدرستي (استيراد التقارير الرسمية) ===== */
Screens.madrasati = async (v) => {
  const logs = (await DB.all('imports')).sort((a, b) => b.at.localeCompare(a.at));
  v.innerHTML = topbar('التكامل مع مدرستي') + `<div class="page">
    <div class="info-card">${ic('shield')}<div><b>بالطريقة الرسمية فقط</b><p>صدّر تقرير الواجبات أو الاختبارات من منصة مدرستي (Excel)، ثم استورده هنا ليطابقه فصلي مع طلابك تلقائيًا بدل إدخاله يدويًا. لا يتجاوز التطبيق تسجيل الدخول أو أي حماية في المنصة، ولا يحفظ بيانات دخولك.</p></div></div>
    <div class="big-actions"><button class="big-act" data-imp="hw">${ic('book')}<b>استيراد تقرير الواجبات</b><small>من لم يسلّم يُسجل في متابعة الواجبات</small></button>
      <button class="big-act" data-imp="test">${ic('school')}<b>استيراد تقرير اختبار</b><small>الدرجات تظهر في ملف كل طالب</small></button></div>
    <section class="card"><div class="card-h"><h3>${ic('history')} سجل الاستيراد</h3></div>${logs.length ? logs.map(l => `<div class="rec"><span class="rec-ic">${ic(l.kind === 'hw' ? 'book' : 'school')}</span><div><b>${esc(l.title)}</b><small>${shortDate(l.at.slice(0, 10))} · ${esc(l.className)} · طوبق ${l.matched} من ${l.total}</small></div><button class="icon-btn sm" data-undo-imp="${l.id}" aria-label="إلغاء الاستيراد">${ic('trash')}</button></div>`).join('') : '<p class="muted pad">لم تستورد أي تقرير بعد</p>'}</section></div>`;
  bindBack(v);
  $$('[data-imp]', v).forEach(b => b.onclick = () => madrasatiImport(b.dataset.imp));
  /* إلغاء استيراد كامل: يحذف كل الدرجات أو حالات الواجب التي أنشأها */
  $$('[data-undo-imp]', v).forEach(b => b.onclick = async () => {
    const l = logs.find(x => x.id === b.dataset.undoImp); if (!l) return;
    const store = l.kind === 'hw' ? 'homework' : 'grades';
    const recs = (await DB.all(store)).filter(x => x.importId === l.id || (!x.importId && x.source === 'مدرستي' && x.classId === l.classId && (l.kind === 'hw' ? x.note === `مدرستي: ${l.title}` : x.title === l.title) && (!l.date || x.date === l.date)));
    if (!await confirmBox(`إلغاء استيراد «${esc(l.title)}»؟<br><small>سيُحذف ${recs.length} ${l.kind === 'hw' ? 'حالة واجب' : 'درجة'} أُضيفت منه.</small>`, { ok: 'إلغاء الاستيراد', danger: true })) return;
    for (const x of recs) await DB.del(store, x.id);
    await DB.del('imports', l.id); toast(`أُلغي الاستيراد وحُذف ${recs.length} سجل`, 'ok'); App.render();
  });
};

async function madrasatiImport(kind, src, srcName) {
  let rows, f = { name: srcName || 'صفحة المنصة' };
  if (Array.isArray(src)) rows = src;
  else {
    f = src instanceof Blob ? src : await pickFile('.xlsx,.xls,.csv');
    if (!f) return;
    try { rows = await readSheetFile(f); } catch (e) { return toast(esc(e.message), 'bad'); }
  }
  const hi = rows.findIndex(r => r.some(c => /اسم/.test(c)));
  if (hi < 0) return toast('لم أجد عمود الأسماء في التقرير', 'bad');
  const H = rows[hi].map(x => String(x).trim());
  const data = rows.slice(hi + 1).filter(r => String(r[H.findIndex(h => /اسم/.test(h))] || '').trim());
  const nameCol = H.findIndex(h => /اسم/.test(h));
  const guessCol = kind === 'hw' ? H.findIndex(h => /حالة|التسليم|مسلم|الحل/.test(h)) : H.findIndex(h => /درجة|الدرجة|النتيجة|العلامة/.test(h));
  const r = await sheet(`<p class="muted small">${esc(f.name)} — ${data.length} صف</p>
    <label class="fld"><span>الفصل</span><select name="c">${App.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>عنوان ${kind === 'hw' ? 'الواجب' : 'الاختبار'}</span><input name="t" placeholder="${kind === 'hw' ? 'واجب الدرس الأول' : 'اختبار الوحدة الأولى'}"></label>
    <label class="fld"><span>التاريخ</span><input type="date" name="d" value="${ymd()}"></label>
    <label class="fld"><span>عمود ${kind === 'hw' ? 'حالة التسليم' : 'الدرجة'}</span><select name="col">${H.map((h, i) => `<option value="${i}" ${i === guessCol ? 'selected' : ''}>${esc(h || 'عمود ' + (i + 1))}</option>`).join('')}</select></label>
    ${kind === 'test' ? `<label class="fld"><span>الدرجة العظمى</span><input name="max" inputmode="numeric" placeholder="10"></label>` : ''}
    <button class="btn primary block" data-ok>مطابقة الطلاب</button>`, {
    title: kind === 'hw' ? 'تقرير الواجبات' : 'تقرير الاختبار', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close({
      c: el.querySelector('[name=c]').value, t: el.querySelector('[name=t]').value.trim() || (kind === 'hw' ? 'واجب منصة مدرستي' : 'اختبار منصة مدرستي'), d: el.querySelector('[name=d]').value || ymd(), col: +el.querySelector('[name=col]').value, max: el.querySelector('[name=max]')?.value
    })
  });
  if (!r) return;
  const studs = App.classStudents(r.c);
  const matches = data.map(row => {
    const name = String(row[nameCol]).trim(), val = String(row[r.col] ?? '').trim();
    let best = null, bs = 0; studs.forEach(s => { const sc = nameScore(name, s.name); if (sc > bs) { bs = sc; best = s; } });
    return { name, val, s: bs >= 0.6 ? best : null, score: bs };
  });
  const notDone = x => kind === 'hw' && (/لم|غير|متأخر|لا/.test(x.val) || x.val === '' || x.val === '0' || x.val === '-');
  const ok = matches.filter(m => m.s);
  const conf = await sheet(`<div class="rep-tiles sm"><div><b>${ok.length}</b><small>طوبق</small></div><div><b>${matches.length - ok.length}</b><small>لم يطابق</small></div>${kind === 'hw' ? `<div><b>${ok.filter(notDone).length}</b><small>لم يسلّم</small></div>` : ''}</div>
    <div class="match-list">${matches.map(m => `<div class="match ${m.s ? '' : 'miss'} ${notDone(m) ? 'nd' : ''}"><span>${esc(m.name)}</span><span>${m.s ? '← ' + esc(shortName(m.s.name)) : 'غير موجود'}</span><b>${esc(m.val || '—')}</b></div>`).join('')}</div>
    <button class="btn primary block" data-ok>${ic('check')} اعتماد الاستيراد</button>`, { title: 'مراجعة المطابقة', wide: true, onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close(true) });
  if (!conf) return;
  let n = 0; const impId = uid();
  for (const m of ok) {
    if (kind === 'hw' && notDone(m)) { await DB.put('homework', { id: uid(), studentId: m.s.id, classId: r.c, date: r.d, period: 0, kind: 'لم يسلّم المهمة/النشاط', note: `مدرستي: ${r.t}`, source: 'مدرستي', importId: impId, resolved: false, at: new Date().toISOString() }); n++; }
    if (kind === 'test') { await DB.put('grades', { id: uid(), studentId: m.s.id, classId: r.c, date: r.d, title: r.t, score: m.val, max: r.max || '', source: 'مدرستي', importId: impId, at: new Date().toISOString() }); n++; }
  }
  await DB.put('imports', { id: impId, kind, date: r.d, title: r.t, classId: r.c, className: App.className(r.c), total: matches.length, matched: ok.length, created: n, at: new Date().toISOString() });
  toast(kind === 'hw' ? `سُجّل ${n} طالب لم يسلّم` : `استوردت ${n} درجة`, 'ok'); App.render();
}

/* ===== الإعدادات ===== */
Screens.settings = async (v) => {
  const S = App.S;
  const hasPin = !!(await DB.getSetting('pinHash'));
  const f = (k, l, extra = '') => `<label class="fld"><span>${l}</span><input data-k="${k}" value="${esc(S[k] || '')}" ${extra}></label>`;
  v.innerHTML = topbar('الإعدادات') + `<div class="page settings">
    <div class="id-card"><img src="img/logo.svg" alt=""><div><b>${esc(S.teacherName)}</b><small>${esc(S.subject)} · ${esc(S.school)}</small></div></div>
    <section class="card"><div class="card-h"><h3>${ic('users')} بيانات المعلم</h3></div>
      ${f('teacherName', 'الاسم')}${f('subject', 'المادة')}${f('school', 'المدرسة')}${f('teacherPhone', 'جوالك', 'dir="ltr" inputmode="tel"')}</section>
    <section class="card"><div class="card-h"><h3>${ic('school')} جهات التواصل في المدرسة</h3></div>
      ${f('vpStudents', 'وكيل شؤون الطلاب')}${f('vpStudentsPhone', 'جوال الوكيل', 'dir="ltr" inputmode="tel" placeholder="05xxxxxxxx"')}
      ${f('counselor', 'المرشد الطلابي')}${f('counselorPhone', 'جوال المرشد', 'dir="ltr" inputmode="tel" placeholder="05xxxxxxxx"')}</section>
    <section class="card"><div class="card-h"><h3>${ic('timer')} مساعد الحصة والتنبيهات</h3></div>
      <label class="switch"><input type="checkbox" data-b="notify" ${S.notify !== false ? 'checked' : ''}><span></span> تنبيهات الجهاز قبل نهاية الحصة</label>
      <label class="fld"><span>التنبيه قبل النهاية بـ</span><select data-n="alertMinutes">${[3, 5, 7, 10].map(n => `<option value="${n}" ${+S.alertMinutes === n ? 'selected' : ''}>${n} دقائق</option>`).join('')}</select></label>
      <label class="switch"><input type="checkbox" data-b="startAlert" ${S.startAlert ? 'checked' : ''}><span></span> تنبيه عند بداية كل حصة</label>
      <label class="switch"><input type="checkbox" data-b="autoOpen" ${S.autoOpen ? 'checked' : ''}><span></span> فتح الفصل الصحيح تلقائيًا عند بداية الحصة</label>
      ${Native.has() ? `<button class="btn soft block" data-test-notif>${ic('bell')} تجربة التنبيه الآن</button>` : '<p class="muted small">تنبيهات الجهاز تعمل في تطبيق الأندرويد.</p>'}</section>
    <section class="card"><div class="card-h"><h3>${ic('eye')} المظهر</h3></div>
      <div class="theme-pick">${[['light', '☀️', 'نهاري'], ['dark', '🌙', 'ليلي'], ['auto', '🌗', 'تلقائي']].map(([k, e, l]) => `<button class="${(S.theme || 'light') === k ? 'on' : ''}" data-theme-set="${k}"><i>${e}</i>${l}</button>`).join('')}</div>
      <p class="muted small">التلقائي: ليلي من المغرب حتى الفجر.</p>
      <label class="switch"><input type="checkbox" data-calm ${S.calm ? 'checked' : ''}><span></span> وضع الحصة الهادئ (أزرار وخط أكبر أثناء الحصة)</label></section>
    <section class="card"><div class="card-h"><h3>${ic('lock')} الخصوصية والقفل</h3></div>
      <label class="switch"><input type="checkbox" data-privacy ${S.privacy ? 'checked' : ''}><span></span> وضع الخصوصية: إخفاء الأرقام والملاحظات الحساسة (المسها لإظهارها)</label>
      <label class="switch"><input type="checkbox" data-lock ${S.lockEnabled && hasPin ? 'checked' : ''}><span></span> قفل التطبيق برمز سري</label>
      ${S.lockEnabled && hasPin ? (Native.has() && Native.call('biometricStatus') === 'ok' ? `<label class="switch"><input type="checkbox" data-bio ${S.bioUnlock ? 'checked' : ''}><span></span> ${ic('face')} الفتح ببصمة الوجه أو الإصبع</label>` : (Native.has() ? `<p class="muted small">${ic('face')} لم تُفعَّل بصمة الوجه أو الإصبع في جوالك بعد — فعّلها من إعدادات الجوال ثم ارجع هنا.</p>` : '')) : ''}
      ${S.lockEnabled && hasPin ? `<label class="fld"><span>القفل بعد الخروج من التطبيق بـ</span><select data-n="lockAfterMin">${[0, 1, 3, 5, 10].map(n => `<option value="${n}" ${+S.lockAfterMin === n ? 'selected' : ''}>${n ? n + ' دقائق' : 'فورًا'}</option>`).join('')}</select></label><button class="btn ghost block" data-chpin>تغيير الرمز</button>` : ''}
      <p class="muted small">${ic('eye')} أرقام أولياء الأمور وأرقام الهوية لا تظهر في القوائم العامة، فقط داخل ملف الطالب. الرمز السري لا يُحفظ داخل النسخ الاحتياطية.</p></section>
    <div class="menu-list">${menuItem('lists', 'list', 'القوائم', 'السلوك الإيجابي والسلبي وأنواع التقصير')}${menuItem('backup', 'shield', 'النسخ الاحتياطي والاستعادة', 'احفظ بياناتك في ملف')}${menuItem('timetable', 'grid', 'الجدول وأوقات الجرس', '')}${menuItem('merge', 'merge', 'ترتيب الخميس', 'دمج الفصول بالتناوب')}</div>
    <p class="foot-sign">فصلي 1.0 · قاعدة البيانات v${DB_VERSION}<br>تصميم وبرمجة: أ. عبدالله ال عواد</p></div>`;
  bindBack(v); bindGo(v);
  $$('[data-k]', v).forEach(i => i.onchange = async () => { await App.set(i.dataset.k, i.value.trim()); toast('حُفظ', 'ok'); });
  $$('[data-n]', v).forEach(i => i.onchange = async () => { await App.set(i.dataset.n, +i.value); App.syncNative(); toast('حُفظ', 'ok'); });
  $$('[data-b]', v).forEach(i => i.onchange = async () => { await App.set(i.dataset.b, i.checked); App.syncNative(); if (i.dataset.b === 'notify' && i.checked) Native.call('requestNotificationPermission'); });
  $$('[data-theme-set]', v).forEach(b => b.onclick = async () => { await App.set('theme', b.dataset.themeSet); Look.apply(); App.render(); });
  v.querySelector('[data-calm]').onchange = async e => { await App.set('calm', e.target.checked); Look.apply(); };
  v.querySelector('[data-privacy]').onchange = async e => { await App.set('privacy', e.target.checked); Look.apply(); };
  v.querySelector('[data-test-notif]')?.addEventListener('click', () => Native.call('testNotification'));
  const setPin = async () => {
    const pin = await sheet(`<p>اختر رمزًا من 4 أرقام</p><input class="pin-input" name="p" inputmode="numeric" maxlength="4" type="password" autocomplete="off"><input class="pin-input" name="p2" inputmode="numeric" maxlength="4" type="password" placeholder="أعد الرمز" autocomplete="off"><button class="btn primary block" data-ok>حفظ</button>`, {
      title: 'الرمز السري', onMount: (el, close) => { setTimeout(() => el.querySelector('[name=p]').focus(), 200); el.querySelector('[data-ok]').onclick = () => { const a = el.querySelector('[name=p]').value, b = el.querySelector('[name=p2]').value; if (!/^\d{4}$/.test(a)) return toast('الرمز 4 أرقام', 'bad'); if (a !== b) return toast('الرمزان غير متطابقين', 'bad'); close(a); }; }
    });
    if (!pin) return false;
    const salt = uid(); await DB.setSetting('pinSalt', salt); await DB.setSetting('pinHash', await sha256(salt + pin)); return true;
  };
  v.querySelector('[data-lock]').onchange = async e => {
    if (e.target.checked) { if (await setPin()) { await App.set('lockEnabled', true); toast('فُعّل القفل', 'ok'); } }
    else { await App.set('lockEnabled', false); await DB.del('settings', 'pinHash'); }
    App.render();
  };
  v.querySelector('[data-bio]')?.addEventListener('change', async e => {
    if (!e.target.checked) { await App.set('bioUnlock', false); return toast('أُوقف الفتح بالبصمة'); }
    App._bioSetup = async ok => { if (ok) { await App.set('bioUnlock', true); toast('فُعّل الفتح بالوجه أو البصمة', 'ok'); } else { e.target.checked = false; toast('لم يتم التحقق', 'bad'); } };
    Native.call('biometricAuth');
  });
  v.querySelector('[data-chpin]')?.addEventListener('click', async () => { if (await setPin()) toast('تغيّر الرمز', 'ok'); });
};

/* ===== القوائم القابلة للتعديل ===== */
Screens.lists = async (v, p) => {
  const key = p.key || 'positive';
  const names = { positive: 'السلوك الإيجابي', negative: 'السلوك السلبي', homeworkKinds: 'أنواع تقصير الواجبات' };
  const arr = App.lists[key];
  v.innerHTML = topbar('القوائم') + `<div class="page"><div class="seg">${Object.entries(names).map(([k, l]) => `<button class="${k === key ? 'on' : ''}" data-key="${k}">${l}</button>`).join('')}</div>
    ${key === 'negative' ? '<p class="muted small">مرتبة حسب درجات المخالفات في قواعد السلوك والمواظبة. ابدأ البند بـ "الدرجة ...:" لتصنيفه.</p>' : ''}
    <div class="edit-list">${arr.map((x, i) => `<div class="el-row"><input value="${esc(x)}" data-i="${i}"><button class="icon-btn sm" data-del="${i}">${ic('trash')}</button></div>`).join('')}</div>
    <div class="row gap"><input class="grow" placeholder="بند جديد" data-new><button class="btn primary" data-add>${ic('plus')}</button></div>
    <button class="btn ghost block mt" data-reset>استعادة القائمة الافتراضية</button></div>`;
  bindBack(v);
  const save = async a => { App.lists = { ...App.lists, [key]: a }; await App.set('lists', App.lists); };
  $$('[data-key]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { key: b.dataset.key }; App.render(); });
  $$('[data-i]', v).forEach(i => i.onchange = async () => { const a = [...arr]; a[+i.dataset.i] = i.value.trim(); await save(a.filter(Boolean)); toast('حُفظ', 'ok'); });
  $$('[data-del]', v).forEach(b => b.onclick = async () => { const a = arr.filter((_, i) => i !== +b.dataset.del); await save(a); App.render(); });
  v.querySelector('[data-add]').onclick = async () => { const t = v.querySelector('[data-new]').value.trim(); if (!t) return; await save([...arr, t]); App.render(); };
  v.querySelector('[data-reset]').onclick = async () => { if (await confirmBox('استعادة القائمة الافتراضية؟')) { await save([...DEFAULT_LISTS[key]]); App.render(); } };
};

/* ===== النسخ الاحتياطي ===== */
Screens.backup = async (v) => {
  const last = await DB.getSetting('lastBackup');
  const counts = {};
  for (const s of ['students', 'attendance', 'homework', 'points', 'notes', 'contacts']) counts[s] = (await DB.all(s)).length;
  v.innerHTML = topbar('النسخ الاحتياطي') + `<div class="page">
    <div class="info-card">${ic('shield')}<div><b>بياناتك محفوظة على جهازك</b><p>في قاعدة بيانات محلية بإصدارات وترحيل آمن عند تحديث التطبيق، فلا تختفي سجلاتك. احفظ نسخة احتياطية دوريًا (في Google Drive أو واتساب) لتستعيدها عند تغيير الجوال.</p></div></div>
    <div class="rep-tiles"><div><b>${counts.students}</b><small>طالب</small></div><div><b>${counts.attendance}</b><small>سجل حضور</small></div><div><b>${counts.homework}</b><small>واجبات</small></div><div><b>${counts.points}</b><small>نقاط</small></div><div><b>${counts.notes}</b><small>ملاحظات</small></div><div><b>${counts.contacts}</b><small>تواصل</small></div></div>
    <p class="muted small center">${last ? `آخر نسخة: ${shortDate(last.slice(0, 10))}` : 'لم تحفظ أي نسخة بعد'}</p>
    <div class="big-actions"><button class="big-act" data-save>${ic('download')}<b>حفظ نسخة احتياطية</b><small>ملف واحد بكل بياناتك (بدون الرمز السري)</small></button>
      <button class="big-act" data-share>${ic('share')}<b>مشاركة النسخة</b><small>إلى Drive أو واتساب أو البريد</small></button>
      <button class="big-act warn" data-restore>${ic('upload')}<b>استعادة من نسخة</b><small>يستبدل البيانات الحالية</small></button></div>
    <section class="card"><div class="card-h"><h3>${ic('lock')} تشفير النسخ الاحتياطية</h3><span class="pill ${Crypt.pass() ? 'ok' : ''}">${Crypt.pass() ? 'مفعّل' : 'غير مفعّل'}</span></div>
      <p class="muted small">عند التفعيل تُشفَّر كل نسخة (اليدوية والتلقائية) بكلمة مرور تختارها، فلا يستطيع أحد فتح بيانات الطلاب بدونها. احفظ كلمة المرور في مكان آمن — بدونها لا يمكن استعادة النسخة على جهاز جديد.</p>
      <div class="row gap"><button class="btn soft grow" data-setpass>${ic('lock')} ${Crypt.pass() ? 'تغيير كلمة المرور' : 'تفعيل التشفير'}</button>${Crypt.pass() ? `<button class="btn ghost" data-delpass>إيقاف</button>` : ''}</div></section>
    <section class="card"><div class="card-h"><h3>${ic('sync')} النسخ الاحتياطي التلقائي</h3></div>
      <label class="switch"><input type="checkbox" data-auto ${AutoBackup.enabled() ? 'checked' : ''}><span></span> نسخة تلقائية كل يوم عند فتح التطبيق</label>
      <p class="muted small">تُحفظ في: التنزيلات ← فصلي ← نسخ تلقائية، باسم اليوم (فصلي-تلقائي-الأحد…)، فيبقى عندك آخر أسبوع كامل دائمًا. لو تعطل الجهاز انسخ هذا المجلد، أو شارك نسخة إلى Drive من الأعلى.</p>
      <p class="small">${App.S.lastAutoBackup ? `${ic('check')} آخر نسخة تلقائية: ${shortDate(App.S.lastAutoBackup)}` : 'لم تُحفظ نسخة تلقائية بعد'}</p>
      ${Native.has() ? `<button class="btn soft block" data-auto-now>${ic('download')} نسخة تلقائية الآن</button>` : '<p class="muted small">يعمل النسخ التلقائي داخل تطبيق الأندرويد.</p>'}</section></div>`;
  bindBack(v);
  const make = async () => { const b = await backupPayload(); await App.set('lastBackup', new Date().toISOString()); return new Blob([JSON.stringify(b)], { type: 'application/json' }); };
  const fn = () => `فصلي-نسخة-احتياطية-${ymd()}.json`;
  v.querySelector('[data-save]').onclick = async () => { Native.saveFile(fn(), await make(), 'application/json'); setTimeout(() => App.render(), 600); };
  v.querySelector('[data-share]').onclick = async () => Native.shareFile(fn(), await make(), 'application/json');
  v.querySelector('[data-setpass]').onclick = async () => {
    const p = await sheet(`<p>اختر كلمة مرور للنسخ الاحتياطية (6 أحرف أو أرقام على الأقل)</p><input type="password" name="a" autocomplete="off" placeholder="كلمة المرور"><input type="password" name="b" autocomplete="off" placeholder="أعد كتابتها" class="mt"><button class="btn primary block mt" data-ok>حفظ</button>`,
      { title: 'تشفير النسخ', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => { const a = el.querySelector('[name=a]').value, b = el.querySelector('[name=b]').value; if (a.length < 6) return toast('6 أحرف على الأقل', 'bad'); if (a !== b) return toast('كلمتا المرور غير متطابقتين', 'bad'); close(a); } });
    if (!p) return; Crypt.setPass(p); toast('🔒 فُعّل تشفير النسخ الاحتياطية', 'ok'); App.render();
  };
  v.querySelector('[data-delpass]')?.addEventListener('click', async () => { if (await confirmBox('إيقاف التشفير؟ النسخ القادمة تُحفظ دون كلمة مرور.')) { Crypt.setPass(''); App.render(); } });
  v.querySelector('[data-auto]').onchange = async e => { await App.set('autoBackup', e.target.checked); if (e.target.checked) await AutoBackup.run(true); App.render(); };
  v.querySelector('[data-auto-now]')?.addEventListener('click', async () => { if (await AutoBackup.run(true)) { toast('حُفظت النسخة في التنزيلات/فصلي/نسخ تلقائية', 'ok'); App.render(); } else toast('تعذر الحفظ', 'bad'); });
  v.querySelector('[data-restore]').onclick = async () => {
    const f = await pickFile('.json,application/json'); if (!f) return;
    let b; try { b = JSON.parse(await f.text()); } catch (e) { return toast('الملف غير صالح', 'bad'); }
    try { b = await openBackupFile(b); } catch (e) { return toast(esc(e.message), 'bad'); }
    if (!await confirmBox(`استعادة نسخة بتاريخ <b>${esc((b.exportedAt || '').slice(0, 10))}</b>؟<br><small>ستُستبدل كل البيانات الحالية.</small>`, { ok: 'استعادة', danger: true })) return;
    try { await DB.importAll(b); await App.load(); App.syncNative(); toast('تمت الاستعادة بنجاح', 'ok'); App.stack = []; App.go('home'); } catch (e) { toast(esc(e.message), 'bad'); }
  };
};
