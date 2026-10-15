/* فصلي — المزامنة مع منصة مدرستي ونظام نور (متصفح داخل التطبيق، دخول المعلم بنفسه) */
'use strict';

const PLATFORMS = [
  { k: 'madrasati', name: 'منصة مدرستي', url: 'https://schools.madrasati.sa/', icon: 'school', sub: 'الواجبات وحالة التسليم، الاختبارات والدرجات، قوائم الفصول' },
  { k: 'noor', name: 'نظام نور', url: 'https://noor.moe.gov.sa/', icon: 'shield', sub: 'رصد الغياب، قوائم الطلاب والفصول وأرقام أولياء الأمور' }
];

const PlatformSync = {
  lastFill: null,
  open(k) {
    const p = PLATFORMS.find(x => x.k === k) || PLATFORMS[0];
    const last = (App.S.platformLast || {})[k];
    if (!Native.has()) return Native.open(last || p.url);
    Native.call('openPlatform', last || p.url);
    logUse('platform');
  },
  closed() {
    if (this.lastFill) { const r = this.lastFill; this.lastFill = null; this.showFill(r); }
  },
  /* جداول قرأها الشريط من صفحة المنصة */
  async receive(json) {
    let d; try { d = JSON.parse(json); } catch (e) { return toast('تعذر قراءة الصفحة', 'bad'); }
    const k = /noor/i.test(d.host) ? 'noor' : 'madrasati';
    await App.set('platformLast', { ...(App.S.platformLast || {}), [k]: d.url });
    const tabs = d.tables.map((t, i) => ({ i, rows: t.rows, ...guessTable(t.rows) })).sort((a, b) => b.score - a.score);
    if (!tabs.length) return toast('لا يوجد جدول في الصفحة', 'bad');
    const kinds = [['students', 'طلاب وفصول', 'users'], ['hw', 'واجبات وحالة التسليم', 'book'], ['test', 'درجات اختبار', 'school']];
    const r = await sheet(`<div class="who">${ic('sync')} <b>${esc(d.heads[0] || d.title || 'صفحة المنصة')}</b><small>${esc(k === 'noor' ? 'نظام نور' : 'منصة مدرستي')} · ${tabs.length} جدول</small></div>
      <span class="lbl">اختر الجدول</span>
      <div class="pt-list">${tabs.map((t, n) => `<label class="pt-item"><input type="radio" name="t" value="${t.i}" ${n === 0 ? 'checked' : ''}><div><b>${t.rows.length - 1} صف · ${esc((t.rows[t.hi] || []).slice(0, 5).join(' | '))}</b>
        <small>${esc((t.rows[t.hi + 1] || []).slice(0, 4).join(' | '))}</small>${t.names ? `<em>${t.names} اسمًا من طلابك</em>` : ''}</div></label>`).join('')}</div>
      <span class="lbl">ماذا أستورد منه؟</span>
      <div class="chips" data-chips="kind">${kinds.map(([v, l]) => `<button type="button" class="chip ${v === tabs[0].kind ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <button class="btn primary block" data-ok>${ic('download')} متابعة</button>`, {
      title: 'استيراد من المنصة', onMount: (el, close) => {
        bindChips(el);
        $$('[name=t]', el).forEach(x => x.onchange = () => { const t = tabs.find(y => String(y.i) === x.value); $$('[data-chips="kind"] .chip', el).forEach(c => c.classList.toggle('on', c.dataset.v === t.kind)); });
        el.querySelector('[data-ok]').onclick = () => close({ i: +el.querySelector('[name=t]:checked').value, kind: chipVal(el, 'kind') });
      }
    });
    if (!r) return;
    const t = d.tables[r.i].rows;
    const title = d.heads.find(h => /واجب|اختبار|تقويم|مهمة|نشاط/.test(h)) || d.heads[0] || d.title;
    await this.log(k, r.kind, title);
    if (r.kind === 'students') return importStudents(t);
    return madrasatiImport(r.kind, t, title);
  },
  /* ملف Excel صُدّر من داخل المنصة */
  async file(name, b64) {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const f = new File([bin], name || 'تقرير.xlsx');
    const r = await choose(`وصل ملف من المنصة: ${name}`, [
      { value: 'hw', label: 'تقرير واجبات', sub: 'من لم يسلّم يُسجَّل في متابعة الواجبات', icon: ic('book') },
      { value: 'test', label: 'تقرير اختبار', sub: 'الدرجات في ملف كل طالب', icon: ic('school') },
      { value: 'students', label: 'قائمة طلاب', sub: 'تحديث الفصول وأرقام أولياء الأمور', icon: ic('users') }]);
    if (!r) return;
    await this.log('file', r, name);
    if (r === 'students') return importStudents(f);
    return madrasatiImport(r, f, name);
  },
  async log(k, kind, title) {
    const L = (App.S.syncLog || []).slice(-60);
    L.push({ k, kind, title: String(title || '').slice(0, 80), at: new Date().toISOString() });
    await App.set('syncLog', L);
  },
  fillDone(json) { try { this.lastFill = JSON.parse(json); } catch (e) { } },
  showFill(r) {
    sheet(`<div class="rep-tiles sm"><div><b>${r.done.length}</b><small>عُبّئ</small></div><div><b>${r.missing.length}</b><small>لم أجده</small></div></div>
      ${r.missing.length ? `<p class="muted small">لم أجد هؤلاء في الصفحة — عبّئهم يدويًا:</p><ul class="pt-miss">${r.missing.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : `<p class="center">${ic('check')} عُبّئ الجميع — تأكد أنك ضغطت «حفظ» في المنصة</p>`}
      <button class="btn primary block" data-close>تم</button>`, { title: 'نتيجة تعبئة الغياب' });
  }
};

/* تخمين نوع الجدول وصف العناوين */
function guessTable(rows) {
  const hi = Math.max(0, rows.findIndex(r => r.some(c => /اسم/.test(c))));
  const H = (rows[hi] || []).join(' ');
  const names = new Set(App.students.map(s => normName(s.name)));
  let hits = 0;
  rows.slice(hi + 1).forEach(r => { if (r.some(c => names.has(normName(c)) || App.students.some(s => c.length > 8 && nameScore(c, s.name) >= .75))) hits++; });
  const kind = /تسليم|سلّم|سلم|واجب|مهم/.test(H) ? 'hw' : /درج|نتيج|علام/.test(H) ? 'test' : /حال/.test(H) ? 'hw' : /جوال|هوي|سجل|الصف|الفصل/.test(H) ? 'students' : 'hw';
  return { hi, kind, names: hits, score: hits * 10 + rows.length + (hi >= 0 ? 5 : 0) };
}

Screens.platforms = async (v, p) => {
  const date = p.date || ymd(), period = p.period ?? 0;
  const att = (await DB.byIndex('attendance', 'date', date)).filter(a => a.status !== 'present' && (!period || a.period === period));
  const by = {}; att.forEach(a => { const s = App.stu[a.studentId]; if (!s) return; const k = s.classId; (by[k] ||= {})[a.studentId] = a.status; });
  const cid = p.classId && by[p.classId] ? p.classId : Object.keys(by)[0];
  const items = cid ? Object.entries(by[cid]).map(([sid, st]) => ({ sid, name: App.stu[sid].name, status: st })).sort((a, b) => a.name.localeCompare(b.name, 'ar')) : [];
  const log = (App.S.syncLog || []).slice(-6).reverse();
  v.innerHTML = topbar('المزامنة مع المنصات') + `<div class="page">
    <div class="info-card">${ic('shield')}<div><b>آمنة ومن داخل حسابك</b><p>تفتح المنصة داخل فصلي وتسجّل دخولك بنفسك، ولا يحفظ التطبيق كلمة مرورك. في أي صفحة يظهر شريط «فصلي»: <b>اقرأ هذه الصفحة</b> لسحب الطلاب أو الواجبات أو الدرجات، و<b>عبّئ الغياب</b> لتحديد الغائبين — ثم تضغط أنت «حفظ» في المنصة.</p></div></div>
    <div class="big-actions">${PLATFORMS.map(x => `<button class="big-act" data-pf="${x.k}">${ic(x.icon)}<b>فتح ${x.name}</b><small>${x.sub}</small></button>`).join('')}</div>
    <section class="card"><div class="card-h"><h3>${ic('send')} إرسال الغياب إلى نور</h3></div>
      <div class="row gap"><label class="fld grow"><span>اليوم</span><input type="date" data-date value="${date}" max="${ymd()}"></label>
        <label class="fld grow"><span>الحصة</span><select data-period><option value="0">كل الحصص</option>${App.bell.periods.map(x => `<option value="${x.n}" ${x.n === period ? 'selected' : ''}>${ordinal(x.n)}</option>`).join('')}</select></label></div>
      ${Object.keys(by).length ? `<div class="class-chips">${Object.keys(by).map(k => `<button class="chip ${k === cid ? 'on' : ''}" data-cl="${k}">${esc(App.className(k))} <small>${Object.keys(by[k]).length}</small></button>`).join('')}</div>
        <div class="pt-abs">${items.map(x => `<span class="st-${x.status}">${esc(x.name)} <i>${ATT[x.status].label}</i></span>`).join('')}</div>
        <button class="btn primary block" data-fill>${ic('send')} جهّز ${items.length} ${items.length > 10 ? 'طالبًا' : 'طلاب'} وافتح نور</button>
        <p class="muted small">في نور افتح صفحة رصد غياب ${esc(App.className(cid))} ليوم ${shortDate(date)}، ثم اضغط «✍️ عبّئ الغياب» في شريط فصلي، راجع الصفوف الملوّنة، واضغط حفظ.</p>`
        : `<div class="empty sm">لا غياب أو تأخر مسجل ${period ? 'في هذه الحصة' : 'في هذا اليوم'} ✓</div>`}
    </section>
    <section class="card"><div class="card-h"><h3>${ic('upload')} استيراد ملف صدّرته من المنصة</h3></div>
      <div class="row gap"><button class="btn soft grow" data-imp="hw">${ic('book')} واجبات</button><button class="btn soft grow" data-imp="test">${ic('school')} اختبار</button><button class="btn soft grow" data-imp="students">${ic('users')} طلاب</button></div></section>
    ${log.length ? `<section class="card"><div class="card-h"><h3>${ic('history')} آخر المزامنات</h3></div>${log.map(l => `<div class="rec"><span class="rec-ic">${ic(l.kind === 'students' ? 'users' : l.kind === 'test' ? 'school' : 'book')}</span><div><b>${esc(l.title || '—')}</b><small>${shortDate(l.at.slice(0, 10))} · ${l.k === 'noor' ? 'نور' : l.k === 'file' ? 'ملف' : 'مدرستي'}</small></div></div>`).join('')}</section>` : ''}
    ${Native.has() ? '' : `<p class="muted small center">${ic('info')} المتصفح الداخلي وشريط فصلي يعملان في تطبيق الأندرويد.</p>`}
  </div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-pf]', v).forEach(b => b.onclick = () => PlatformSync.open(b.dataset.pf));
  v.querySelector('[data-date]').onchange = e => setP({ date: e.target.value, classId: null });
  v.querySelector('[data-period]').onchange = e => setP({ period: +e.target.value });
  $$('[data-cl]', v).forEach(b => b.onclick = () => setP({ classId: b.dataset.cl }));
  v.querySelector('[data-fill]')?.addEventListener('click', () => {
    Native.call('setPlatformFill', JSON.stringify({ date, classId: cid, items: items.map(x => ({ name: x.name, status: x.status })) }));
    toast(`جُهّز ${items.length} للتعبئة — افتح صفحة الرصد في نور`, 'ok');
    PlatformSync.log('noor', 'absence', `غياب ${App.className(cid)} ${shortDate(date)}`);
    PlatformSync.open('noor');
  });
  $$('[data-imp]', v).forEach(b => b.onclick = () => b.dataset.imp === 'students' ? importStudents() : madrasatiImport(b.dataset.imp));
};
