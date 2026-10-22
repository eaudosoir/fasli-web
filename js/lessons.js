/* فصلي — رسالة ما بعد الحصة لكل فصل + ورقة العمل الإلكترونية
 * بعد انتهاء كل حصة: رسالة جاهزة لقروب الفصل فيها عنوان الدرس والحصة وما أخذناه والواجب ورابط ورقة العمل.
 * محتوى الأسبوع (الدروس والأسئلة) في w/data/weekN.json، ومواعيد كل فصل من جدول المعلم.
 * ورقة العمل: wsi/{iid} في Firestore (يقرؤها الطالب برابطها)، والحلول wss/{iid}_{الطالب} تُكتب مرة واحدة حتى موعد الإغلاق.
 * الحلول تُسحب تلقائيًا، وتُرصد في السجل، وتدخل نصف درجة المشاركة (من ١٠). */
'use strict';

const LessonMsg = {
  weeks: null,
  WS_URL: 'https://eaudosoir.github.io/fasli-web/w/',
  addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); },
  strip: s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  enc: a => btoa(unescape(encodeURIComponent(JSON.stringify(a)))).split('').reverse().join(''),
  kOf: s => String(s.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'x',
  short: n => String(n || '').trim().split(/\s+/).slice(0, 3).join(' '),

  async load(force) {
    if (this.weeks && !force) return this.weeks;
    try {
      const idx = await (await fetch('w/data/index.json', { cache: 'no-cache' })).json();
      const today = ymd(), list = (idx.weeks || []).filter(w => w.to >= this.addDays(today, -10) && w.from <= this.addDays(today, 10));
      this.weeks = (await Promise.all(list.map(w => fetch('w/data/' + w.file, { cache: 'no-cache' }).then(r => r.json()).catch(() => null)))).filter(Boolean);
    } catch (e) { this.weeks = this.weeks || []; }
    return this.weeks;
  },

  /* لقاءات فصل في أسبوع (بترتيب الجدول) مع محتوى كل لقاء وموعد إغلاق ورقته */
  meetings(cid, W) {
    const c = App.cls[cid]; if (!c) return [];
    const G = W.grades?.[c.grade]; if (!G) return [];
    const tt = App.timetable.filter(t => t.classId === cid).sort((a, b) => a.day - b.day || a.period - b.period);
    return tt.map((t, i) => {
      const date = this.addDays(W.from, t.day), nx = tt[i + 1], nd = nx ? this.addDays(W.from, nx.day) : this.addDays(this.addDays(W.from, tt[0].day), 7);
      const pt = Sched.periodTimes(t.period) || {};
      const until = new Date(`${this.addDays(nd, -1)}T23:59:00`);
      return { key: `${W.week}|${cid}|${i}`, W, cid, i, date, period: t.period, end: pt.end, nextDay: nd, until, c: G.meetings?.[i] || null };
    }).filter(m => m.c);
  },
  async all() {
    const W = await this.load();
    return W.flatMap(w => App.classes.map(c => c.id).flatMap(cid => this.meetings(cid, w)));
  },
  ended: m => { const now = new Date(), t = new Date(`${m.date}T${m.end || '23:59'}:00`); return now >= t; },
  sent: m => (App.S.wsMeet || {})[m.key],
  /* رسائل جاهزة لم تُرسل: انتهت حصتها في آخر يومين */
  async pending() {
    const from = this.addDays(ymd(), -2);
    return (await this.all()).filter(m => this.ended(m) && !this.sent(m) && m.date >= from && App.classStudents(m.cid).length);
  },

  body(m, link) {
    const sub = App.S.subject || 'الدراسات الاجتماعية', c = m.c;
    const d = parseYmd(m.date), nd = parseYmd(m.nextDay);
    return `درس اليوم في مادة ${sub}: «${c.lesson}»${c.pages ? ` (${this.strip(c.pages)})` : ''}
الحصة ${ordinal(m.period)} — يوم ${dayName(d)} ${arNum(hijri(d))}

ما أخذناه في الدرس:
${c.learn.map(x => '- ' + this.strip(x)).join('\n')}

الواجب:
${c.hw.map((x, i) => `${arNum(i + 1)}. ${this.strip(x)}`).join('\n')}${link ? `

ورقة عمل قصيرة على الدرس، كرمًا يحلّها ابنكم، وتُغلق ليلة ${dayName(nd)}:
${link}` : ''}`;
  },

  /* إنشاء ورقة العمل في Firestore لهذا الفصل */
  async publish(m) {
    const api = Sync.portalApi, sh = m.c.sheet;
    const iid = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    const code = String(1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000));
    const studs = App.classStudents(m.cid).filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const nd = parseYmd(m.nextDay);
    const data = {
      title: m.c.lesson, cls: App.className(m.cid), code, phone: phoneIntl(App.S.teacherPhone || ''),
      untilText: `ليلة ${dayName(nd)}`, qs: sh.qs.map(q => ({ q: q.q, o: q.o })), key: this.enc(sh.qs.map(q => q.a)),
      names: studs.map(s => [this.kOf(s), this.short(s.name)])
    };
    await api.req('POST', `/wsi?documentId=${iid}`, { fields: { owner: { stringValue: api.uid() }, until: { timestampValue: m.until.toISOString() }, data: { stringValue: JSON.stringify(data) } } });
    const sent = { ...(App.S.wsSent || {}) };
    sent[iid] = { cid: m.cid, key: m.key, title: m.c.lesson, max: sh.qs.length, until: m.until.toISOString(), code, date: m.date };
    await App.set('wsSent', sent);
    return { iid, code, link: `${this.WS_URL}?i=${iid}` };
  },

  async sendFlow(m) {
    const cname = App.className(m.cid), hasSheet = !!m.c.sheet?.qs?.length;
    const canSheet = hasSheet && typeof Sync !== 'undefined' && Sync.on();
    const prev = this.sent(m);
    const r = await sheet(`<div class="who">${ic('wa')} <b>رسالة الدرس — ${esc(cname)}</b><small>${esc(m.c.lesson)} · الحصة ${ordinal(m.period)} · ${shortDate(m.date)}</small></div>
      <label class="fld"><span>نص الرسالة</span><textarea name="body" rows="9">${esc(this.body(m, canSheet ? '‹رابط ورقة العمل›' : ''))}</textarea></label>
      ${hasSheet ? (canSheet ? `<p class="muted small">${ic('sheet')} ورقة عمل من ${arNum(m.c.sheet.qs.length)} أسئلة تُنشأ لطلاب ${esc(cname)} عند الإرسال، وتُغلق ليلة ${dayName(parseYmd(m.nextDay))} الساعة ١١:٥٩ م.</p>` : `<p class="muted small">${ic('info')} ورقة العمل تحتاج تسجيل الدخول في «الحساب والمزامنة».</p>`) : ''}
      ${prev ? `<p class="muted small">${ic('check')} أُرسلت هذه الرسالة من قبل.</p>` : ''}
      <button class="btn wa block" data-ok>${ic('wa')} إرسال لقروب ${esc(cname)}</button>
      <button class="btn ghost block mt" data-skip>لن أرسلها (إخفاء التنبيه)</button>`, {
      title: 'رسالة ما بعد الحصة', wide: true, onMount: (el, close) => {
        el.querySelector('[data-ok]').onclick = () => close({ go: 1, body: el.querySelector('[name=body]').value });
        el.querySelector('[data-skip]').onclick = () => close({ skip: 1 });
      }
    });
    if (!r) return;
    const meet = { ...(App.S.wsMeet || {}) };
    if (r.skip) { meet[m.key] = { skip: 1, at: new Date().toISOString() }; await App.set('wsMeet', meet); App.render(); return; }
    let body = r.body, iid = prev?.iid || null;
    if (canSheet && body.includes('‹رابط ورقة العمل›')) {
      try {
        if (!iid) { toast('جارٍ إنشاء ورقة العمل…'); const p = await this.publish(m); iid = p.iid; }
        body = body.replace('‹رابط ورقة العمل›', `${this.WS_URL}?i=${iid}`);
      } catch (e) { toast('تعذر إنشاء ورقة العمل: ' + esc(e.message), 'bad'); return; }
    }
    Native.open(`https://wa.me/?text=${encodeURIComponent(bcCompose(body, ''))}`);
    meet[m.key] = { iid, at: new Date().toISOString() }; await App.set('wsMeet', meet);
    toast(`اختر قروب ${esc(cname)} في واتساب ثم أرسل`, 'ok');
    App.render();
  },

  /* ===== الحلول ===== */
  subs: {},         // iid ← [حلول]
  async fetchSubs(iids) {
    const api = Sync.portalApi, out = {};
    for (let i = 0; i < iids.length; i += 30) {
      const part = iids.slice(i, i + 30);
      const r = await api.req('POST', ':runQuery', { structuredQuery: { from: [{ collectionId: 'wss' }], where: { fieldFilter: { field: { fieldPath: 'iid' }, op: 'IN', value: { arrayValue: { values: part.map(x => ({ stringValue: x })) } } } }, limit: 1000 } });
      (Array.isArray(r) ? r : []).filter(x => x.document).forEach(x => {
        const f = x.document.fields;
        (out[f.iid.stringValue] ||= []).push({ id: x.document.name.split('/').pop(), k: f.k.stringValue, name: f.name.stringValue, score: +f.score.integerValue, max: +f.max.integerValue, at: x.document.createTime });
      });
    }
    return out;
  },
  stuOf(cid, k) { return App.classStudents(cid).find(s => this.kOf(s) === k) || null; },
  /* سحب الحلول للأوراق المفتوحة (وحتى يوم بعد الإغلاق) ورصدها في السجل */
  async poll(force) {
    if (typeof Sync === 'undefined' || !Sync.on()) return;
    const S = App.S.wsSent || {}, now = Date.now();
    const iids = Object.keys(S).filter(i => force || new Date(S[i].until).getTime() > now - 86400000);
    if (!iids.length) return;
    let got; try { got = await this.fetchSubs(iids); } catch (e) { return; }
    const fresh = [];
    for (const iid of iids) {
      const x = S[iid], list = got[iid] || [];
      this.subs[iid] = list;
      for (const s of list) {
        const st = this.stuOf(x.cid, s.k); if (!st) continue;
        const id = `ws|${iid}|${st.id}`;
        if (await DB.get('grades', id)) continue;
        await DB.put('grades', { id, studentId: st.id, classId: x.cid, kind: 'ws', title: `ورقة عمل: ${x.title}`, max: s.max, score: s.score, date: x.date, assessId: iid, source: 'ورقة عمل', at: s.at || new Date().toISOString() });
        fresh.push({ st, s, x });
      }
    }
    if (fresh.length) {
      toast(fresh.length === 1 ? `${ic('check')} وصل حل ورقة العمل: ${esc(fresh[0].st.name.split(' ').slice(0, 2).join(' '))} (${esc(App.className(fresh[0].x.cid))}) ${arNum(fresh[0].s.score)} من ${arNum(fresh[0].s.max)}` : `${ic('check')} وصلت ${arNum(fresh.length)} حلول جديدة لأوراق العمل ورُصدت في السجل`, 'ok');
      if (['home', 'lessons', 'gradebook'].includes(App.stack?.[App.stack.length - 1]?.screen)) App.render();
    }
  },

  async close(iid) {
    const api = Sync.portalApi, x = App.S.wsSent[iid], now = new Date();
    await api.req('PATCH', `/wsi/${iid}?updateMask.fieldPaths=until`, { fields: { until: { timestampValue: now.toISOString() } } });
    await App.set('wsSent', { ...App.S.wsSent, [iid]: { ...x, until: now.toISOString() } });
  },

  thanksText: (s, x) => `السلام عليكم ورحمة الله وبركاته\nشكرًا لكم، وصلنا حل ابنكم ${s.name.split(' ')[0]} لورقة عمل درس «${x.title}»، بارك الله فيه وفي متابعتكم.\n${App.S.teacherName ? `معلم ${App.S.subject || 'المادة'}/ ${App.S.teacherName}` : ''}`.trim(),

  async results(iid) {
    await this.poll(true);
    const x = App.S.wsSent[iid], list = (this.subs[iid] || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const studs = App.classStudents(x.cid), done = new Set(list.map(s => s.k));
    const missing = studs.filter(s => !done.has(this.kOf(s)));
    const thanked = () => App.S.wsThanked || {};
    const open = new Date(x.until) > new Date();
    await sheet(`<div class="who">${ic('sheet')} <b>${esc(x.title)} — ${esc(App.className(x.cid))}</b><small>${arNum(list.length)} من ${arNum(studs.length)} حلّوا · رمز البحث في واتساب: <b dir="ltr">${esc(x.code)}</b> · ${open ? `مفتوحة حتى ${shortDate(x.until.slice(0, 10))} ١١:٥٩ م` : 'مغلقة'}</small></div>
      ${list.length ? `<div class="row gap"><button class="btn sm wa grow" data-all>${ic('wa')} شكر من لم يُشكر بعد</button></div>` : '<p class="muted center">لم يصل أي حل بعد.</p>'}
      <div class="bc-list">${list.map((s, i) => { const st = this.stuOf(x.cid, s.k), t = thanked()[s.id]; return `<div class="bc-row ${t ? 'done' : ''}" data-i="${i}"><span class="bc-n">${arNum(i + 1)}</span><b class="grow">${esc(st?.name || s.name)}<small class="muted"> · ${arNum(s.score)} من ${arNum(s.max)}</small></b>${st && phoneIntl(st.guardianPhone).length >= 11 ? `<button class="btn sm ${t ? 'ghost' : 'wa'}" data-th="${i}">${t ? `${ic('check')} شُكر` : `${ic('wa')} شكر`}</button>` : '<small class="muted">لا رقم</small>'}</div>`; }).join('')}</div>
      ${missing.length ? `<p class="lbl mt">لم يحلّوا (${arNum(missing.length)})</p><p class="muted small">${missing.map(s => esc(s.name.split(' ').slice(0, 2).join(' '))).join('، ')}</p>` : ''}
      ${open ? `<button class="btn ghost block mt" data-close>${ic('lock')} إغلاق الرابط الآن</button>` : ''}`, {
      title: 'حلول ورقة العمل', wide: true, onMount: (el, close) => {
        const mark = async (s, b) => {
          await App.set('wsThanked', { ...thanked(), [s.id]: new Date().toISOString() });
          const row = b.closest('.bc-row'); row.classList.add('done'); b.className = 'btn sm ghost'; b.innerHTML = `${ic('check')} شُكر`;
        };
        const thank = async (i) => {
          const s = list[i], st = this.stuOf(x.cid, s.k), b = el.querySelector(`[data-th="${i}"]`);
          if (!st || !b) return;
          if (thanked()[s.id] && !(await confirmBox('سبق شكر ولي أمر هذا الطالب. إرسال مرة أخرى؟'))) return;
          Native.open(`https://wa.me/${phoneIntl(st.guardianPhone)}?text=${encodeURIComponent(this.thanksText(st, x))}`);
          await mark(s, b);
        };
        $$('[data-th]', el).forEach(b => b.onclick = () => thank(+b.dataset.th));
        el.querySelector('[data-all]')?.addEventListener('click', () => {
          const i = list.findIndex((s, i) => !thanked()[s.id] && el.querySelector(`[data-th="${i}"]`));
          if (i < 0) return toast('شُكر الجميع', 'ok');
          thank(i); toast('بعد الإرسال ارجع لفصلي واضغط الزر مرة أخرى للتالي', 'ok');
        });
        el.querySelector('[data-close]')?.addEventListener('click', async () => {
          try { await this.close(iid); toast('أُغلق الرابط', 'ok'); close(); } catch (e) { toast(esc(e.message), 'bad'); }
        });
      }
    });
  },

  /* بطاقة في الرئيسية */
  async card() {
    const P = await this.pending();
    const S = App.S.wsSent || {}, now = Date.now();
    const open = Object.entries(S).filter(([, x]) => new Date(x.until).getTime() > now);
    if (!P.length && !open.length) return '';
    return `<section class="card ls-card"><div class="card-h"><h3>${ic('send')} رسائل الدروس وأوراق العمل</h3><button class="btn sm ghost" data-go="lessons">الكل ${ic('chev')}</button></div>
      ${P.map(m => `<button class="bc-bar" data-ls="${esc(m.key)}">${ic('wa')}<span class="grow"><b>رسالة ما بعد حصة ${esc(App.className(m.cid))} جاهزة</b><small>${esc(m.c.lesson)} · الحصة ${ordinal(m.period)} · ${shortDate(m.date)}</small></span>${ic('chev')}</button>`).join('')}
      ${open.map(([iid, x]) => `<button class="ls-row" data-wsr="${iid}"><b>${esc(App.className(x.cid))} · ${esc(x.title)}</b><small>${arNum((this.subs[iid] || []).length)} حلول · تُغلق ليلة ${dayName(parseYmd(LessonMsg.addDays(x.until.slice(0, 10), 1)))}</small></button>`).join('')}</section>`;
  },
  bind(v, items) {
    $$('[data-ls]', v).forEach(b => b.onclick = () => { const m = items.find(x => x.key === b.dataset.ls); if (m) this.sendFlow(m); });
    $$('[data-wsr]', v).forEach(b => b.onclick = () => this.results(b.dataset.wsr));
  }
};

/* الرئيسية: البطاقة أعلى الاختصارات */
{
  const _home = Screens.home;
  Screens.home = async v => {
    await _home(v);
    try {
      const html = await LessonMsg.card(); if (!html) return;
      const at = v.querySelector('.page.home'); if (!at) return;
      at.insertAdjacentHTML('afterbegin', html);
      LessonMsg.bind(at, await LessonMsg.all());
    } catch (e) { console.warn(e); }
  };
}

/* شاشة الحصة: زر رسالة الدرس لهذا الفصل */
{
  const _ses = Screens.session;
  Screens.session = async (v, p) => {
    await _ses(v, p);
    if (!p.classId || !App.cls[p.classId] || p.cover) return;
    try {
      const today = ymd(), M = (await LessonMsg.all()).filter(m => m.cid === p.classId && m.date === today);
      const m = M.find(x => x.period === p.period) || M[0]; if (!m) return;
      const bar = v.querySelector('[data-bc]') || v.querySelector('.ses-head'); if (!bar) return;
      bar.insertAdjacentHTML('afterend', `<button class="bc-bar sm" data-lsm>${ic('send')}<span class="grow"><b>${LessonMsg.sent(m) ? 'أُرسلت رسالة الدرس' : 'رسالة الدرس وورقة العمل لأولياء الأمور'}</b><small>${esc(m.c.lesson)}</small></span>${ic('chev')}</button>`);
      v.querySelector('[data-lsm]').onclick = () => LessonMsg.sendFlow(m);
    } catch (e) { console.warn(e); }
  };
}

/* شاشة كل رسائل الأسبوع */
Screens.lessons = async v => {
  const items = await LessonMsg.all();
  await LessonMsg.poll();
  const by = {}; items.forEach(m => (by[m.date] ||= []).push(m));
  const days = Object.keys(by).sort();
  const row = m => {
    const s = LessonMsg.sent(m), ended = LessonMsg.ended(m), iid = s?.iid;
    const st = s ? (s.skip ? 'لم تُرسل' : 'أُرسلت') : ended ? 'جاهزة للإرسال' : `بعد الحصة ${ordinal(m.period)}`;
    return `<div class="ls-item"><button class="ls-row grow" data-ls="${esc(m.key)}"><b>${esc(App.className(m.cid))} · ${esc(m.c.lesson)}</b><small>الحصة ${ordinal(m.period)} · ${st}${m.c.sheet ? ' · فيها ورقة عمل' : ''}</small></button>
      ${iid && App.S.wsSent?.[iid] ? `<button class="btn sm soft" data-wsr="${iid}">${ic('sheet')} الحلول ${arNum((LessonMsg.subs[iid] || []).length)}</button>` : ''}</div>`;
  };
  v.innerHTML = topbar('رسائل الدروس وأوراق العمل') + `<div class="page">
    ${days.length ? days.map(d => `<section class="card"><div class="card-h"><h3>${ic('cal')} ${shortDate(d)}</h3></div>${by[d].sort((a, b) => a.period - b.period).map(row).join('')}</section>`).join('')
      : `<div class="empty">${ic('send')}<h3>لا توجد دروس لهذا الأسبوع بعد</h3><p>تُجهَّز دروس الأسبوع وأوراق العمل كل جمعة</p></div>`}
    ${typeof Sync !== 'undefined' && !Sync.on() ? `<p class="muted small center">${ic('info')} سجّل الدخول في «الحساب والمزامنة» لتعمل أوراق العمل.</p>` : ''}</div>`;
  bindBack(v);
  LessonMsg.bind(v, items);
};
NAV_ROOT.lessons = 'home';

/* سحب الحلول كل دقيقة والتطبيق مفتوح */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => LessonMsg.poll().catch(() => { }), 4000);
  setInterval(() => { if (document.visibilityState === 'visible') LessonMsg.poll().catch(() => { }); }, 60000);
});
