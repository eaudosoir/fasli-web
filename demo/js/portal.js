/* فصلي — بوابة الطالب (المرحلة ١): حسابات الدخول وبطاقات أولياء الأمور
 * لكل طالب معرّف قصير (s001) وكلمة مرور من ٦ أرقام، تُحفظ في إعدادات المعلم (الإعداد portal) على جهازه.
 * لا يُرفع شيء إلى الإنترنت في هذه المرحلة؛ الرفع والصفحة الخاصة بالطالب في المراحل التالية. */
'use strict';

const PORTAL_URL = 'eaudosoir.github.io/fasli-web/student';

const Portal = {
  cfg() { const c = App.S.portal || {}; return { accounts: c.accounts || {}, next: c.next || 1 }; },
  account(sid) { return this.cfg().accounts[sid] || null; },
  async save(c) { await App.set('portal', { accounts: c.accounts, next: c.next }); },
  newPass() {
    // ٦ أرقام عشوائية، بلا تكرار رقم واحد ولا تسلسل بسيط
    const bad = p => /^(\d)\1{5}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p);
    let p;
    do {
      const a = new Uint32Array(6); (window.crypto || window.msCrypto).getRandomValues(a);
      p = Array.from(a, x => x % 10).join('');
    } while (bad(p));
    return p;
  },
  async create(sids) {
    const c = this.cfg(); const used = new Set(Object.values(c.accounts).map(a => a.id)); let made = 0;
    for (const sid of sids) {
      if (c.accounts[sid]) continue;
      let id; do { id = 's' + String(c.next++).padStart(3, '0'); } while (used.has(id));
      used.add(id); c.accounts[sid] = { id, pass: this.newPass(), created: ymd() }; made++;
    }
    if (made) await this.save(c);
    return made;
  },
  async resetPass(sid) {
    const c = this.cfg(); if (!c.accounts[sid]) return;
    c.accounts[sid] = { ...c.accounts[sid], pass: this.newPass(), reset: ymd() }; await this.save(c);
  }
};

Screens.portal = async (v, p) => {
  const classes = App.classes.filter(c => App.classStudents(c.id).length);
  const cid = classes.some(c => c.id === p.classId) ? p.classId : (classes.some(c => c.id === App._lastClass) ? App._lastClass : classes[0]?.id);
  const studs = cid ? App.classStudents(cid).slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')) : [];
  const withAcc = studs.filter(s => Portal.account(s.id));
  const missing = studs.length - withAcc.length;
  const total = Object.keys(Portal.cfg().accounts).length;

  const card = s => { const a = Portal.account(s.id); return `<div class="pt-card">
      <div class="pt-top"><img src="img/brand-navy.png" alt="فصلي"><span>بوابة الطالب</span></div>
      <b class="pt-name">${esc(s.name)}</b>
      <small class="pt-cls">${esc(App.className(cid))} · ${esc(App.S.subject || 'الدراسات الاجتماعية')}</small>
      <div class="pt-cred"><div><small>معرّف الدخول</small><code>${a.id}</code></div><div><small>كلمة المرور</small><code>${a.pass}</code></div></div>
      <small class="pt-url">${PORTAL_URL}</small>
      <small class="pt-note">ولي الأمر الكريم: من هذا الرابط تتابع حضور ابنك ونقاطه وواجباته. احتفظ بالبطاقة ولا تشاركها.</small>
      <small class="pt-t">${esc(App.S.teacherName || '')}</small>
    </div>`; };

  v.innerHTML = topbar('بوابة الطالب') + `<div class="page">
    <div class="info-card no-print">${ic('users')}<div><b>حساب لكل طالب يدخل به هو أو ولي أمره</b><p>يرى الطالب بطاقته وحده: الحضور، والنقاط وترتيبه، والأوسمة، والواجبات، وملاحظتك التشجيعية. لا يظهر له السلوك السلبي ولا الخطة العلاجية، ولا يُرفع رقم جوال ولا هوية.</p></div></div>
    ${classes.length ? `
    <div class="chips no-print">${classes.map(c => `<button class="chip ${c.id === cid ? 'on' : ''}" data-c="${c.id}">${esc(App.className(c.id))}</button>`).join('')}</div>
    <div class="rep-tiles no-print"><div><b>${studs.length}</b><small>طلاب الفصل</small></div><div><b>${withAcc.length}</b><small>لهم حسابات</small></div><div><b>${total}</b><small>كل الحسابات</small></div></div>
    <div class="row no-print pt-acts">
      ${missing ? `<button class="btn gold block" data-mk>${ic('plus')} إنشاء ${missing === studs.length ? 'حسابات الفصل' : `${missing} حساب ناقص`}</button>` : ''}
      ${withAcc.length ? `<button class="btn soft block" data-print>${ic('print')} طباعة بطاقات الفصل</button>` : ''}
    </div>
    <section class="card no-print"><div class="rec-list">${studs.map(s => { const a = Portal.account(s.id); return `<div class="rec"><span class="av">${esc(initials(s.name))}</span><div class="grow"><b>${esc(s.name)}</b><small>${a ? `المعرّف <code>${a.id}</code> · كلمة المرور <code>${a.pass}</code>` : 'لا يوجد حساب بعد'}</small></div>${a ? `<button class="icon-btn sm" data-rp="${s.id}" aria-label="كلمة مرور جديدة">${ic('history')}</button>` : ''}</div>`; }).join('')}</div></section>
    <p class="hint no-print">${ic('info')} هذه المرحلة تُنشئ الحسابات والبطاقات فقط. رابط البوابة يعمل بعد اكتمال المراحل التالية.</p>
    <div class="print-area pt-print">${withAcc.map(card).join('')}</div>`
    : `<div class="empty">${ic('users')}<h3>لا يوجد طلاب بعد</h3><p>أضف طلابك أو استوردهم من ملف نور أولًا.</p></div>`}
  </div>`;
  bindBack(v);
  $$('[data-c]', v).forEach(b => b.onclick = () => { App._lastClass = b.dataset.c; App.render(); });
  v.querySelector('[data-mk]')?.addEventListener('click', async () => {
    const n = await Portal.create(studs.map(s => s.id));
    toast(`أُنشئ ${n} حساب`, 'ok'); App.render();
  });
  $$('[data-rp]', v).forEach(b => b.onclick = async () => {
    const s = App.stu[b.dataset.rp];
    if (!await confirmBox(`كلمة مرور جديدة لـ«${esc(s.name)}»؟<br><small>تتوقف كلمة المرور القديمة، ويلزم طباعة بطاقة جديدة له.</small>`, { ok: 'إنشاء كلمة جديدة' })) return;
    await Portal.resetPass(s.id); toast('تم تغيير كلمة المرور', 'ok'); App.render();
  });
  v.querySelector('[data-print]')?.addEventListener('click', () => Native.print(`بطاقات بوابة الطالب — ${App.className(cid)}`));
};
