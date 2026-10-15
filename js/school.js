/* فصلي — توزيع المنهج، سجل الانتظار، ترتيب الخميس، شواهد الأداء الوظيفي */
'use strict';

/* ===== توزيع المنهج وتقدّم الخطة ===== */
Screens.curriculum = async (v, p) => {
  const tab = p.tab || 'progress';
  const wk = Curr.weekOf();
  const cls = App.classes.filter(c => App.classStudents(c.id).length || App.timetable.some(t => t.classId === c.id));
  let body = '';
  if (tab === 'progress') {
    body = `<div class="curr-now">${ic('book')}<div><b>${wk.n ? `الأسبوع ${wk.n}` : esc(wk.brk || '')}</b><small>${wk.n ? `${shortDate(CURR_WEEKS[wk.n - 1][1])} — ${shortDate(ymd(addDays(parseYmd(CURR_WEEKS[wk.n - 1][1]), 4)))}` : ''}</small></div></div>
    ${cls.map(c => { const st = Curr.status(c.id), les = Curr.lesson(c.id); const plan = Curr.plan(c.grade);
      return `<section class="card curr-card st-${st.kind}"><div class="card-h"><h3>${esc(c.name)}</h3><span class="pill ${st.kind}">${st.label}</span></div>
        <p class="cc-les"><small>درس هذا الأسبوع</small><b>${esc(les?.title || (plan.length ? '—' : 'لم يُدخل توزيع منهج هذا الصف'))}</b></p>
        ${reachHtml(c.id)}
        <div class="cc-bar"><i style="width:${plan.length ? Math.round(st.last / plan.length * 100) : 0}%"></i><em style="right:${plan.length ? Math.round(Math.max(0, st.now - 1) / plan.length * 100) : 0}%"></em></div>
        <div class="row gap"><small class="muted grow">أنجزت حتى الأسبوع ${st.last} من ${plan.length || '—'}</small>
          ${les?.week ? `<button class="btn xs ${Curr.done(c.id)[les.week] ? 'soft' : 'primary'}" data-done="${c.id}|${les.week}">${Curr.done(c.id)[les.week] ? '✓ أُنجز' : 'أنهيت درس الأسبوع'}</button>` : ''}</div></section>`; }).join('')}`;
  } else {
    const g = +tab.replace('g', '');
    const plan = Curr.plan(g);
    body = `<p class="hint">${ic('edit')} درس كل أسبوع في سطر. الأسبوع 1 يبدأ ${shortDate(CURR_WEEKS[0][1])}. ${!DEFAULT_CURRICULUM[g].length ? 'أرسل توزيع منهج الصف السادس لـ«عبقر» أو اكتبه هنا.' : ''}</p>
      <div class="curr-edit">${CURR_WEEKS.map(([n, s]) => `<label class="ce-row ${wk.n === n ? 'now' : ''}"><span>أ${n}<small>${shortDate(s)}</small></span><input data-w="${n}" value="${esc(plan[n - 1] || '')}" placeholder="عنوان الدرس"></label>`).join('')}</div>
      <div class="row gap"><button class="btn primary grow" data-save="${g}">حفظ التوزيع</button>${DEFAULT_CURRICULUM[g].length ? `<button class="btn ghost" data-def="${g}">الافتراضي</button>` : ''}</div>`;
  }
  v.innerHTML = topbar('توزيع المنهج') + `<div class="page"><div class="seg">${[['progress', 'تقدّم الخطة'], ['g4', 'الرابع'], ['g5', 'الخامس'], ['g6', 'السادس']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  bindBack(v);
  $$('[data-tab]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { tab: b.dataset.tab }; App.render(); });
  $$('[data-reach]', v).forEach(b => b.onclick = async () => { if (await reachSheet(b.dataset.reach)) App.render(); });
  $$('[data-done]', v).forEach(b => b.onclick = async () => { const [c, w] = b.dataset.done.split('|'); await Curr.markDone(c, +w, !Curr.done(c)[w]); App.render(); });
  v.querySelector('[data-save]')?.addEventListener('click', async e => {
    const g = e.target.dataset.save; const arr = CURR_WEEKS.map(([n]) => v.querySelector(`[data-w="${n}"]`).value.trim());
    while (arr.length && !arr[arr.length - 1]) arr.pop();
    await App.set('curriculum', { ...(App.S.curriculum || {}), [g]: arr }); toast('حُفظ توزيع المنهج', 'ok');
  });
  v.querySelector('[data-def]')?.addEventListener('click', async e => { const c = { ...(App.S.curriculum || {}) }; delete c[e.target.dataset.def]; await App.set('curriculum', c); App.render(); });
};

/* ===== سجل حصص الانتظار ===== */
Screens.covers = async (v) => {
  const ses = (await DB.all('sessions')).filter(s => s.cover).sort((a, b) => b.date.localeCompare(a.date) || b.period - a.period);
  const month = ymd().slice(0, 7);
  v.innerHTML = topbar('حصص الانتظار') + `<div class="page">
    <div class="rep-tiles"><div><b>${ses.length}</b><small>كل حصص الانتظار</small></div><div><b>${ses.filter(s => s.date.startsWith(month)).length}</b><small>هذا الشهر</small></div><div><b>${new Set(ses.map(s => s.classId)).size}</b><small>فصول غطّيتها</small></div></div>
    ${ses.length ? `<div class="rec-list">${ses.map(s => `<div class="rec"><span class="rec-n">${s.period}</span><div class="grow"><b>${esc(App.className(s.classId))}</b><small>${shortDate(s.date)} · ${hijri(parseYmd(s.date))} · الحصة ${ordinal(s.period)}</small></div><small class="muted">غ ${s.counts?.absent ?? 0} · ت ${s.counts?.late ?? 0}</small></div>`).join('')}</div>
      <button class="btn soft block" data-x>${ic('download')} تصدير Excel</button>` : `<div class="empty">${ic('clock')}<h3>لا توجد حصص انتظار مسجلة</h3><p>في حصة الانتظار اضغط «تحضير الفصل» من الرئيسية، واختر الفصل الذي تغطيه، ثم اعتمد الحضور.</p></div>`}</div>`;
  bindBack(v);
  v.querySelector('[data-x]')?.addEventListener('click', async () => Native.saveFile('سجل-حصص-الانتظار.xlsx', await buildXlsx('الانتظار', ['التاريخ', 'الهجري', 'الحصة', 'الفصل', 'الغياب', 'التأخر'], ses.map(s => [s.date, hijri(parseYmd(s.date)), ordinal(s.period), App.className(s.classId), s.counts?.absent ?? 0, s.counts?.late ?? 0]), `سجل حصص الانتظار — ${App.S.teacherName}`), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
};

/* ===== ترتيب الخميس ===== */
Screens.merge = async (v) => {
  const c = Merge.cfg();
  const next = []; let d = new Date(); while (d.getDay() !== 4) d = addDays(d, 1);
  for (let i = 0; i < 6; i++) { const k = ymd(addDays(d, 7 * i)); next.push([k, Merge.host(k)]); }
  v.innerHTML = topbar('ترتيب الخميس') + `<div class="page">
    <div class="info-card">${ic('merge')}<div><b>دمج الفصول يوم الخميس</b><p>كل خميس يجتمع طلاب كل صف في فصل واحد بالتناوب. عند فتح أي حصة يوم الخميس يعرض فصلي كل طلاب الصف، ويُسجَّل حضور كل طالب في فصله الأصلي.</p></div></div>
    <section class="card"><label class="switch"><input type="checkbox" data-en ${c.enabled ? 'checked' : ''}><span></span> تفعيل ترتيب الخميس</label>
      <label class="fld"><span>بداية التناوب (خميس)</span><input type="date" data-start value="${c.start}"></label>
      <span class="lbl">ترتيب الفصول المستضيفة</span><div class="chips">${c.order.map((s, i) => `<span class="chip on">${i + 1}. ${SECTIONS[s]}</span>`).join('')}<button class="chip" data-rot>تدوير الترتيب</button></div></section>
    <section class="card"><div class="card-h"><h3>${ic('cal')} الأسابيع القادمة</h3></div>${next.map(([k, h]) => `<div class="rec"><span class="rec-n">${h ? SECTIONS[h] : '—'}</span><div><b>${shortDate(k)}</b><small>${hijri(parseYmd(k))} · ${h ? `الصفوف تُدمج في فصل ${SECTIONS[h]}` : 'بلا دمج'}</small></div></div>`).join('')}</section></div>`;
  bindBack(v);
  const save = async x => { await App.set('merge', { ...c, ...x }); App.render(); };
  v.querySelector('[data-en]').onchange = e => save({ enabled: e.target.checked });
  v.querySelector('[data-start]').onchange = e => { const t = parseYmd(e.target.value); if (t.getDay() !== 4) return toast('اختر يوم خميس', 'bad'); save({ start: e.target.value }); };
  v.querySelector('[data-rot]').onclick = () => save({ order: [...c.order.slice(1), c.order[0]] });
};

/* ===== شواهد الأداء الوظيفي (11 عنصرًا) ===== */
const PERF = [
  ['duties', 'أداء الواجبات الوظيفية', 10], ['community', 'التفاعل مع المجتمع المهني', 10], ['parents', 'التفاعل مع أولياء الأمور', 10],
  ['strategies', 'التنويع في استراتيجيات التدريس', 10], ['results', 'تحسين نتائج المتعلمين', 10], ['plan', 'إعداد وتنفيذ خطة التعلم', 10],
  ['tech', 'توظيف تقنيات ووسائل التعلم المناسبة', 10], ['env', 'تهيئة البيئة التعليمية', 5], ['class', 'الإدارة الصفية', 5],
  ['analysis', 'تحليل نتائج المتعلمين وتشخيص مستوياتهم', 10], ['assess', 'تنوع أساليب التقويم', 10]
];
const studAr = n => n === 1 ? 'طالب واحد' : n === 2 ? 'طالبان' : n <= 10 ? `${n} طلاب` : `${n} طالبًا`;
async function perfEvidence(from, to) {
  const D = await Follow.load();
  const inR = x => x.date >= from && x.date <= to;
  const ses = (await DB.all('sessions')).filter(inR), imports = (await DB.all('imports')).filter(x => x.at.slice(0, 10) >= from && x.at.slice(0, 10) <= to);
  const use = (App.S.usageLog || []).filter(inR), u = k => use.filter(x => x.k === k).length;
  const att = D.att.filter(inR), pts = D.pts.filter(inR), hw = D.hw.filter(inR), notes = D.notes.filter(inR), ct = D.contacts.filter(inR), gr = (await DB.all('grades')).filter(inR);
  const cnt = k => att.filter(a => a.status === k).length;
  const doneWeeks = Object.values(App.S.lessonDone || {}).reduce((a, o) => a + Object.values(o).filter(d => d >= from && d <= to).length, 0);
  const pct = att.length ? Math.round((cnt('present') + cnt('late')) / att.length * 100) : 0;
  const rem = (await DB.all('remedial')).filter(r => r.date <= to && (r.endDate || r.date) >= from), remDone = rem.filter(r => r.status === 'done'), remUp = remDone.filter(r => r.result !== 'لم يتحسن بعد');
  const mSent = Object.entries(App.S.monthlySent || {}).filter(([k]) => k >= from.slice(0, 8) + '01' && k <= to).reduce((a, [, v]) => a + v.length, 0);
  const e = {
    duties: [`${ses.filter(s => s.complete).length} حصة اعتُمد حضورها`, `${ses.filter(s => s.cover).length} حصة انتظار مغطاة`, `${(App.S.duties || []).length} مناوبة/إشراف أسبوعي`],
    community: [`${u('export')} تقرير مُصدّر ومشارك مع الإدارة والزملاء`, 'أضف هنا: مجتمعات التعلم المهنية، الدورات، الزيارات التبادلية'],
    parents: [`${ct.length} تواصل مع أولياء الأمور والإدارة`, ...(mSent ? [`${mSent} تقرير شهري مُرسل لأولياء الأمور`] : []), `${ct.filter(c => c.channel === 'واتساب').length} رسالة واتساب`, `${ct.filter(c => /إشادة|شهادة/.test(c.reason)).length} إشادة وشهادة تميّز`],
    strategies: [`${u('quiz')} مسابقة حصة`, `${u('groups')} تعلّم تعاوني (مجموعات)`, `${u('wheel')} عجلة الأسماء`, `${u('timer')} أنشطة موقوتة`],
    results: [...(rem.length ? [`${rem.length} خطة علاجية فردية${remDone.length ? ` — أُنجز ${remDone.length} وتحسّن ${studAr(remUp.length)}` : ''}`] : []), `${pts.reduce((a, b) => a + (b.value || 1), 0)} نقطة مشاركة وتحفيز`, `${u('cert')} شهادة تميّز`, `${hw.filter(h => h.resolved).length} حالة واجبات عولجت من ${hw.length}`],
    plan: [`${doneWeeks} درس أسبوعي أُنجز حسب توزيع المنهج`, ...App.classes.filter(c => App.classStudents(c.id).length).map(c => `${c.name}: ${Curr.status(c.id).label}`).slice(0, 9)],
    tech: [`تطبيق «فصلي» لإدارة الصف والحضور الرقمي`, `${imports.length} تقرير مستورد من منصة مدرستي`, `تقارير PDF و Excel إلكترونية`],
    env: [`${pts.filter(p => p.type === 'positive').length} تعزيز لسلوك إيجابي`, `نجوم الأسبوع وأوسمة الطلاب`],
    class: [`نسبة الحضور ${pct}% في ${att.length} سجل`, `${notes.length} ملاحظة سلوكية/تعليمية، عولج منها ${notes.filter(n => n.resolved).length}`, `غياب ${cnt('absent')} · تأخر ${cnt('late')} · هروب ${cnt('escaped')}`],
    analysis: [...(rem.length ? [`${studAr(new Set(rem.map(r => r.studentId)).size)}: شُخّصت مستوياتهم ووُضعت لهم خطط علاجية`] : []), `تقارير متابعة: الأكثر غيابًا، المقصرون، الأكثر مشاركة`, `${(await Follow.needsContact(D)).length} حالة رُصدت تحتاج تواصلًا`],
    assess: [...(u('worksheet') ? [`${u('worksheet')} ورقة عمل واختبار قصير مطبوع بنماذج متعددة`] : []), `${gr.length} درجة اختبار مستوردة`, `${pts.filter(p => p.quiz).length} إجابة في مسابقات الحصة (تقويم تكويني)`, `${hw.length} متابعة واجب`]
  };
  return e;
}
Screens.portfolio = async (v, p) => {
  const range = p.range || 'term';
  const [from, to] = range === 'month' ? periodRange('month') : range === 'week' ? periodRange('week') : [CURR_WEEKS[0][1], ymd()];
  const ev = await perfEvidence(from, to);
  const photos = await Photos.inRange(from, to);
  const manual = App.S.perfNotes || {};
  v.innerHTML = topbar('شواهد الأداء الوظيفي') + `<div class="page">
    <div class="stars-hero navy">${ic('folder')}<div><b>شواهد الأداء الوظيفي 1448هـ</b><small>تُجمع تلقائيًا من عملك في فصلي — جاهزة لملف الإنجاز الرقمي</small></div></div>
    <div class="seg small">${[['week', 'أسبوعي'], ['month', 'شهري'], ['term', 'الفصل الدراسي']].map(([k, l]) => `<button data-r="${k}" class="${range === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="report print-area"><div class="rep-head"><img src="img/logo.png" alt=""><div><h2>شواهد الأداء الوظيفي</h2><p>${esc(App.S.teacherName)} · ${esc(App.S.subject)} · ${esc(App.S.school)} · ${shortDate(from)} — ${shortDate(to)}</p></div></div>
    ${PERF.map(([k, t, w], i) => `<section class="perf"><div class="perf-h"><span class="perf-n">${i + 1}</span><b>${t}</b><small>${w}%</small></div>
      <ul>${ev[k].map(x => `<li>${esc(x)}</li>`).join('')}${(manual[k] || []).map((x, j) => `<li class="man">${esc(x)} <button class="lnk no-print" data-rm="${k}|${j}">حذف</button></li>`).join('')}</ul>
      ${photos.some(x => x.perf === k) ? `<div class="perf-ph">${photos.filter(x => x.perf === k).map(x => `<figure data-ph="${x.id}"><img src="${x.data}" alt=""><figcaption>${esc(x.caption || '')}</figcaption></figure>`).join('')}</div>` : ''}
      <div class="no-print row gap"><button class="lnk" data-add="${k}">${ic('plus')} إضافة شاهد</button><button class="lnk" data-addph="${k}">${ic('camera')} إضافة صورة</button></div></section>`).join('')}
    <div class="rep-sign"><span>المعلم: ${esc(App.S.teacherName)}</span><span>التوقيع: ..................</span><span>${hijri(new Date())}</span></div></div>
    <div class="rep-actions no-print"><button class="btn primary grow" data-print>${ic('print')} طباعة / PDF</button><button class="btn soft grow" data-xlsx>${ic('download')} Excel</button></div></div>`;
  bindBack(v);
  $$('[data-r]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { range: b.dataset.r }; App.render(); });
  $$('[data-add]', v).forEach(b => b.onclick = async () => {
    const t = await sheet(`<label class="fld"><span>الشاهد</span><textarea name="t" rows="3" placeholder="مثال: حضور دورة استراتيجيات التعلم النشط"></textarea></label><button class="btn primary block" data-ok>إضافة</button>`, { title: PERF.find(x => x[0] === b.dataset.add)[1], onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close(el.querySelector('[name=t]').value.trim()) });
    if (t) { await App.set('perfNotes', { ...manual, [b.dataset.add]: [...(manual[b.dataset.add] || []), t] }); App.render(); }
  });
  $$('[data-rm]', v).forEach(b => b.onclick = async () => { const [k, j] = b.dataset.rm.split('|'); const a = [...(manual[k] || [])]; a.splice(+j, 1); await App.set('perfNotes', { ...manual, [k]: a }); App.render(); });
  $$('[data-addph]', v).forEach(b => b.onclick = async () => { if (await photoSheet({ perf: b.dataset.addph })) App.render(); });
  $$('[data-ph]', v).forEach(f => f.onclick = () => photoViewer(photos.find(x => x.id === f.dataset.ph), () => App.render()));
  v.querySelector('[data-print]').onclick = () => Native.print('شواهد الأداء الوظيفي');
  v.querySelector('[data-xlsx]').onclick = async () => {
    const rows = []; PERF.forEach(([k, t, w], i) => [...ev[k], ...(manual[k] || [])].forEach((x, j) => rows.push([j ? '' : i + 1, j ? '' : t, j ? '' : w + '%', x])));
    Native.saveFile('شواهد-الأداء-الوظيفي.xlsx', await buildXlsx('الشواهد', ['م', 'العنصر', 'الوزن', 'الشاهد'], rows, `شواهد الأداء الوظيفي — ${App.S.teacherName} — ${App.S.school}`), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };
};
