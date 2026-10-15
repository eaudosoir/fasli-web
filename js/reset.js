/* فصلي — تصفير البيانات: كامل أو جزئي (حسب النوع والفصل والفترة) مع نسخة احتياطية تلقائية قبل الحذف */
'use strict';

const recAr = n => n === 1 ? 'سجلًا واحدًا' : n === 2 ? 'سجلين' : n <= 10 ? `${n} سجلات` : `${n} سجلًا`;
const RESET_KINDS = [
  { k: 'att', t: 'الحضور والغياب واعتماد الحصص', ic: 'checkSq', stores: ['attendance', 'sessions'] },
  { k: 'pts', t: 'المشاركة والنقاط والمسابقات', ic: 'star', stores: ['points'] },
  { k: 'hw', t: 'تقصير الواجبات', ic: 'book', stores: ['homework'] },
  { k: 'notes', t: 'الملاحظات والسلوك', ic: 'note', stores: ['notes'] },
  { k: 'ct', t: 'سجل التواصل مع أولياء الأمور', ic: 'phone', stores: ['contacts'] },
  { k: 'gr', t: 'الدرجات ومستوردات مدرستي', ic: 'chart', stores: ['grades', 'imports'] },
  { k: 'rem', t: 'الخطط العلاجية', ic: 'aid', stores: ['remedial'] },
  { k: 'ph', t: 'صور الشواهد', ic: 'camera', stores: ['photos'] },
  { k: 'curr', t: 'إنجاز دروس توزيع المنهج', ic: 'route', settings: ['lessonDone'] },
  { k: 'misc', t: 'المهام ورسائل الأسبوع والشهر المرسلة وسجل الاستخدام', ic: 'list', settings: ['tasks', 'weeklySent', 'monthlySent', 'usageLog'], allOnly: true }
];

const Reset = {
  /* هل السجل ضمن النطاق المختار؟ */
  match(r, sc) {
    if (sc.cls) {
      const cid = r.classId || App.stu[r.studentId]?.classId;
      if (!cid || !sc.cls.includes(cid)) return false;
    }
    if (sc.before) { const d = r.date || (r.at || '').slice(0, 10); if (!d || d >= sc.before) return false; }
    return true;
  },
  async plan(sc) {
    const out = {};
    for (const K of RESET_KINDS) {
      let n = 0;
      for (const s of K.stores || []) n += (await DB.all(s)).filter(r => this.match(r, sc)).length;
      if (K.k === 'curr') { const ld = App.S.lessonDone || {}; Object.entries(ld).forEach(([cid, o]) => { if (!sc.cls || sc.cls.includes(cid)) n += Object.values(o).filter(d => !sc.before || d < sc.before).length; }); }
      if (K.k === 'misc') n = sc.cls ? 0 : (App.S.tasks || []).filter(t => !sc.before || t.date < sc.before).length + (App.S.usageLog || []).filter(u => !sc.before || u.date < sc.before).length + Object.keys(App.S.weeklySent || {}).filter(k => !sc.before || k < sc.before).length + Object.keys(App.S.monthlySent || {}).filter(k => !sc.before || k < sc.before).length;
      out[K.k] = n;
    }
    return out;
  },
  async delWhere(store, pred) {
    const rows = (await DB.all(store)).filter(pred);
    if (rows.length) await DB._tx([store], 'readwrite', t => { const os = t.objectStore(store); rows.forEach(r => os.delete(r.id)); });
    return rows.length;
  },
  async records(kinds, sc) {
    let n = 0;
    for (const K of RESET_KINDS.filter(K => kinds.includes(K.k))) {
      for (const s of K.stores || []) n += await this.delWhere(s, r => this.match(r, sc));
      if (K.k === 'curr') {
        const ld = JSON.parse(JSON.stringify(App.S.lessonDone || {}));
        Object.keys(ld).forEach(cid => { if (sc.cls && !sc.cls.includes(cid)) return; if (!sc.before) delete ld[cid]; else Object.keys(ld[cid]).forEach(w => { if (ld[cid][w] < sc.before) delete ld[cid][w]; }); });
        await App.set('lessonDone', ld);
        if (!sc.cls && !sc.before) await App.set('currBase', Curr.weekOf().n || 0);
      }
      if (K.k === 'misc' && !sc.cls) {
        const keep = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => sc.before && k >= sc.before));
        await App.set('tasks', (App.S.tasks || []).filter(t => sc.before && t.date >= sc.before));
        await App.set('usageLog', (App.S.usageLog || []).filter(u => sc.before && u.date >= sc.before));
        await App.set('weeklySent', keep(App.S.weeklySent)); await App.set('monthlySent', keep(App.S.monthlySent));
      }
    }
    return n;
  },
  /* حذف طلاب فصول محددة مع كل سجلاتهم */
  async students(cls) {
    const ids = new Set((await DB.all('students')).filter(s => cls.includes(s.classId)).map(s => s.id));
    let n = await this.delWhere('students', s => ids.has(s.id));
    for (const s of ['attendance', 'sessions', 'points', 'homework', 'notes', 'contacts', 'grades', 'remedial', 'photos'])
      await this.delWhere(s, r => ids.has(r.studentId) || cls.includes(r.classId));
    const ld = { ...(App.S.lessonDone || {}) }; cls.forEach(c => delete ld[c]); await App.set('lessonDone', ld);
    const seats = { ...(App.S.seats || {}) }; cls.forEach(c => delete seats[c]); await App.set('seats', seats);
    return n;
  },
  /* تصفير كامل: يعود التطبيق كما كان أول تثبيت (يبقى الرمز السري) */
  async factory() {
    const keep = [];
    for (const k of SECRET_KEYS) { const v = await DB.get('settings', k); if (v) keep.push(v); }
    const lock = await DB.get('settings', 'lockEnabled'), bio = await DB.get('settings', 'bioUnlock');
    await DB._tx([...STORES, ...MEDIA_STORES], 'readwrite', t => { [...STORES, ...MEDIA_STORES].forEach(s => t.objectStore(s).clear()); });
    for (const o of [...keep, lock, bio].filter(Boolean)) await DB.put('settings', o);
    await seedIfEmpty();
    await DB.setSetting('snapshotOffered', true); // لا تعرض استعادة النسخة القديمة بعد التصفير المقصود
  },
  async backupFirst(withPhotos) {
    const b = await backupPayload();
    await Native.saveFile(`فصلي-قبل-التصفير-${ymd()}.json`, new Blob([JSON.stringify(b)], { type: 'application/json' }), 'application/json');
    if (withPhotos) {
      const ph = await DB.all('photos');
      if (ph.length) { const z = new JSZip(); ph.forEach((x, i) => z.file(`${x.date}-${i + 1}.jpg`, x.data.split(',')[1], { base64: true })); await Native.saveFile(`صور-الشواهد-قبل-التصفير-${ymd()}.zip`, await z.generateAsync({ type: 'blob' }), 'application/zip'); }
    }
    await App.set('lastBackup', new Date().toISOString());
  }
};

async function resetConfirm(html, word = 'تصفير') {
  return sheet(`<div class="rs-warn">${ic('alert')}<div>${html}</div></div>
    <p class="small">${ic('download')} ستُحفظ <b>نسخة احتياطية كاملة</b> في التنزيلات قبل الحذف، وتستطيع استعادتها من «النسخ الاحتياطي» إن احتجت.</p>
    <label class="fld"><span>للتأكيد اكتب كلمة «${word}»</span><input name="w" autocomplete="off" placeholder="${word}"></label>
    <button class="btn danger block" data-ok disabled>${ic('trash')} نفّذ التصفير</button>`, {
    title: 'تأكيد التصفير', onMount: (el, close) => {
      const i = el.querySelector('[name=w]'), b = el.querySelector('[data-ok]');
      i.oninput = () => { b.disabled = i.value.trim() !== word; };
      b.onclick = () => close(true);
    }
  });
}

Screens.reset = async (v, p) => {
  const mode = p.mode || 'records';
  const allCls = App.classes.filter(c => App.classStudents(c.id).length || (mode === 'records'));
  const cls = p.cls || null; // null = كل الفصول
  const kinds = p.kinds || [];
  const before = p.period === 'before' ? (p.before || ymd()) : '';
  const sc = { cls, before };
  const plan = mode === 'records' ? await Reset.plan(sc) : {};
  const total = kinds.reduce((a, k) => a + (plan[k] || 0), 0);
  const studN = cls ? App.students.filter(s => cls.includes(s.classId)).length : 0;
  const clsChips = (multiAllowAll = true) => `<div class="class-chips">${multiAllowAll ? `<button class="chip ${!cls ? 'on' : ''}" data-call>كل الفصول</button>` : ''}${App.classes.map(c => `<button class="chip ${cls?.includes(c.id) ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>`;
  v.innerHTML = topbar('تصفير البيانات') + `<div class="page">
    <div class="stars-hero danger-hero">${ic('trash')}<div><b>تصفير التطبيق أو جزء منه</b><small>اختر ما تريد مسحه بدقة — تُحفظ نسخة احتياطية تلقائيًا قبل أي حذف</small></div></div>
    <div class="seg small"><button data-m="records" class="${mode === 'records' ? 'on' : ''}">سجلات محددة</button><button data-m="students" class="${mode === 'students' ? 'on' : ''}">طلاب فصول</button><button data-m="all" class="${mode === 'all' ? 'on' : ''}">تصفير كامل</button></div>

    ${mode === 'records' ? `
    <section class="card"><div class="card-h"><h3>${ic('list')} ماذا تريد أن تمسح؟</h3><button class="lnk" data-kall>${kinds.length === RESET_KINDS.length ? 'إلغاء الكل' : 'تحديد الكل'}</button></div>
      <div class="rs-kinds">${RESET_KINDS.map(K => { const dis = K.allOnly && cls; return `<label class="rs-k ${kinds.includes(K.k) ? 'on' : ''} ${dis ? 'dis' : ''}"><input type="checkbox" data-k="${K.k}" ${kinds.includes(K.k) ? 'checked' : ''} ${dis ? 'disabled' : ''}><span class="rs-ic">${ic(K.ic)}</span><span class="grow">${K.t}${dis ? '<small>متاح عند اختيار كل الفصول</small>' : ''}</span><b class="rs-n">${plan[K.k] || 0}</b></label>`; }).join('')}</div></section>
    <section class="card"><div class="card-h"><h3>${ic('users')} لأي فصول؟</h3></div>${clsChips()}</section>
    <section class="card"><div class="card-h"><h3>${ic('cal')} الفترة</h3></div>
      <div class="seg small"><button data-per="all" class="${!before ? 'on' : ''}">كل السجلات</button><button data-per="before" class="${before ? 'on' : ''}">ما قبل تاريخ</button></div>
      ${before ? `<label class="fld"><span>احذف السجلات المسجّلة قبل</span><input type="date" data-before value="${before}"></label><p class="muted small">مفيد عند بداية فصل دراسي جديد: تبدأ من الصفر وتبقى سجلات ما بعد التاريخ.</p>` : ''}</section>
    <p class="hint">${ic('info')} الطلاب والجدول والإعدادات تبقى كما هي في هذا الخيار.</p>
    <button class="btn danger block" data-go-reset ${total ? '' : 'disabled'}>${ic('trash')} مسح ${total ? recAr(total) : 'السجلات'}</button>` : ''}

    ${mode === 'students' ? `
    <section class="card"><div class="card-h"><h3>${ic('users')} اختر الفصول</h3></div>${clsChips(false)}
      <p class="muted small">يُحذف طلاب الفصول المختارة <b>مع كل سجلاتهم</b> (حضور، نقاط، واجبات، ملاحظات، تواصل، درجات، خطط، صور). بعدها تستطيع استيراد الطلاب من جديد من ملف نور.</p></section>
    <button class="btn danger block" data-go-stud ${studN ? '' : 'disabled'}>${ic('trash')} حذف ${studN ? studAr(studN) : 'الطلاب'} وسجلاتهم</button>` : ''}

    ${mode === 'all' ? `
    <section class="card rs-all"><div class="card-h"><h3>${ic('alert')} تصفير كامل للتطبيق</h3></div>
      <p>يعود فصلي كما كان عند أول تثبيت: <b>كل السجلات والصور والإعدادات تُمسح</b>، ثم تُحمَّل من جديد قائمة طلابك الأصلية (280 طالبًا) وجدولك وأوقات الجرس.</p>
      <ul class="small"><li>يبقى الرمز السري وقفل التطبيق كما هما.</li><li>تُحفظ قبلها نسخة احتياطية كاملة + ملف مضغوط بالصور.</li></ul></section>
    <button class="btn danger block" data-go-all>${ic('trash')} تصفير كامل</button>` : ''}
  </div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-m]', v).forEach(b => b.onclick = () => setP({ mode: b.dataset.m, cls: null }));
  v.querySelector('[data-call]')?.addEventListener('click', () => setP({ cls: null }));
  $$('[data-c]', v).forEach(b => b.onclick = () => { const c = b.dataset.c; const a = cls ? (cls.includes(c) ? cls.filter(x => x !== c) : [...cls, c]) : [c]; setP({ cls: a.length ? a : null, kinds: a.length ? kinds.filter(k => !RESET_KINDS.find(K => K.k === k).allOnly) : kinds }); });
  $$('[data-k]', v).forEach(i => i.onchange = () => setP({ kinds: i.checked ? [...kinds, i.dataset.k] : kinds.filter(k => k !== i.dataset.k) }));
  v.querySelector('[data-kall]')?.addEventListener('click', () => setP({ kinds: kinds.length === RESET_KINDS.length ? [] : RESET_KINDS.filter(K => !(K.allOnly && cls)).map(K => K.k) }));
  $$('[data-per]', v).forEach(b => b.onclick = () => setP({ period: b.dataset.per }));
  v.querySelector('[data-before]')?.addEventListener('change', e => setP({ before: e.target.value }));
  const done = async (msg) => { await App.load(); App.syncNative(); try { await Cloud.snap(true); } catch (e) { } toast(msg, 'ok'); App.stack = []; App.go('home'); };

  v.querySelector('[data-go-reset]')?.addEventListener('click', async () => {
    const names = RESET_KINDS.filter(K => kinds.includes(K.k)).map(K => `${K.t} (${plan[K.k] || 0})`);
    const where = cls ? cls.map(c => App.className(c)).join('، ') : 'كل الفصول';
    if (!await resetConfirm(`سيُمسح <b>${recAr(total)}</b> نهائيًا:<br><small>${esc(names.join(' · '))}<br>الفصول: ${esc(where)}${before ? ` · قبل ${shortDate(before)}` : ''}</small>`)) return;
    await Reset.backupFirst(kinds.includes('ph'));
    const n = await Reset.records(kinds, sc);
    await done(`تم مسح ${recAr(n)} ✓`);
  });
  v.querySelector('[data-go-stud]')?.addEventListener('click', async () => {
    if (!await resetConfirm(`سيُحذف <b>${studAr(studN)}</b> من ${esc(cls.map(c => App.className(c)).join('، '))} مع كل سجلاتهم.`)) return;
    await Reset.backupFirst(true);
    const n = await Reset.students(cls);
    await done(`حُذف ${studAr(n)} وسجلاتهم ✓`);
  });
  v.querySelector('[data-go-all]')?.addEventListener('click', async () => {
    if (!await resetConfirm('سيُمسح <b>كل شيء</b> في التطبيق ويعود كأول تثبيت.', 'تصفير كامل')) return;
    await Reset.backupFirst(true);
    await Reset.factory();
    await done('تم تصفير التطبيق بالكامل ✓');
  });
};
