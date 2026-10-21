/* فصلي — سجل رصد الدرجات: توزيع الدراسات الاجتماعية (١٠٠) مربوط بسجلات الطالب في التطبيق.
   البيانات: درجات الاختبارات والمهام الأدائية في مخزن grades (kind: test / task، assessId)،
   والتعديل اليدوي لكل فصل وفصل دراسي في الإعدادات gbo_<الفصل الدراسي>_<الفصل> = { studentId: { item: value } }.
   لا تغيير على بنية قاعدة البيانات. */
'use strict';

const GB_ITEMS = [
  { k: 'tests', t: 'الاختبارات', s: 'الاختبارات', max: 60, ic: 'school' },
  { k: 'tasks', t: 'المهام الأدائية', s: 'المهام الأدائية', max: 10, ic: 'sheet' },
  { k: 'part', t: 'المشاركة والتفاعل', s: 'المشاركة', max: 10, ic: 'star' },
  { k: 'hw', t: 'الواجبات المنزلية', s: 'الواجبات', max: 10, ic: 'book' },
  { k: 'disc', t: 'الالتزام والانضباط والسلوك التعليمي', s: 'الالتزام والسلوك', max: 10, ic: 'shield' }
];
const GB_RULES = { partBase: 6, partStep: 0.5, hwStep: 1, hwResolved: 0.5, tools: 0.5, late: 0.5, escaped: 2, absent: 0, note: 1, positive: 0.5, round: 0.5 };
const GB_TERMS = [
  { id: 't1', name: 'الفصل الدراسي الأول', from: '2026-08-23', to: '2027-01-16' },
  { id: 't2', name: 'الفصل الدراسي الثاني', from: '2027-01-17', to: '2027-07-15' }
];
/* أنواع تقصير تُحتسب في «الالتزام» لا في «الواجبات» */
const GB_TOOLS_KINDS = ['لم يحضر الكتاب', 'لم يحضر الدفتر'];
const GB_DEGREE = { 'الأولى': 1, 'الثانية': 2, 'الثالثة': 3, 'الرابعة': 4, 'الخامسة': 5 };
const arNum = x => String(x).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]).replace('.', '٫');

const GB = {
  cfg() { return { ...GB_RULES, ...(App.S.gbRules || {}) }; },
  terms() { return App.S.gbTerms || GB_TERMS; },
  term(id) { const T = this.terms(); return T.find(t => t.id === id) || T.find(t => ymd() >= t.from && ymd() <= t.to) || T[0]; },
  ovKey: (term, cid) => `gbo_${term}_${cid}`,
  ov(term, cid) { return App.S[this.ovKey(term, cid)] || {}; },
  async setOv(term, cid, o) { await App.set(this.ovKey(term, cid), o); },
  excluded() { return new Set(App.S.gbExcluded || []); },
  rnd(x) { const r = +this.cfg().round || 0.5; return Math.round(x / r) * r; },
  fmt(x) { return x === null || x === undefined ? '—' : arNum(+(+x).toFixed(2)); },
  assessKey: g => g.assessId || `imp|${g.title || 'اختبار'}|${g.date}`,
  isScore: g => g.kind !== 'override' && +g.max > 0,

  /* تجميع الاختبارات والمهام لفصل في فترة */
  assessments(grades, cid, T) {
    const ids = new Set(App.classStudents(cid).map(s => s.id)), map = {};
    grades.filter(g => this.isScore(g) && ids.has(g.studentId) && g.date >= T.from && g.date <= T.to).forEach(g => {
      const k = this.assessKey(g);
      const a = map[k] ||= { key: k, title: g.title || 'اختبار', kind: g.kind === 'task' ? 'task' : 'test', max: +g.max, date: g.date, source: g.source || 'مدرستي', own: !!g.assessId, recs: [] };
      a.recs.push(g);
    });
    const ex = this.excluded();
    return Object.values(map).map(a => {
      const sc = a.recs.filter(r => r.score !== '' && r.score !== null && !isNaN(+r.score));
      return { ...a, excluded: ex.has(a.key), done: sc.length, avg: sc.length ? sc.reduce((x, r) => x + +r.score, 0) / sc.length : null };
    }).sort((a, b) => a.date.localeCompare(b.date));
  },

  /* تحميل كل ما يلزم الحساب مرة واحدة ثم فهرسته حسب الطالب */
  async load(T) {
    const D = await Follow.load(), grades = await DB.all('grades');
    const inR = x => x.date >= T.from && x.date <= T.to;
    const by = {}, put = (k, x) => ((by[x.studentId] ||= { att: [], hw: [], notes: [], pts: [], gr: [] })[k]).push(x);
    D.att.filter(inR).forEach(x => put('att', x)); D.hw.filter(inR).forEach(x => put('hw', x));
    D.notes.filter(inR).forEach(x => put('notes', x)); D.pts.filter(inR).forEach(x => put('pts', x));
    const ex = this.excluded();
    grades.filter(g => inR(g) && this.isScore(g) && !ex.has(this.assessKey(g))).forEach(x => put('gr', x));
    return { by, grades, T };
  },

  /* حساب درجات طالب: الآلي + التعديل اليدوي + سبب كل درجة */
  compute(sid, X, ov = {}) {
    const C = this.cfg(), R = X.by[sid] || { att: [], hw: [], notes: [], pts: [], gr: [] }, mine = ov[sid] || {};
    const it = {}, cl = (v, m) => Math.max(0, Math.min(m, v));
    const ratio = (list, max) => {
      const sc = list.filter(g => g.score !== '' && g.score !== null && !isNaN(+g.score));
      if (!sc.length) return { auto: null, why: ['لم تُرصد درجات بعد'] };
      const s = sc.reduce((a, g) => a + +g.score, 0), m = sc.reduce((a, g) => a + +g.max, 0);
      return { auto: this.rnd(cl(s / m * max, max)), why: [...sc.map(g => `${g.title || 'اختبار'}: ${this.fmt(+g.score)} من ${this.fmt(+g.max)}`), `المجموع ${this.fmt(s)} من ${this.fmt(m)} ← نسبته من ${this.fmt(max)}`] };
    };
    it.tests = ratio(R.gr.filter(g => g.kind !== 'task'), 60);
    it.tasks = ratio(R.gr.filter(g => g.kind === 'task'), 10);
    /* المشاركة تُرصد يدويًا فقط: صفر حتى يرصدها المعلم (بطلبه، أكتوبر ٢٠٢٦) */
    { const n = R.pts.filter(x => x.type === 'participation').reduce((a, x) => a + (+x.value || 1), 0);
      it.part = { auto: 0, why: ['لم تُرصد بعد — اضغط الدرجة لرصدها', n ? `للاستئناس: ${this.fmt(n)} مشاركة مسجلة في الحصص` : ''].filter(Boolean) }; }
    { const hw = R.hw.filter(h => !GB_TOOLS_KINDS.includes(h.kind)), op = hw.filter(h => !h.resolved).length, rs = hw.length - op;
      it.hw = { auto: this.rnd(cl(10 - op * C.hwStep - rs * C.hwResolved, 10)), why: hw.length ? [op ? `${this.fmt(op)} تقصير قائم × ${this.fmt(C.hwStep)}` : '', rs ? `${this.fmt(rs)} تقصير عولج × ${this.fmt(C.hwResolved)}` : ''].filter(Boolean) : ['لا يوجد تقصير مسجل'] }; }
    { const c = k => R.att.filter(a => a.status === k).length, tools = R.hw.filter(h => GB_TOOLS_KINDS.includes(h.kind)).length;
      const beh = R.notes.filter(n => n.kind === 'سلوكية'), deg = beh.reduce((a, n) => a + (GB_DEGREE[(n.degree || '').replace('الدرجة ', '').trim()] || 1), 0);
      const pos = R.pts.filter(x => x.type === 'positive').reduce((a, x) => a + (+x.value || 1), 0);
      const minus = c('late') * C.late + c('escaped') * C.escaped + c('absent') * C.absent + tools * C.tools + deg * C.note;
      const why = [];
      if (c('late')) why.push(`تأخر ${this.fmt(c('late'))} × ${this.fmt(C.late)}`);
      if (c('escaped')) why.push(`هروب ${this.fmt(c('escaped'))} × ${this.fmt(C.escaped)}`);
      if (c('absent') && C.absent) why.push(`غياب ${this.fmt(c('absent'))} × ${this.fmt(C.absent)}`);
      if (tools) why.push(`عدم إحضار الكتاب أو الدفتر ${this.fmt(tools)} × ${this.fmt(C.tools)}`);
      if (beh.length) why.push(`ملاحظات سلوكية ${this.fmt(beh.length)} (حسب درجة المخالفة) × ${this.fmt(C.note)}`);
      if (pos) why.push(`سلوك إيجابي +${this.fmt(pos)} × ${this.fmt(C.positive)}`);
      it.disc = { auto: this.rnd(cl(10 - minus + pos * C.positive, 10)), why: why.length ? why : ['ملتزم: لا تأخر ولا هروب ولا ملاحظات سلوكية'] }; }
    let total = 0, full = true;
    for (const I of GB_ITEMS) {
      const o = mine[I.k], x = it[I.k];
      x.ov = o !== undefined && o !== null && o !== '';
      x.val = x.ov ? +o : x.auto;
      if (x.val === null) full = false; else total += x.val;
    }
    return { it, total: this.rnd(total), full };
  },

  /* الفصول التي فيها طلاب */
  classes() { return App.classes.filter(c => App.classStudents(c.id).length); },

  /* صفوف الكشف لفصل (للعرض والطباعة والتصدير ونور) */
  async sheetRows(cid, T) {
    const X = await this.load(T), ov = this.ov(T.id, cid);
    return { X, ov, rows: App.classStudents(cid).map(s => ({ s, ...this.compute(s.id, X, ov) })) };
  }
};

/* ===== الشاشة الرئيسية للسجل ===== */
Screens.gradebook = async (v, p) => {
  const T = GB.term(p.term), CL = GB.classes();
  if (!CL.length) { v.innerHTML = topbar('سجل رصد الدرجات') + `<div class="page"><div class="empty">${ic('users')}<h3>لا يوجد طلاب بعد</h3><p>أضف طلابك أو استورد ملف نور أولًا</p></div></div>`; return bindBack(v); }
  const cid = CL.some(c => c.id === p.classId) ? p.classId : (CL.find(c => c.id === App.S.gbLastClass) || CL[0]).id;
  if (App.S.gbLastClass !== cid) App.set('gbLastClass', cid);
  const { X, ov, rows } = await GB.sheetRows(cid, T);
  const AS = GB.assessments(X.grades, cid, T);
  const cname = App.cls[cid]?.full || App.className(cid);
  const done = rows.filter(r => r.full), avg = done.length ? done.reduce((a, r) => a + r.total, 0) / done.length : null;
  const fullCnt = done.filter(r => r.total >= 100).length, low = done.filter(r => r.total < 50).length;
  const ovCount = Object.values(ov).reduce((a, o) => a + Object.keys(o || {}).length, 0);

  const head = `<tr><th class="gb-n">م</th><th class="gb-name">اسم الطالب</th>${GB_ITEMS.map(I => `<th class="gb-it"><div class="gb-th">
      <div class="gb-th-acts no-print"><button class="gb-full" data-full="${I.k}" aria-label="رصد الدرجة كاملة: ${I.t}" title="رصد الدرجة كاملة">${ic('checkSq')}</button><button class="gb-zero" data-zero="${I.k}" aria-label="تصفير: ${I.t}" title="تصفير البند">${ic('trash')}</button></div>
      <span>${I.s}</span><small>${arNum(I.max)}</small></div></th>`).join('')}<th class="gb-tot"><div class="gb-th"><span>المجموع</span><small>${arNum(100)}</small></div></th></tr>`;
  const body = rows.map((r, i) => `<tr><td class="gb-n">${arNum(i + 1)}</td><td class="gb-name"><button data-stu="${r.s.id}">${esc(r.s.name)}</button></td>
    ${GB_ITEMS.map(I => { const x = r.it[I.k]; return `<td class="gb-c"><button class="gb-cell ${x.ov ? 'ov' : ''} ${x.val === null ? 'na' : x.val >= I.max ? 'top' : x.val < I.max / 2 ? 'lowv' : ''}" data-cell="${r.s.id}|${I.k}">${GB.fmt(x.val)}</button></td>`; }).join('')}
    <td class="gb-tot"><b class="${r.full ? (r.total < 50 ? 'lowv' : '') : 'part'}">${GB.fmt(r.total)}</b></td></tr>`).join('');

  v.innerHTML = topbar('سجل رصد الدرجات', { actions: `<button class="icon-btn" data-rules aria-label="قواعد الحساب">${ic('settings')}</button><button class="icon-btn" data-print aria-label="طباعة">${ic('print')}</button>` }) + `<div class="page gb-page">
    <div class="seg small no-print">${GB.terms().map(t => `<button class="${t.id === T.id ? 'on' : ''}" data-term="${t.id}">${esc(t.name)}</button>`).join('')}</div>
    <div class="class-chips no-print">${CL.map(c => `<button class="chip ${c.id === cid ? 'on' : ''}" data-cl="${c.id}">${esc(c.name)} <small>${arNum(App.classStudents(c.id).length)}</small></button>`).join('')}</div>
    <div class="rep-tiles gb-tiles no-print"><div><b>${GB.fmt(avg === null ? null : GB.rnd(avg))}</b><small>متوسط الفصل</small></div><div><b>${arNum(fullCnt)}</b><small>الدرجة الكاملة</small></div><div><b>${arNum(low)}</b><small>أقل من ٥٠</small></div><div><b>${arNum(AS.filter(a => !a.excluded).length)}</b><small>اختبارات ومهام</small></div></div>
    <section class="card no-print"><div class="card-h"><h3>${ic('school')} الاختبارات والمهام الأدائية</h3></div>
      <div class="row gap"><button class="btn primary grow" data-new="test">${ic('plus')} اختبار</button><button class="btn soft grow" data-new="task">${ic('plus')} مهمة أدائية</button></div>
      ${AS.length ? `<div class="gb-as">${AS.map(a => `<div class="gb-a ${a.excluded ? 'off' : ''}"><button class="gb-a-main" data-as="${esc(a.key)}"><span class="gb-a-ic ${a.kind}">${ic(a.kind === 'task' ? 'sheet' : 'school')}</span>
          <span class="grow"><b>${esc(a.title)}</b><small>${a.kind === 'task' ? 'مهمة أدائية' : 'اختبار'} · من ${arNum(a.max)} · ${shortDate(a.date)} · ${a.own ? 'رُصد في فصلي' : esc(a.source)}${a.excluded ? ' · غير محتسب' : ''}</small></span>
          <span class="gb-a-st"><b>${GB.fmt(a.avg === null ? null : GB.rnd(a.avg))}</b><small>${arNum(a.done)}/${arNum(App.classStudents(cid).length)}</small></span></button></div>`).join('')}</div>`
        : `<p class="muted small mt">لم تُرصد اختبارات لهذا الفصل في ${esc(T.name)}. أضف اختبارًا أو مهمة أدائية، أو استورد نتائج مدرستي من «المزامنة».</p>`}
    </section>
    <div class="report print-area gb-report">
      <div class="rep-head"><img src="img/logo.png" alt=""><div><h2>سجل رصد درجات ${esc(App.S.subject)}</h2><p>${esc(App.S.school)} · ${esc(cname)} · ${esc(T.name)}</p></div></div>
      <div class="gb-hint no-print">${ic('info')}<span>اضغط أي درجة لتعديلها أو معرفة سببها. أيقونة ${ic('checkSq')} فوق البند ترصد الدرجة كاملة لكل الطلاب، و${ic('trash')} تصفّره.${ovCount ? ` <b>${arNum(ovCount)}</b> درجة معدّلة يدويًا (عليها نقطة ذهبية).` : ''}</span></div>
      <div class="table-wrap gb-wrap"><table class="tbl gb-tbl"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <div class="rep-sign"><span>معلم المادة: ${esc(App.S.teacherName)}</span><span>التوقيع: ..................</span><span>${hijri(new Date())}</span></div>
    </div>
    <button class="btn soft block no-print" data-imp>${ic('upload')} استيراد درجات بند (لصق قائمة أو ملف Excel)</button>
    <button class="btn danger-ghost block no-print" data-zeroall>${ic('trash')} تصفير كل البنود لطلاب ${esc(App.className(cid))}</button>
    <div class="rep-actions no-print"><button class="btn primary grow" data-print>${ic('print')} طباعة / PDF</button><button class="btn soft grow" data-xlsx>${ic('download')} Excel</button><button class="btn gold grow" data-noor>${ic('send')} تعبئة نور</button></div>
    <button class="btn ghost block no-print" data-xall>${ic('download')} Excel لكل الفصول</button>
  </div>`;

  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-term]', v).forEach(b => b.onclick = () => setP({ term: b.dataset.term }));
  $$('[data-cl]', v).forEach(b => b.onclick = () => setP({ classId: b.dataset.cl }));
  $$('[data-stu]', v).forEach(b => b.onclick = () => App.go('student', { id: b.dataset.stu, tab: 'grades' }));
  $$('[data-new]', v).forEach(b => b.onclick = () => App.go('gbentry', { classId: cid, term: T.id, kind: b.dataset.new }));
  $$('[data-as]', v).forEach(b => b.onclick = () => App.go('gbentry', { classId: cid, term: T.id, key: b.dataset.as }));
  $$('[data-print]', v).forEach(b => b.onclick = () => { logUse('export'); Native.print(`سجل الدرجات ${App.className(cid)}`); });
  v.querySelector('[data-rules]').onclick = () => gbRulesSheet();
  v.querySelector('[data-xlsx]').onclick = async () => { logUse('export'); Native.saveFile(`سجل-الدرجات-${App.className(cid).replace(/\s+/g, '-')}.xlsx`, await gbXlsx([cid], T), XLSX_MIME); };
  v.querySelector('[data-xall]').onclick = async () => { logUse('export'); Native.saveFile(`سجل-الدرجات-كل-الفصول.xlsx`, await gbXlsx(CL.map(c => c.id), T), XLSX_MIME); };
  v.querySelector('[data-noor]').onclick = () => gbNoor(cid, T, rows);

  /* أيقونة فوق البند: رصد الدرجة كاملة للجميع */
  $$('[data-full]', v).forEach(b => b.onclick = async () => {
    const I = GB_ITEMS.find(x => x.k === b.dataset.full), studs = App.classStudents(cid);
    const has = studs.some(s => ov[s.id]?.[I.k] !== undefined);
    const r = await sheet(`<div class="gb-full-box"><span class="gb-full-ic">${ic('checkSq')}</span><div><b>${I.t}</b><small>${esc(App.className(cid))} · ${arNum(studs.length)} طالبًا</small></div></div>
      <button class="btn primary block" data-v="full">${ic('check')} رصد الدرجة كاملة (${arNum(I.max)}) لكل الطلاب</button>
      ${has ? `<button class="btn soft block mt" data-v="auto">${ic('history')} إرجاع البند للحساب التلقائي</button>` : ''}
      <p class="muted small mt">بعد الرصد تستطيع تعديل درجة أي طالب بالضغط عليها، والتراجع متاح فورًا.</p>`, {
      title: 'رصد البند', onMount: (el, close) => $$('[data-v]', el).forEach(x => x.onclick = () => close(x.dataset.v))
    });
    if (!r) return;
    const before = GB.ov(T.id, cid), next = JSON.parse(JSON.stringify(before));
    studs.forEach(s => { const o = next[s.id] ||= {}; if (r === 'full') o[I.k] = I.max; else delete o[I.k]; if (!Object.keys(o).length) delete next[s.id]; });
    await GB.setOv(T.id, cid, next);
    toast(r === 'full' ? `✓ رُصدت ${arNum(I.max)} في «${I.s}» لكل طلاب ${esc(App.className(cid))}` : `أُرجع «${I.s}» للحساب التلقائي`, 'ok', { undo: async () => { await GB.setOv(T.id, cid, before); App.render(); } });
    App.render();
  });

  /* أيقونة التصفير فوق البند، وزر تصفير السجل كله للفصل */
  const zero = async (keys, label) => {
    const studs = App.classStudents(cid);
    const r = await sheet(`<div class="gb-full-box"><span class="gb-full-ic zero">${ic('trash')}</span><div><b>${label}</b><small>${esc(App.className(cid))} · ${arNum(studs.length)} طالبًا</small></div></div>
      <button class="btn danger block" data-v="zero">${ic('trash')} تصفير (٠) لكل الطلاب</button>
      <button class="btn soft block mt" data-v="auto">${ic('history')} إرجاع للحساب التلقائي من السجلات</button>
      <p class="muted small mt">لا تُحذف درجات الاختبارات المرصودة ولا سجلات الطلاب؛ يتغيّر الرصد في هذا الكشف فقط، والتراجع متاح فورًا.</p>`, {
      title: 'تصفير', onMount: (el, close) => $$('[data-v]', el).forEach(x => x.onclick = () => close(x.dataset.v))
    });
    if (!r) return;
    const before = GB.ov(T.id, cid), next = JSON.parse(JSON.stringify(before));
    studs.forEach(s => { const o = next[s.id] ||= {}; keys.forEach(k => { if (r === 'zero') o[k] = 0; else delete o[k]; }); if (!Object.keys(o).length) delete next[s.id]; });
    await GB.setOv(T.id, cid, next);
    toast(r === 'zero' ? `صُفّر «${label}» لطلاب ${esc(App.className(cid))}` : `أُرجع «${label}» للحساب التلقائي`, 'ok', { undo: async () => { await GB.setOv(T.id, cid, before); App.render(); } });
    App.render();
  };
  $$('[data-zero]', v).forEach(b => b.onclick = () => { const I = GB_ITEMS.find(x => x.k === b.dataset.zero); zero([I.k], I.t); });
  v.querySelector('[data-zeroall]').onclick = () => zero(GB_ITEMS.map(I => I.k), 'كل البنود');

  v.querySelector('[data-imp]').onclick = async () => { if (await gbImport(T, cid)) App.render(); };

  /* تعديل درجة طالب في بند */
  $$('[data-cell]', v).forEach(b => b.onclick = async () => {
    const [sid, k] = b.dataset.cell.split('|'), row = rows.find(r => r.s.id === sid);
    if (await gbCellSheet(row.s, k, row.it[k], T, cid)) App.render();
  });
};
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function gbCellSheet(s, k, x, T, cid) {
  const I = GB_ITEMS.find(i => i.k === k);
  return sheet(`<div class="who"><b>${esc(s.name)}</b><small>${esc(I.t)} · من ${arNum(I.max)}</small></div>
    <div class="gb-why"><div class="gb-why-h"><span>الحساب التلقائي من سجلات الطالب</span><b>${GB.fmt(x.auto)}</b></div>${x.why.map(w => `<small>• ${esc(w)}</small>`).join('')}</div>
    <label class="fld"><span>الدرجة المرصودة</span><input type="number" inputmode="decimal" step="0.5" min="0" max="${I.max}" name="v" value="${x.ov ? x.val : ''}" placeholder="${x.auto === null ? 'اكتب الدرجة' : 'التلقائية: ' + x.auto}"></label>
    <div class="row gap"><button class="btn primary grow" data-ok>${ic('check')} حفظ</button><button class="btn soft grow" data-full>الدرجة كاملة</button></div>
    ${x.ov ? `<button class="btn ghost block mt" data-auto>${ic('history')} إرجاع للحساب التلقائي (${GB.fmt(x.auto)})</button>` : ''}`, {
    title: 'تعديل الدرجة', onMount: (el, close) => {
      const inp = el.querySelector('[name=v]');
      setTimeout(() => inp.focus(), 250);
      const save = async val => {
        const o = JSON.parse(JSON.stringify(GB.ov(T.id, cid))), m = o[s.id] ||= {};
        if (val === null) delete m[k]; else {
          if (isNaN(val) || val < 0 || val > I.max) return toast(`الدرجة بين ٠ و${arNum(I.max)}`, 'bad');
          m[k] = val;
        }
        if (!Object.keys(m).length) delete o[s.id];
        await GB.setOv(T.id, cid, o); toast('✓ حُفظت الدرجة', 'ok'); close(true);
      };
      el.querySelector('[data-ok]').onclick = () => inp.value.trim() === '' ? save(null) : save(+inp.value);
      inp.onkeydown = e => { if (e.key === 'Enter') el.querySelector('[data-ok]').click(); };
      el.querySelector('[data-full]').onclick = () => save(I.max);
      el.querySelector('[data-auto]')?.addEventListener('click', () => save(null));
    }
  });
}

/* قواعد الحساب التلقائي (قابلة للتعديل) */
async function gbRulesSheet() {
  const C = GB.cfg(), T = GB.terms();
  const f = (k, l, h) => `<label class="fld gb-rule"><span>${l}${h ? `<small>${h}</small>` : ''}</span><input type="number" step="0.5" min="0" name="${k}" value="${C[k]}"></label>`;
  const r = await sheet(`<p class="muted small">التوزيع المعتمد: الاختبارات ٦٠ · المهام الأدائية ١٠ · المشاركة ١٠ · الواجبات ١٠ · الالتزام والسلوك ١٠. الاختبارات والمهام تُحسب بنسبة مجموع درجات الطالب، والبقية من سجلاته كما يلي:</p>
    <h4 class="gb-rh">${ic('star')} المشاركة والتفاعل</h4><p class="muted small">تُرصد يدويًا: صفر لكل طالب حتى ترصدها.</p>
    <h4 class="gb-rh">${ic('book')} الواجبات المنزلية</h4>${f('hwStep', 'خصم كل تقصير قائم')}${f('hwResolved', 'خصم تقصير عولج')}
    <h4 class="gb-rh">${ic('shield')} الالتزام والانضباط والسلوك</h4>${f('late', 'خصم التأخر')}${f('escaped', 'خصم الهروب')}${f('absent', 'خصم الغياب', '٠ = لا يُخصم')}${f('tools', 'عدم إحضار الكتاب أو الدفتر')}${f('note', 'ملاحظة سلوكية', '× درجة المخالفة')}${f('positive', 'إضافة السلوك الإيجابي')}
    <h4 class="gb-rh">${ic('cal')} الفصول الدراسية</h4>${T.map((t, i) => `<div class="row gap"><label class="fld grow"><span>${esc(t.name)} — من</span><input type="date" name="from${i}" value="${t.from}"></label><label class="fld grow"><span>إلى</span><input type="date" name="to${i}" value="${t.to}"></label></div>`).join('')}
    <label class="fld"><span>التقريب</span><select name="round"><option value="0.5" ${+C.round === 0.5 ? 'selected' : ''}>لأقرب نصف درجة</option><option value="1" ${+C.round === 1 ? 'selected' : ''}>لأقرب درجة</option><option value="0.25" ${+C.round === 0.25 ? 'selected' : ''}>لأقرب ربع درجة</option></select></label>
    <div class="row gap"><button class="btn primary grow" data-ok>${ic('check')} حفظ</button><button class="btn ghost grow" data-def>القيم الافتراضية</button></div>`, {
    title: 'قواعد حساب الدرجات', onMount: (el, close) => {
      el.querySelector('[data-def]').onclick = () => close('def');
      el.querySelector('[data-ok]').onclick = () => {
        const o = {}; Object.keys(GB_RULES).forEach(k => { const x = el.querySelector(`[name=${k}]`); if (x && x.value !== '' && !isNaN(+x.value)) o[k] = +x.value; });
        close({ rules: o, terms: T.map((t, i) => ({ ...t, from: el.querySelector(`[name=from${i}]`).value || t.from, to: el.querySelector(`[name=to${i}]`).value || t.to })) });
      };
    }
  });
  if (!r) return;
  if (r === 'def') { await App.set('gbRules', {}); await App.set('gbTerms', null); }
  else { await App.set('gbRules', r.rules); await App.set('gbTerms', r.terms); }
  toast('✓ حُفظت القواعد وأُعيد الحساب', 'ok'); App.render();
}

/* ===== رصد اختبار أو مهمة أدائية ===== */
Screens.gbentry = async (v, p) => {
  const cid = p.classId, T = GB.term(p.term), studs = App.classStudents(cid);
  const grades = await DB.all('grades');
  const A = p.key ? GB.assessments(grades, cid, { from: '0000', to: '9999' }).find(a => a.key === p.key) : null;
  if (p.key && !A) return App.back();
  const kind = A ? A.kind : p.kind === 'task' ? 'task' : 'test';
  const n = GB.assessments(grades, cid, T).filter(a => a.kind === kind).length + 1;
  const meta = A ? { title: A.title, max: A.max, date: A.date } : { title: kind === 'task' ? `مهمة أدائية ${arNum(n)}` : `اختبار قصير ${arNum(n)}`, max: kind === 'task' ? 10 : 20, date: ymd() };
  const rec = {}; (A?.recs || []).forEach(r => rec[r.studentId] = r);
  const val = sid => { const r = rec[sid]; return !r ? '' : r.absent ? '' : r.score ?? ''; };
  v.innerHTML = topbar(A ? 'تعديل الرصد' : kind === 'task' ? 'رصد مهمة أدائية' : 'رصد اختبار') + `<div class="page gb-entry">
    <section class="card"><div class="who"><b>${esc(App.cls[cid]?.full || App.className(cid))}</b><small>${kind === 'task' ? 'المهام الأدائية (من ١٠ في السجل)' : 'الاختبارات (من ٦٠ في السجل)'}</small></div>
      <label class="fld"><span>العنوان</span><input name="title" value="${esc(meta.title)}"></label>
      <div class="row gap"><label class="fld grow"><span>الدرجة العظمى</span><input type="number" inputmode="decimal" min="1" step="0.5" name="max" value="${meta.max}"></label>
        <label class="fld grow"><span>التاريخ</span><input type="date" name="date" value="${meta.date}"></label></div>
      ${A && !A.own ? `<p class="muted small">مستورد من ${esc(A.source)} — تستطيع تعديل الدرجات هنا.</p>` : ''}
    </section>
    <div class="gb-entry-bar"><button class="btn gold grow" data-allfull>${ic('checkSq')} الدرجة كاملة للجميع</button><button class="btn ghost" data-clear>مسح</button></div>
    <div class="gb-list">${studs.map((s, i) => `<div class="gb-row ${rec[s.id]?.absent ? 'abs' : ''}" data-sid="${s.id}"><span class="gb-i">${arNum(i + 1)}</span><b class="grow">${esc(s.name)}${rec[s.id]?.note ? `<small class="gb-note">${esc(rec[s.id].note)}</small>` : ''}</b>
      <button class="gb-abs" data-abs aria-label="غائب عن الاختبار">غ</button>
      <input type="number" inputmode="decimal" step="0.5" min="0" enterkeyhint="next" value="${val(s.id)}" aria-label="درجة ${esc(s.name)}"></div>`).join('')}</div>
    <div class="sticky-foot"><span class="muted" data-cnt></span><button class="btn primary" data-save>${ic('check')} حفظ الرصد</button></div>
    ${A ? `<button class="btn danger-ghost block mt" data-del>${ic('trash')} حذف ${kind === 'task' ? 'المهمة' : 'الاختبار'} ودرجاته</button>
      ${A.own ? '' : `<button class="btn ghost block mt" data-ex>${A.excluded ? 'احتسابه في السجل' : 'عدم احتسابه في السجل'}</button>`}` : ''}
  </div>`;
  bindBack(v);
  const inputs = $$('.gb-row input', v), maxEl = v.querySelector('[name=max]');
  const count = () => { const n = inputs.filter(x => x.value !== '').length, a = $$('.gb-row.abs', v).length; v.querySelector('[data-cnt]').textContent = `رُصد ${arNum(n)} من ${arNum(studs.length)}${a ? ` · غائب ${arNum(a)}` : ''}`; };
  inputs.forEach((x, i) => {
    x.oninput = () => { x.closest('.gb-row').classList.toggle('bad', x.value !== '' && (+x.value > +maxEl.value || +x.value < 0)); if (x.value !== '') x.closest('.gb-row').classList.remove('abs'); count(); };
    x.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); (inputs[i + 1] || v.querySelector('[data-save]')).focus(); } };
  });
  $$('[data-abs]', v).forEach(b => b.onclick = () => { const r = b.closest('.gb-row'); r.classList.toggle('abs'); if (r.classList.contains('abs')) r.querySelector('input').value = ''; count(); });
  v.querySelector('[data-allfull]').onclick = () => { inputs.forEach(x => { if (!x.closest('.gb-row').classList.contains('abs')) x.value = maxEl.value; x.dispatchEvent(new Event('input')); }); toast(`رُصدت ${arNum(maxEl.value)} لكل الطلاب — عدّل من يلزم ثم احفظ`, 'ok'); };
  v.querySelector('[data-clear]').onclick = () => { inputs.forEach(x => { x.value = ''; x.dispatchEvent(new Event('input')); }); $$('.gb-row.abs', v).forEach(r => r.classList.remove('abs')); count(); };
  count();
  v.querySelector('[data-save]').onclick = async () => {
    const title = v.querySelector('[name=title]').value.trim(), max = +maxEl.value, date = v.querySelector('[name=date]').value || ymd();
    if (!title) return toast('اكتب عنوان الاختبار', 'bad');
    if (!(max > 0)) return toast('اكتب الدرجة العظمى', 'bad');
    const bad = inputs.find(x => x.value !== '' && (isNaN(+x.value) || +x.value < 0 || +x.value > max));
    if (bad) { bad.focus(); return toast(`درجة أكبر من ${arNum(max)} أو غير صحيحة`, 'bad'); }
    const assessId = A?.own ? A.recs[0].assessId : A ? null : `as${uid()}`;
    const now = new Date().toISOString(); let n = 0;
    for (const row of $$('.gb-row', v)) {
      const sid = row.dataset.sid, x = row.querySelector('input').value, abs = row.classList.contains('abs'), old = rec[sid];
      if (x === '' && !abs) { if (old) await DB.del('grades', old.id); continue; }
      const base = old || { id: `${assessId || 'gr' + uid()}|${sid}`, studentId: sid, classId: cid, source: 'سجل الدرجات', assessId, at: now };
      await DB.put('grades', { ...base, title, max, date, kind: base.assessId ? kind : base.kind, score: abs ? '' : +x, absent: abs || undefined, updatedAt: now });
      n++;
    }
    toast(`✓ حُفظ رصد ${arNum(n)} طالبًا`, 'ok'); App.back();
  };
  v.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`حذف «${esc(A.title)}» و${arNum(A.recs.length)} درجة مرصودة فيه؟`, { ok: 'حذف', danger: true }))) return;
    for (const r of A.recs) await DB.del('grades', r.id);
    toast('حُذف', 'ok', { undo: async () => { await DB.putMany('grades', A.recs); App.render(); } }); App.back();
  });
  v.querySelector('[data-ex]')?.addEventListener('click', async () => {
    const ex = GB.excluded(); ex.has(A.key) ? ex.delete(A.key) : ex.add(A.key);
    await App.set('gbExcluded', [...ex]); toast(ex.has(A.key) ? 'لن يُحتسب في السجل' : 'سيُحتسب في السجل', 'ok'); App.back();
  });
};

/* ===== Excel: ورقة واحدة فيها فصل أو كل الفصول ===== */
async function gbXlsx(cids, T) {
  const header = ['م', 'اسم الطالب', 'الفصل', ...GB_ITEMS.map(I => `${I.t} (${I.max})`), 'المجموع (100)', 'ملاحظة'];
  const out = [];
  for (const cid of cids) {
    const { rows } = await GB.sheetRows(cid, T);
    rows.forEach((r, i) => out.push([i + 1, r.s.name, App.className(cid), ...GB_ITEMS.map(I => r.it[I.k].val === null ? '' : r.it[I.k].val), r.total, r.full ? '' : 'لم تكتمل كل البنود']));
  }
  return buildXlsx('سجل الدرجات', header, out, `سجل رصد درجات ${App.S.subject} — ${App.S.school} — ${T.name} — ${App.S.teacherName}`);
}

/* ===== تعبئة الدرجات في نور (متصفح فصلي الداخلي — لا يضغط حفظ) ===== */
async function gbNoor(cid, T, rows) {
  const r = await sheet(`<div class="info-card">${ic('shield')}<div><b>تعبئة صفحة رصد الدرجات في نور</b><p>افتح في نور صفحة رصد درجات ${esc(App.className(cid))}، ثم اضغط «✍️ عبّئ الدرجات» في شريط فصلي. يطابق فصلي أسماء الطلاب وعناوين الأعمدة ويكتب الدرجات، ثم تراجعها وتضغط أنت «حفظ».</p></div></div>
    <span class="lbl">ماذا أعبّئ؟</span>
    <div class="chips" data-chips="it"><button type="button" class="chip on" data-v="all">كل البنود</button>${GB_ITEMS.map(I => `<button type="button" class="chip" data-v="${I.k}">${I.s}</button>`).join('')}<button type="button" class="chip" data-v="total">المجموع فقط</button></div>
    <button class="btn primary block" data-ok>${ic('send')} جهّز ${arNum(rows.length)} طالبًا وافتح نور</button>
    ${Native.has() ? '' : `<p class="muted small mt">${ic('info')} التعبئة المباشرة تعمل من تطبيق فصلي على الأندرويد (المتصفح الداخلي). من هنا يمكنك تنزيل Excel أو نسخ الدرجات بترتيب الأسماء.</p>
      <button class="btn soft block" data-copy>نسخ الدرجات بترتيب الأسماء</button>`}`, {
    title: 'نور — رصد الدرجات', onMount: (el, close) => {
      bindChips(el);
      el.querySelector('[data-ok]').onclick = () => close({ go: chipVal(el, 'it') || 'all' });
      el.querySelector('[data-copy]')?.addEventListener('click', () => close({ copy: chipVal(el, 'it') || 'all' }));
    }
  });
  if (!r) return;
  const pick = r.go || r.copy, its = pick === 'all' ? GB_ITEMS : pick === 'total' ? [] : GB_ITEMS.filter(I => I.k === pick);
  const items = rows.map(x => ({ name: x.s.name, values: Object.fromEntries([...its.map(I => [I.k, x.it[I.k].val]), ...(pick === 'total' || pick === 'all' ? [['total', x.full ? x.total : null]] : [])].filter(([, v]) => v !== null)) }));
  if (r.copy) {
    const cols = [...its.map(I => I.s), ...(pick === 'total' || pick === 'all' ? ['المجموع'] : [])];
    const txt = [['اسم الطالب', ...cols].join('\t'), ...items.map(x => [x.name, ...[...its.map(I => I.k), ...(cols.length > its.length ? ['total'] : [])].map(k => x.values[k] ?? '')].join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(txt); toast('نُسخت الدرجات', 'ok'); } catch (e) { toast('تعذر النسخ', 'bad'); }
    return;
  }
  if (!Native.has()) return toast('التعبئة المباشرة متاحة في تطبيق الأندرويد', 'bad');
  Native.call('setPlatformFill', JSON.stringify({ mode: 'grades', classId: cid, only: pick === 'all' ? '' : pick, labels: Object.fromEntries([...GB_ITEMS.map(I => [I.k, I.t]), ['total', 'المجموع']]), items }));
  toast(`جُهّزت درجات ${arNum(items.length)} طالبًا — افتح صفحة الرصد في نور`, 'ok');
  PlatformSync.log('noor', 'grades', `درجات ${App.className(cid)} — ${T.name}`);
  PlatformSync.open('noor');
}

/* ===== بطاقة الدرجات في ملف الطالب ===== */
async function gbStudentCard(s) {
  const T = GB.term(), X = await GB.load(T), r = GB.compute(s.id, X, GB.ov(T.id, s.classId));
  return `<div class="card gb-stu"><div class="card-h"><h3>${ic('chart')} سجل الدرجات <small class="muted">${esc(T.name)}</small></h3><button class="btn xs soft" data-gb>فتح السجل</button></div>
    ${GB_ITEMS.map(I => { const x = r.it[I.k], pc = x.val === null ? 0 : x.val / I.max * 100; return `<div class="gb-bar" data-gbk="${I.k}"><span class="gb-bar-t">${I.s}${x.ov ? ' <i class="gb-dot" title="معدّلة يدويًا"></i>' : ''}</span><span class="gb-bar-b"><i style="width:${pc}%"></i></span><b>${GB.fmt(x.val)}<small>/${arNum(I.max)}</small></b></div>`; }).join('')}
    <div class="gb-bar total"><span class="gb-bar-t">المجموع</span><span></span><b>${GB.fmt(r.total)}<small>/${arNum(100)}</small></b></div>
    ${r.full ? '' : '<p class="muted small">بعض البنود لم تُرصد بعد (—).</p>'}</div>`;
}

/* ===== استيراد درجات بند من قائمة ملصوقة أو ملف: الاسم [الفصل] الدرجة ===== */
function gbParseRows(rows) {
  const out = [];
  rows.forEach(r => {
    const cells = r.map(c => String(c ?? '').trim()).filter(Boolean);
    const nums = cells.map(c => c.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace('٫', '.')).map(c => /^\d+(\.\d+)?$/.test(c) ? +c : null);
    const name = cells.find((c, i) => nums[i] === null && /[\u0621-\u064A]{2,}\s+[\u0621-\u064A]{2,}/.test(c) && !GB_CLASS_RX.test(c));
    if (!name) return;
    let val = null; for (let i = nums.length - 1; i >= 0; i--) if (nums[i] !== null) { val = nums[i]; break; }
    if (val === null) return;
    const cl = cells.find(c => GB_CLASS_RX.test(c));
    out.push({ name, cls: cl || '', val });
  });
  return out;
}
const GB_CLASS_RX = /^(?:ال)?(رابع|خامس|سادس)\s*[أابجـ\-]*\s*[أابج]?$/;
function gbClassId(t) {
  const m = String(t).replace(/^ال/, '').match(/(رابع|خامس|سادس)\s*-?\s*([أابج])/); if (!m) return null;
  const g = { رابع: 4, خامس: 5, سادس: 6 }[m[1]], sec = { 'أ': 1, 'ا': 1, 'ب': 2, 'ج': 3 }[m[2]];
  return `g${g}s${sec}`;
}
async function gbImport(T, cid) {
  const r = await sheet(`<span class="lbl">في أي بند أرصد الدرجات؟</span>
    <div class="chips" data-chips="it">${GB_ITEMS.map((I, i) => `<button type="button" class="chip ${I.k === 'part' ? 'on' : ''}" data-v="${I.k}">${I.s} (${arNum(I.max)})</button>`).join('')}</div>
    <label class="fld"><span>الصق القائمة: كل طالب في سطر — الاسم ثم الفصل (اختياري) ثم الدرجة</span><textarea name="t" rows="8" placeholder="يزن محمد ثابت	رابع أ	10&#10;أحمد عبدالرحيم عسيري	رابع أ	8.75"></textarea></label>
    <div class="row gap"><button class="btn primary grow" data-ok>${ic('check')} مطابقة الأسماء</button><button class="btn soft grow" data-file>${ic('upload')} ملف Excel</button></div>
    <p class="muted small mt">إذا كان في السطر أكثر من رقم تُؤخذ آخر درجة فيه. الطلاب غير الموجودين في القائمة لا تتغير درجاتهم.</p>`, {
    title: 'استيراد درجات', onMount: (el, close) => {
      bindChips(el);
      el.querySelector('[data-ok]').onclick = () => close({ k: chipVal(el, 'it'), rows: el.querySelector('[name=t]').value.split(/\n/).map(l => l.split(/\t|,|،|;|\s{2,}|\|/)) });
      el.querySelector('[data-file]').onclick = async () => { const f = await pickFile('.xlsx,.csv,.txt'); if (f) try { close({ k: chipVal(el, 'it'), rows: await readSheetFile(f) }); } catch (e) { toast(esc(e.message), 'bad'); } };
    }
  });
  if (!r) return false;
  const I = GB_ITEMS.find(x => x.k === r.k) || GB_ITEMS[2], list = gbParseRows(r.rows);
  if (!list.length) { toast('لم أجد أسماء ودرجات في القائمة', 'bad'); return false; }
  /* مطابقة: كل كلمة في الاسم المختصر تُبحث في الاسم الكامل (يُقبل اختلاف حرف واحد)، والاسم الأول شرط، ولا يتكرر طالب */
  const W = n => normName(n).replace(/\bعبد\s+/g, 'عبد').replace(/\bبن\s+|\bابن\s+/g, '').replace(/\bال\s*/g, 'ال').split(' ').filter(Boolean);
  const lev1 = (a, b) => { if (a === b) return 1; if (Math.abs(a.length - b.length) > 1 || a.length < 3) return 0; let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return 0; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return e + (a.length - i) + (b.length - j) <= 1 ? .8 : 0; };
  const score = (a, b) => { const A = W(a), B = W(b); if (!A.length || lev1(A[0], B[0]) < .8) return 0; let t = 0, k = 0; A.forEach(w => { let m = 0; for (let q = k; q < B.length; q++) { const v = lev1(w, B[q]); if (v > m) { m = v; if (v === 1) { k = q + 1; break; } } } t += m; }); return t / A.length; };
  const cand = [];
  list.forEach((x, i) => App.students.filter(s => !x.cls || !gbClassId(x.cls) || s.classId === gbClassId(x.cls)).forEach(s => { const v = score(x.name, s.name); if (v >= .6) cand.push({ i, s, v }); }));
  cand.sort((a, b) => b.v - a.v);
  const used = new Set(), pick = {};
  cand.forEach(c => { if (pick[c.i] || used.has(c.s.id)) return; pick[c.i] = c; used.add(c.s.id); });
  const res = list.map((x, i) => ({ ...x, s: pick[i]?.s || null, sc: pick[i]?.v || 0, bad: x.val < 0 || x.val > I.max }));
  const ok = res.filter(x => x.s && !x.bad), miss = res.filter(x => !x.s || x.bad);
  const go = await sheet(`<div class="rep-tiles sm"><div><b>${arNum(ok.length)}</b><small>طابقت</small></div><div><b>${arNum(miss.length)}</b><small>لم تطابق</small></div></div>
    <div class="gb-imp">${res.map(x => `<div class="gb-imp-r ${x.s && !x.bad ? '' : 'no'}"><span class="grow"><b>${esc(x.name)}</b><small>${x.s ? '← ' + esc(x.s.name) + ' · ' + esc(App.className(x.s.classId)) : 'لم أجد الطالب'}${x.bad ? ` · الدرجة أكبر من ${arNum(I.max)}` : ''}</small></span><b>${GB.fmt(x.val)}</b></div>`).join('')}</div>
    <button class="btn primary block mt" data-ok ${ok.length ? '' : 'disabled'}>${ic('check')} رصد ${arNum(ok.length)} درجة في «${I.s}»</button>`, {
    title: 'مراجعة المطابقة', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close(true)
  });
  if (!go) return false;
  const byCls = {}; ok.forEach(x => (byCls[x.s.classId] ||= []).push(x));
  const before = {};
  for (const [c, arr] of Object.entries(byCls)) {
    before[c] = GB.ov(T.id, c); const next = JSON.parse(JSON.stringify(before[c]));
    arr.forEach(x => (next[x.s.id] ||= {})[I.k] = +(+x.val).toFixed(2));
    await GB.setOv(T.id, c, next);
  }
  toast(`✓ رُصدت ${arNum(ok.length)} درجة في «${I.s}»`, 'ok', { undo: async () => { for (const [c, o] of Object.entries(before)) await GB.setOv(T.id, c, o); App.render(); } });
  return true;
}

/* مسح كل درجات المشاركة المرصودة سابقًا مرة واحدة لتبدأ من الصفر (بطلب المعلم، ٢١ أكتوبر ٢٠٢٦) */
async function gbPartReset() {
  if (App.S.gbPartReset1) return;
  for (const k of Object.keys(App.S).filter(k => k.startsWith('gbo_'))) {
    const o = App.S[k]; if (!o || typeof o !== 'object') continue;
    let ch = false; const n = {};
    for (const [sid, m] of Object.entries(o)) { const c = { ...m }; if ('part' in c) { delete c.part; ch = true; } if (Object.keys(c).length) n[sid] = c; }
    if (ch) await App.set(k, n);
  }
  await App.set('gbPartReset1', new Date().toISOString());
}
{ const _start = App.start; App.start = async function () { await _start.apply(this, arguments); try { await gbPartReset(); } catch (e) { console.warn(e); } }; }
