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
  async setMsg(sid, msg) {
    const c = this.cfg(); if (!c.accounts[sid]) return;
    c.accounts[sid] = { ...c.accounts[sid], msg: msg.trim().slice(0, 300) }; await this.save(c);
  },
  email: id => `${id}@student.fasli.app`,
  online: () => typeof Sync !== 'undefined' && Sync.configured() && Sync.on() && !!Sync.portalApi?.uid(),

  /* ملخص الطالب الذي يُرفع — لا جوال ولا هوية ولا سلوك سلبي ولا خطة علاجية */
  summary(sid, D, rankOf) {
    const s = App.stu[sid], a = this.account(sid);
    const from = (typeof CURR_WEEKS !== 'undefined' && CURR_WEEKS[0][1]) || '2000-01-01', to = ymd();
    const m = monthlyData(sid, D, [], from, to);
    const [wf, wt] = weekRange();
    const weekPts = D.pts.filter(x => x.studentId === sid && x.date >= wf && x.date <= wt).reduce((t, x) => t + (x.value || 1), 0);
    const r = rankOf[sid] || {};
    return {
      v: 1, name: s.name, cls: App.className(s.classId), subject: App.S.subject || 'الدراسات الاجتماعية',
      teacher: App.S.teacherName || '', school: App.S.school || '', updated: new Date().toISOString(),
      att: { total: m.total, present: m.present, absent: m.absent, late: m.late, rate: m.rate },
      points: m.points, weekPoints: weekPts, part: m.part, rank: r.rank || null, classmates: r.n || null,
      star: !!r.star, badges: studentBadges(sid, D).map(b => ({ icon: b.icon, name: b.name, desc: b.desc })),
      hwOpen: m.hwOpen, msg: a?.msg || ''
    };
  },
  ranks(classIds, D) {
    const out = {};
    for (const cid of classIds) {
      const studs = App.classStudents(cid), tot = {};
      D.pts.forEach(x => { if (App.stu[x.studentId]?.classId === cid) tot[x.studentId] = (tot[x.studentId] || 0) + (x.value || 1); });
      const stars = new Set(weekStars(cid, D).slice(0, 3).filter(x => x.score > 0).map(x => x.sid));
      studs.forEach(st => { const mine = tot[st.id] || 0; out[st.id] = { rank: 1 + studs.filter(o => (tot[o.id] || 0) > mine).length, n: studs.length, star: stars.has(st.id) }; });
    }
    return out;
  },

  /* إنشاء حساب الطالب في Firebase أو تحديث كلمة مروره عند تغييرها */
  async ensureAuth(a) {
    const { post, cfg } = Sync.portalApi, base = `${cfg.authBase}/v1/accounts`, key = `?key=${cfg.apiKey}`, email = this.email(a.id);
    const err = j => (j?.error?.message || '').split(' ')[0];
    if (!a.uid) {
      const r = await post(`${base}:signUp${key}`, { email, password: a.pass, returnSecureToken: true });
      if (r.ok) return { uid: r.j.localId, fbPass: a.pass };
      if (err(r.j) !== 'EMAIL_EXISTS') throw new Error(err(r.j) || 'signUp');
    }
    if (a.uid && a.fbPass === a.pass) return { uid: a.uid, fbPass: a.fbPass };
    // الحساب موجود: نسجّل دخوله بكلمة المرور المسجلة سابقًا ثم نضع الجديدة
    for (const old of [a.fbPass, a.pass].filter(Boolean)) {
      const r = await post(`${base}:signInWithPassword${key}`, { email, password: old, returnSecureToken: true });
      if (!r.ok) { if (err(r.j).startsWith('TOO_MANY')) throw new Error('TOO_MANY_ATTEMPTS_TRY_LATER'); continue; }
      if (old !== a.pass) { const u = await post(`${base}:update${key}`, { idToken: r.j.idToken, password: a.pass, returnSecureToken: false }); if (!u.ok) throw new Error(err(u.j) || 'update'); }
      return { uid: r.j.localId, fbPass: a.pass };
    }
    throw new Error('LOGIN_FAILED');
  },

  /* رفع ملخصات الطلاب: الحسابات أولًا ثم وثيقة لكل طالب في portal/{uid} */
  async publish(classIds, progress = () => { }) {
    if (!this.online()) throw new Error('سجّل دخولك في «الحساب والمزامنة» أولًا');
    const { fs, cfg, uid } = Sync.portalApi, me = uid();
    const D = await Follow.load(), rankOf = this.ranks(classIds, D), c = this.cfg();
    const sids = classIds.flatMap(cid => App.classStudents(cid).map(s => s.id)).filter(sid => c.accounts[sid]);
    let done = 0, failed = [], stopped = '';
    const writes = [];
    for (const sid of sids) {
      progress(`الحسابات ${++done} / ${sids.length}`);
      try {
        const r = await this.ensureAuth(c.accounts[sid]);
        c.accounts[sid] = { ...c.accounts[sid], ...r };
        writes.push({
          update: { name: `projects/${cfg.projectId}/databases/(default)/documents/portal/${r.uid}`, fields: { teacher: { stringValue: me }, sid: { stringValue: sid }, d: { stringValue: JSON.stringify(this.summary(sid, D, rankOf)) } } },
          updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }]
        });
      } catch (e) {
        if (String(e.message).startsWith('TOO_MANY') || String(e.message).startsWith('QUOTA')) { stopped = 'limit'; break; }
        failed.push(App.stu[sid]?.name || sid);
      }
    }
    await this.save(c);
    for (let i = 0; i < writes.length; i += 300) { progress(`رفع الملخصات ${Math.min(i + 300, writes.length)} / ${writes.length}`); await fs(':commit', { writes: writes.slice(i, i + 300) }); }
    const res = { sent: writes.length, failed, stopped, total: sids.length, at: new Date().toISOString() };
    const st = { ...(App.S.portalLast || {}) }, rs = { ...(App.S.portalResult || {}) };
    classIds.forEach(cid => { if (writes.length) st[cid] = res.at; rs[cid] = res; });
    await App.set('portalLast', st); await App.set('portalResult', rs);
    return res;
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
    ${withAcc.length ? `<section class="card no-print pt-pub"><div class="grow"><b>${ic('upload')} تحديث البوابة</b><small>${Portal.online() ? (App.S.portalLast?.[cid] ? `آخر تحديث لهذا الفصل: ${(d => `${shortDate(ymd(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)(new Date(App.S.portalLast[cid]))}` : 'لم يُرفع ملخص هذا الفصل بعد') : 'يتطلب تسجيل الدخول في «الحساب والمزامنة»'}</small>
      ${(r => r ? `<small class="pt-res ${r.failed.length || r.stopped || r.sent < r.total ? 'bad' : 'ok'}">نتيجة آخر محاولة: رُفعت ${r.sent} من ${r.total} بطاقة${r.failed.length ? ` · تعذّر ${r.failed.length}: ${esc(r.failed.slice(0, 3).join('، '))}` : ''}${r.stopped ? ' · توقف لحد Firebase، أعد المحاولة بعد ساعة' : ''}${r.err ? ` · ${esc(r.err)}` : ''}</small>` : '')(App.S.portalResult?.[cid])}</div>
      <div class="row gap"><button class="btn primary sm" data-pub="one">هذا الفصل</button><button class="btn ghost sm" data-pub="all">كل الفصول</button></div></section>` : ''}
    <section class="card no-print"><div class="rec-list">${studs.map(s => { const a = Portal.account(s.id); return `<div class="rec"><span class="av">${esc(initials(s.name))}</span><div class="grow"><b>${esc(s.name)}</b><small>${a ? `المعرّف <code>${a.id}</code> · كلمة المرور <code>${a.pass}</code>` : 'لا يوجد حساب بعد'}</small></div>${a ? `<button class="icon-btn sm" data-msg="${s.id}" aria-label="رسالة للطالب">${ic(a.msg ? 'note' : 'edit')}</button><button class="icon-btn sm" data-rp="${s.id}" aria-label="كلمة مرور جديدة">${ic('history')}</button>` : ''}</div>`; }).join('')}</div></section>
    <p class="hint no-print">${ic('info')} زر ${ic('edit')} يكتب رسالة تشجيعية تظهر للطالب في بطاقته. التحديث يرفع الملخص فقط، ويُعاد متى شئت.</p>
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
  $$('[data-msg]', v).forEach(b => b.onclick = async () => {
    const s = App.stu[b.dataset.msg], a = Portal.account(s.id);
    const txt = await sheet(`<label class="fld"><span>رسالة تشجيعية لـ«${esc(s.name)}» تظهر في بطاقته</span><textarea name="m" rows="4" maxlength="300" placeholder="مثال: أحسنت في مشاركتك هذا الأسبوع، واصل يا بطل">${esc(a.msg || '')}</textarea></label><button class="btn primary block" data-ok>حفظ</button>`,
      { title: 'رسالة للطالب', onMount: (el, close) => { el.querySelector('[data-ok]').onclick = () => close(el.querySelector('[name=m]').value); } });
    if (txt === null) return;
    await Portal.setMsg(s.id, txt); toast('حُفظت الرسالة — تظهر للطالب بعد تحديث البوابة', 'ok'); App.render();
  });
  $$('[data-pub]', v).forEach(b => b.onclick = async () => {
    if (!Portal.online()) { toast('سجّل دخولك في «الحساب والمزامنة» أولًا', 'bad'); return App.go('sync'); }
    const ids = b.dataset.pub === 'all' ? classes.map(c => c.id) : [cid];
    const all = $$('[data-pub]', v); all.forEach(x => x.disabled = true);
    const lbl = b.textContent;
    try {
      const r = await Portal.publish(ids, t => b.textContent = t);
      let m = `حُدّثت بطاقات ${r.sent} طالب`;
      if (r.stopped === 'limit') m += ' — توقف مؤقتًا لحد Firebase في إنشاء الحسابات، أكمل بعد ساعة';
      if (r.failed.length) m += ` · تعذّر ${r.failed.length}: ${r.failed.slice(0, 3).join('، ')}`;
      toast(m, r.failed.length || r.stopped ? 'bad' : 'ok');
    } catch (e) {
      toast(e.message || 'تعذّر التحديث', 'bad');
      const rs = { ...(App.S.portalResult || {}) }; ids.forEach(id => rs[id] = { sent: 0, total: App.classStudents(id).length, failed: [], err: e.message || 'تعذّر التحديث', at: new Date().toISOString() }); await App.set('portalResult', rs);
    }
    b.textContent = lbl; all.forEach(x => x.disabled = false); App.render();
  });
  v.querySelector('[data-print]')?.addEventListener('click', () => Native.print(`بطاقات بوابة الطالب — ${App.className(cid)}`));
};
