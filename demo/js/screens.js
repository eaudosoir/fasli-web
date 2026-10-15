/* فصلي — الطلاب، ملف الطالب، المتابعة */
'use strict';

/* ===== حسابات المتابعة ===== */
const Follow = {
  async load() {
    const [att, hw, notes, contacts, pts] = await Promise.all(['attendance', 'homework', 'notes', 'contacts', 'points'].map(s => DB.all(s)));
    return { att, hw, notes, contacts, pts };
  },
  async needsContact(D) {
    D = D || await this.load();
    const since30 = ymd(addDays(new Date(), -30)), since14 = ymd(addDays(new Date(), -14));
    const lastContact = {};
    D.contacts.forEach(c => { if (!lastContact[c.studentId] || c.date > lastContact[c.studentId]) lastContact[c.studentId] = c.date; });
    const map = {};
    const add = (sid, reason, kind, ref) => { if (!App.stu[sid] || App.stu[sid].active === false) return; (map[sid] ||= { sid, reasons: [] }).reasons.push({ reason, kind, ref }); };
    D.notes.filter(n => !n.resolved && !n.contacted && (n.needsContact || n.importance === 'high')).forEach(n => add(n.studentId, `ملاحظة ${n.importance === 'high' ? 'عالية الأهمية' : 'تحتاج تواصلًا'}: ${n.text}`, 'note', n.id));
    const hwOpen = {}; D.hw.filter(h => !h.resolved).forEach(h => (hwOpen[h.studentId] ||= []).push(h));
    Object.entries(hwOpen).forEach(([sid, arr]) => { const last = arr.map(h => h.date).sort().pop(); if (arr.length >= 3 && !(lastContact[sid] >= last)) add(sid, `تقصير متكرر في الواجبات (${arr.length} مرات لم تعالج)`, 'hw'); });
    const abs = {}, escp = {};
    D.att.filter(a => a.date >= since30).forEach(a => { if (a.status === 'absent') abs[a.studentId] = (abs[a.studentId] || 0) + 1; if (a.status === 'escaped') (escp[a.studentId] ||= []).push(a.date); });
    Object.entries(abs).forEach(([sid, n]) => { if (n >= 3 && !(lastContact[sid] >= since14)) add(sid, `غياب متكرر (${n} حصص خلال 30 يومًا)`, 'abs'); });
    Object.entries(escp).forEach(([sid, ds]) => { const last = [...ds].sort().pop(); if (!(lastContact[sid] >= last)) add(sid, `هروب من الحصة (${ds.length})`, 'esc'); });
    return Object.values(map);
  },
  studentStats(sid, D) {
    const a = D.att.filter(x => x.studentId === sid);
    const c = Object.fromEntries(ATT_ORDER.map(k => [k, a.filter(x => x.status === k).length]));
    const total = a.length;
    const rate = total ? Math.round(((c.present + c.late) / total) * 100) : null;
    const points = D.pts.filter(x => x.studentId === sid).reduce((s, x) => s + (x.value || 1), 0);
    const part = D.pts.filter(x => x.studentId === sid && x.type === 'participation').length;
    const hw = D.hw.filter(x => x.studentId === sid);
    const notes = D.notes.filter(x => x.studentId === sid);
    return { ...c, total, rate, points, part, hw: hw.length, hwOpen: hw.filter(h => !h.resolved).length, notes: notes.length };
  }
};

/* ===== الطلاب ===== */
Screens.students = async (v, p) => {
  const cid = p.classId ?? (App._lastClass || 'all');
  const q = p.q || '';
  const D = await Follow.load();
  let list = cid === 'all' ? App.students : App.classStudents(cid);
  v.innerHTML = topbar('الطلاب', { back: false, actions: `<button class="icon-btn" data-add aria-label="إضافة">${ic('plus')}</button><button class="icon-btn" data-menu aria-label="خيارات">${ic('more')}</button>` }) + `
  <div class="page">
    <div class="search">${ic('search')}<input placeholder="ابحث باسم الطالب أو اسأل: المقصرين في 5ب" value="${esc(q)}" data-q></div>
    <div class="class-chips">${[{ id: 'all', name: 'الكل' }, ...App.classes].map(c => `<button class="chip ${c.id === cid ? 'on' : ''}" data-c="${c.id}">${esc(c.name)} <small>${c.id === 'all' ? App.students.length : App.classStudents(c.id).length}</small></button>`).join('')}</div>
    <div class="list-meta"><span>${list.length} طالب</span><span class="muted small">${ic('lock')} أرقام أولياء الأمور مخفية هنا</span></div>
    ${list.length ? `<div class="stu-list">${list.map(s => {
    const st = Follow.studentStats(s.id, D);
    return `<button class="stu-item" data-id="${s.id}"><span class="av">${esc(initials(s.name))}</span>
        <span class="stu-tx"><b>${esc(s.name)}</b><small>${esc(App.className(s.classId))}${st.rate !== null ? ` · حضور ${st.rate}%` : ''}</small></span>
        <span class="stu-badges">${st.points ? `<i class="bg-star">★ ${st.points}</i>` : ''}${st.absent ? `<i class="bg-abs">غ ${st.absent}</i>` : ''}${st.hwOpen ? `<i class="bg-hw">📚 ${st.hwOpen}</i>` : ''}${st.escaped ? `<i class="bg-esc">هـ ${st.escaped}</i>` : ''}</span></button>`;
  }).join('')}</div>` : `<div class="empty">${ic('users')}<h3>لا يوجد طلاب</h3><p>${cid === 'all' || !App.classStudents(cid).length ? 'استورد قائمة الطلاب من ملف نور (Excel) أو أضفهم يدويًا' : 'لا نتائج للبحث'}</p><button class="btn primary" data-import>${ic('upload')} استيراد من نور</button></div>`}
  </div>`;
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-c]', v).forEach(b => b.onclick = () => { App._lastClass = b.dataset.c; setP({ classId: b.dataset.c }); });
  /* البحث: لا يبحث مع كل حرف — ينتظر حتى تكمل الكلمة (توقف قصير أو زر البحث)، ويفلتر القائمة دون إغلاق لوحة المفاتيح */
  const qi = v.querySelector('[data-q]'); let tm, composing = false;
  const applyQ = () => {
    clearTimeout(tm);
    const val = qi.value.trim(); p.q = val;
    App.stack[App.stack.length - 1].params = { ...p, q: val };
    const nq = normName(val); let n = 0;
    $$('.stu-item', v).forEach(b => { const ok = !nq || normName(App.stu[b.dataset.id]?.name).includes(nq); b.hidden = !ok; if (ok) n++; });
    const meta = v.querySelector('.list-meta span'); if (meta) meta.textContent = `${n} طالب`;
    let sug = v.querySelector('.ask-sug');
    const P = val ? parseAsk(val) : null;
    if (P?.m) { if (!sug) { sug = document.createElement('button'); sug.className = 'alert-card ask-sug'; v.querySelector('.search').after(sug); } sug.innerHTML = `${ic('sparkle')}<div><b>اسأل فصلي: «${esc(val)}»</b><small>${esc(P.m.label)} · ${esc(P.scope)} · ${esc(P.when)}</small></div>${ic('chev')}`; sug.onclick = () => App.go('ask', { q: val }); } else sug?.remove();
    let none = v.querySelector('.no-res'); if (!n && nq) { if (!none) { none = document.createElement('div'); none.className = 'empty sm no-res'; v.querySelector('.page').appendChild(none); } none.textContent = `لا يوجد طالب باسم «${val}»`; } else none?.remove();
  };
  if (q) applyQ();
  qi.addEventListener('compositionstart', () => composing = true);
  qi.addEventListener('compositionend', () => { composing = false; clearTimeout(tm); tm = setTimeout(applyQ, 900); });
  qi.oninput = () => { if (composing) return; clearTimeout(tm); tm = setTimeout(applyQ, qi.value.trim() ? 900 : 200); };
  qi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); applyQ(); qi.blur(); } };
  qi.setAttribute('enterkeyhint', 'search');
  $$('[data-id]', v).forEach(b => b.onclick = () => App.go('student', { id: b.dataset.id }));
  v.querySelector('[data-add]').onclick = async () => { if (await studentForm(null, cid !== 'all' ? cid : App.classes[0].id)) App.render(); };
  v.querySelector('[data-import]')?.addEventListener('click', () => importStudents());
  v.querySelector('[data-menu]').onclick = async () => {
    const r = await choose('خيارات الطلاب', [
      { value: 'import', label: 'استيراد من ملف نور', sub: 'Excel (xlsx) أو CSV — يتعرف على الصف والفصل والجوال', icon: ic('upload') },
      { value: 'export', label: 'تصدير القائمة إلى Excel', icon: ic('download') },
      { value: 'paste', label: 'لصق أسماء فصل', sub: 'اسم في كل سطر', icon: ic('list') }]);
    if (r === 'import') importStudents();
    if (r === 'export') {
      const rows = list.map((s, i) => [i + 1, s.name, App.className(s.classId), s.nationalId || '', s.guardianPhone || '']);
      Native.saveFile(`طلاب-${cid === 'all' ? 'الكل' : App.className(cid)}.xlsx`, await buildXlsx('الطلاب', ['م', 'اسم الطالب', 'الفصل', 'رقم الهوية', 'جوال ولي الأمر'], rows, `قائمة الطلاب — ${App.S.school}`), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    if (r === 'paste') pasteNames(cid !== 'all' ? cid : null);
  };
};

async function studentForm(s, classId) {
  const n = s || { classId };
  return sheet(`<label class="fld"><span>اسم الطالب</span><input name="name" value="${esc(n.name || '')}" placeholder="الاسم رباعيًا"></label>
    <label class="fld"><span>الفصل</span><select name="classId">${App.classes.map(c => `<option value="${c.id}" ${c.id === n.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>اسم ولي الأمر (اختياري)</span><input name="guardianName" value="${esc(n.guardianName || '')}"></label>
    <label class="fld"><span>جوال ولي الأمر</span><input name="guardianPhone" inputmode="tel" dir="ltr" value="${esc(n.guardianPhone || '')}" placeholder="05xxxxxxxx"></label>
    <label class="fld"><span>رقم الهوية (اختياري)</span><input name="nationalId" inputmode="numeric" dir="ltr" value="${esc(n.nationalId || '')}"></label>
    <div class="row gap"><button class="btn primary grow" data-ok>حفظ</button>${s ? `<button class="btn danger-ghost" data-del>${ic('trash')} حذف</button>` : ''}</div>`, {
    title: s ? 'تعديل بيانات الطالب' : 'إضافة طالب', onMount: (el, close) => {
      el.querySelector('[data-ok]').onclick = async () => {
        const name = el.querySelector('[name=name]').value.trim();
        if (!name) return toast('اكتب اسم الطالب', 'bad');
        const o = { ...n, id: n.id || uid(), name, classId: el.querySelector('[name=classId]').value, guardianName: el.querySelector('[name=guardianName]').value.trim(), guardianPhone: el.querySelector('[name=guardianPhone]').value.trim(), nationalId: el.querySelector('[name=nationalId]').value.trim(), active: true, createdAt: n.createdAt || new Date().toISOString() };
        await DB.put('students', o); await App.loadStudents(); toast('حُفظ الطالب', 'ok'); close(true);
      };
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!await confirmBox(`حذف <b>${esc(n.name)}</b> من القوائم؟<br><small>سجلاته السابقة تبقى محفوظة في التقارير.</small>`, { ok: 'حذف', danger: true })) return;
        await DB.put('students', { ...n, active: false, removedAt: new Date().toISOString() }); await App.loadStudents(); toast('حُذف الطالب من القوائم'); close('deleted');
      });
    }
  });
}

async function pasteNames(cid) {
  const r = await sheet(`<label class="fld"><span>الفصل</span><select name="c">${App.classes.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>الأسماء (اسم في كل سطر)</span><textarea name="t" rows="10"></textarea></label><button class="btn primary block" data-ok>إضافة</button>`,
    { title: 'لصق أسماء', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close({ c: el.querySelector('[name=c]').value, t: el.querySelector('[name=t]').value }) });
  if (!r) return;
  const existing = new Set(App.classStudents(r.c).map(s => normName(s.name)));
  const names = r.t.split(/\n/).map(x => x.replace(/^\s*\d+[\.\-\)]?\s*/, '').trim()).filter(x => x && !existing.has(normName(x)));
  await DB.putMany('students', names.map((n, i) => ({ id: uid() + i, name: n, classId: r.c, guardianPhone: '', nationalId: '', active: true, createdAt: new Date().toISOString() })));
  await App.loadStudents(); toast(`أضيف ${names.length} طالب`, 'ok'); App.render();
}

/* استيراد ملف نور: رقم الصف 0430/0530/0630 والفصل 1/2/3 */
async function importStudents(src) {
  let rows;
  if (Array.isArray(src)) rows = src;
  else {
    const f = src instanceof Blob ? src : await pickFile('.xlsx,.xls,.csv,.txt');
    if (!f) return;
    try { rows = await readSheetFile(f); } catch (e) { return toast(esc(e.message), 'bad'); }
  }
  const hi = rows.findIndex(r => r.some(c => /اسم/.test(c)));
  if (hi < 0) return toast('لم أجد عمود "اسم الطالب" في الملف', 'bad');
  const H = rows[hi].map(x => String(x).trim());
  const col = re => H.findIndex(h => re.test(h));
  const cName = col(/اسم الطالب|^الاسم|اسم/), cGrade = col(/رقم الصف|^الصف|الصف/), cSec = col(/^الفصل|رقم الفصل|الفصل/), cPhone = col(/جوال|الجوال|هاتف|رقم الجوال/), cId = col(/هوية|السجل المدني|رقم الهوية|الإقامة/);
  const parsed = [];
  for (const r of rows.slice(hi + 1)) {
    const name = String(r[cName] || '').trim(); if (!name) continue;
    let grade = null, section = null;
    const gv = String(r[cGrade] ?? '').trim();
    const m = gv.match(/0?([1-6])30/); if (m) grade = +m[1];
    else if (/رابع/.test(gv)) grade = 4; else if (/خامس/.test(gv)) grade = 5; else if (/سادس/.test(gv)) grade = 6; else if (/^[456]$/.test(gv)) grade = +gv;
    const sv = String(r[cSec] ?? '').trim();
    if (/^[123]$/.test(sv)) section = +sv; else if (/أ|ا$/.test(sv)) section = 1; else if (/ب/.test(sv)) section = 2; else if (/ج/.test(sv)) section = 3;
    parsed.push({ name, grade, section, phone: cPhone >= 0 ? String(r[cPhone] || '').trim() : '', nid: cId >= 0 ? String(r[cId] || '').trim() : '' });
  }
  const mine = parsed.filter(x => [4, 5, 6].includes(x.grade) && x.section);
  const unknown = parsed.filter(x => !x.grade || !x.section);
  const by = {}; mine.forEach(x => { const id = `g${x.grade}s${x.section}`; (by[id] ||= []).push(x); });
  const r = await sheet(`<p>قرأت <b>${parsed.length}</b> طالبًا من الملف. طلاب صفوفك (الرابع–السادس):</p>
    <div class="imp-list">${App.classes.map(c => `<label class="imp-row"><input type="checkbox" value="${c.id}" ${by[c.id]?.length ? 'checked' : 'disabled'}><b>${esc(c.name)}</b><span>${by[c.id]?.length || 0} طالب</span></label>`).join('')}</div>
    ${unknown.length ? `<p class="muted small">${unknown.length} سجل بلا صف/فصل واضح — يمكنك إضافتهم إلى فصل محدد:</p><select name="uc"><option value="">تجاهلهم</option>${App.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>` : ''}
    <label class="switch"><input type="checkbox" name="upd" checked><span></span> تحديث الجوال ورقم الهوية للطلاب الموجودين</label>
    <button class="btn primary block" data-ok>${ic('upload')} استيراد</button>`, {
    title: 'استيراد من نور', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close({
      cls: $$('.imp-row input:checked', el).map(i => i.value), uc: el.querySelector('[name=uc]')?.value, upd: el.querySelector('[name=upd]').checked
    })
  });
  if (!r) return;
  if (r.uc) by[r.uc] = [...(by[r.uc] || []), ...unknown];
  if (r.uc && !r.cls.includes(r.uc)) r.cls.push(r.uc);
  let added = 0, updated = 0;
  const all = await DB.all('students');
  for (const cid of r.cls) for (const x of by[cid] || []) {
    const ex = all.find(s => s.active !== false && normName(s.name) === normName(x.name));
    if (ex) {
      if (r.upd) { await DB.put('students', { ...ex, classId: cid, guardianPhone: x.phone || ex.guardianPhone, nationalId: x.nid || ex.nationalId }); updated++; }
    } else { await DB.put('students', { id: uid(), name: x.name, classId: cid, guardianPhone: x.phone, nationalId: x.nid, guardianName: '', active: true, createdAt: new Date().toISOString() }); added++; }
  }
  await App.loadStudents();
  toast(`تم: إضافة ${added} وتحديث ${updated}`, 'ok'); App.render();
}

/* ===== ملف الطالب ===== */
Screens.student = async (v, p) => {
  const s = App.stu[p.id];
  if (!s) return App.back();
  const tab = p.tab || 'story';
  const D = await Follow.load();
  const st = Follow.studentStats(s.id, D);
  const mine = k => D[k].filter(x => x.studentId === s.id);
  const att = mine('att'), hw = mine('hw'), notes = mine('notes'), contacts = mine('contacts'), pts = mine('pts');
  const grades = await DB.byIndex('grades', 'studentId', s.id);
  const nc = (await Follow.needsContact(D)).find(x => x.sid === s.id);

  const tabs = [['story', 'القصة الدراسية'], ['att', 'الحضور'], ['hw', 'الواجبات'], ['part', 'المشاركة'], ['notes', 'الملاحظات'], ['contact', 'التواصل'], ['grades', 'الاختبارات']];
  let body = '';
  const empty = t => `<div class="empty sm">${t}</div>`;
  if (tab === 'story') {
    const ev = [
      ...att.filter(a => a.status !== 'present').map(a => ({ d: a.date, at: a.at, ic: 'clock', c: a.status, t: `${ATT[a.status].label} — الحصة ${ordinal(a.period)}`, s: a.history?.length ? `عُدّل ${a.history.length} مرة` : '' })),
      ...hw.map(h => ({ d: h.date, at: h.at, ic: 'book', c: 'hw', t: h.kind, s: (h.note || '') + (h.resolved ? ' · ✓ عولجت' : ''), id: h.id, k: 'hw' })),
      ...pts.map(x => ({ d: x.date, at: x.at, ic: 'star', c: 'pt', t: x.type === 'participation' ? 'مشاركة في الدرس' : `سلوك إيجابي: ${x.reason}`, s: `+${x.value || 1}` })),
      ...notes.map(n => ({ d: n.date, at: n.at, ic: 'note', c: 'nt-' + n.importance, t: `ملاحظة ${n.kind}: ${n.text}`, s: [n.action, n.resolved ? '✓ عولجت' : ''].filter(Boolean).join(' · '), id: n.id, k: 'note' })),
      ...contacts.map(c => ({ d: c.date, at: c.at, ic: 'phone', c: 'ct', t: `تواصل مع ${c.with} (${c.channel})`, s: `${c.reason}${c.result ? ' — ' + c.result : ''}` })),
      ...grades.map(g => ({ d: g.date, at: g.at, ic: 'school', c: 'gr', t: `${g.title}`, s: `${g.score ?? ''}${g.max ? ' / ' + g.max : ''}` }))
    ].sort((a, b) => (b.d + (b.at || '')).localeCompare(a.d + (a.at || '')));
    const groups = {}; ev.forEach(e => (groups[e.d] ||= []).push(e));
    body = ev.length ? `<div class="story">${Object.entries(groups).map(([d, arr]) => `<div class="st-day"><div class="st-date"><b>${shortDate(d)}</b><small>${hijri(parseYmd(d))}</small></div>
      ${arr.map(e => `<div class="st-ev ev-${e.c}" ${e.id ? `data-ev="${e.k}|${e.id}"` : ''}><span class="st-ic">${ic(e.ic)}</span><div><b>${esc(e.t)}</b>${e.s ? `<small>${esc(e.s)}</small>` : ''}</div></div>`).join('')}</div>`).join('')}</div>` : empty('لا توجد أحداث بعد — كل ما تسجله للطالب يظهر هنا بتسلسل زمني');
  } else if (tab === 'att') {
    const rows = att.sort((a, b) => b.date.localeCompare(a.date) || b.period - a.period);
    body = `<div class="mini-stats">${ATT_ORDER.map(k => `<div style="--c:${ATT[k].color}"><b>${st[k]}</b><small>${ATT[k].label}</small></div>`).join('')}</div>` +
      (rows.length ? `<div class="rec-list">${rows.map(a => `<div class="rec"><span class="dot" style="background:${ATT[a.status].color}"></span><div><b>${ATT[a.status].label}</b><small>${shortDate(a.date)} · الحصة ${ordinal(a.period)}${a.history?.length ? ` · سجل التعديل: ${a.history.map(h => `${ATT[h.from]?.label}←${ATT[h.to]?.label}`).join('، ')}` : ''}</small></div></div>`).join('')}</div>` : empty('لا سجلات حضور بعد'));
  } else if (tab === 'hw') {
    body = `<button class="btn soft block mb" data-new="hw">${ic('plus')} تسجيل تقصير</button>` + (hw.length ? `<div class="rec-list">${hw.sort((a, b) => b.date.localeCompare(a.date)).map((h, i, arr) => `<div class="rec ${h.resolved ? 'resolved' : ''}"><span class="rec-n">${arr.length - i}</span><div class="grow"><b>${esc(h.kind)}</b><small>${shortDate(h.date)}${h.note ? ' · ' + esc(h.note) : ''}${h.resolved ? ` · ✓ ${esc(h.resolution || 'عولجت')}` : ''}</small></div>${casePill(h)}${h.resolved ? '' : `<button class="btn xs soft" data-res-hw="${h.id}">معالجة</button>`}<button class="icon-btn sm" data-del-rec="homework|${h.id}" aria-label="حذف">${ic('trash')}</button></div>`).join('')}</div>` : empty('لا يوجد تقصير مسجل 👏'));
  } else if (tab === 'part') {
    body = `<div class="mini-stats"><div style="--c:var(--gold)"><b>${st.points}</b><small>مجموع النقاط</small></div><div style="--c:var(--pri)"><b>${st.part}</b><small>مشاركات</small></div><div style="--c:var(--info)"><b>${pts.filter(x => x.type === 'positive').length}</b><small>سلوك إيجابي</small></div></div>
      <button class="btn soft block mb" data-new="pos">${ic('sparkle')} نقطة إيجابية</button>` +
      (pts.length ? `<div class="rec-list">${pts.sort((a, b) => (b.at || '').localeCompare(a.at || '')).map(x => `<div class="rec"><span class="rec-star">★</span><div class="grow"><b>${esc(x.type === 'participation' ? 'مشاركة' : x.reason)}</b><small>${shortDate(x.date)} · +${x.value || 1}</small></div><button class="icon-btn sm" data-del-pt="${x.id}">${ic('trash')}</button></div>`).join('')}</div>` : empty('سجل إنجاز الطالب يبدأ من أول مشاركة'));
  } else if (tab === 'notes') {
    body = `<button class="btn soft block mb" data-new="note">${ic('plus')} ملاحظة جديدة</button>` + (notes.length ? `<div class="rec-list">${notes.sort((a, b) => b.date.localeCompare(a.date)).map(n => `<div class="rec note imp-${n.importance} ${n.resolved ? 'resolved' : ''}" data-ev="note|${n.id}"><span class="imp-bar"></span><div class="grow"><b class="sens">${esc(n.text)}</b><small>${esc(n.kind)} · ${{ low: 'منخفضة', mid: 'متوسطة', high: 'عالية' }[n.importance]} · ${shortDate(n.date)}${n.referTo ? ' · إحالة: ' + esc(n.referTo) : ''}${n.action ? ' · ' + esc(n.action) : ''}${n.contacted ? ' · تم التواصل' : ''}</small></div>${casePill(n)}</div>`).join('')}</div>` : empty('لا ملاحظات'));
  } else if (tab === 'contact') {
    body = `<div class="row gap mb"><button class="btn soft grow" data-new="contact">${ic('plus')} تسجيل تواصل</button><button class="btn wa grow" data-new="msg">${ic('wa')} رسالة</button></div>` + (contacts.length ? `<div class="rec-list">${contacts.sort((a, b) => b.date.localeCompare(a.date)).map(c => `<div class="rec"><span class="rec-ic">${ic(c.channel === 'واتساب' ? 'wa' : 'phone')}</span><div><b>${esc(c.with)} — ${esc(c.reason)}</b><small>${shortDate(c.date)} · ${esc(c.channel)}${c.result ? ' · ' + esc(c.result) : ''}</small></div><button class="icon-btn sm" data-del-rec="contacts|${c.id}" aria-label="حذف">${ic('trash')}</button></div>`).join('')}</div>` : empty('لم يُسجل أي تواصل بعد'));
  } else if (tab === 'grades') {
    body = grades.length ? `<div class="rec-list">${grades.sort((a, b) => b.date.localeCompare(a.date)).map(g => `<div class="rec"><span class="rec-ic">${ic('school')}</span><div class="grow"><b>${esc(g.title)}</b><small>${shortDate(g.date)} · ${esc(g.source || 'مدرستي')}</small></div><b class="grade">${esc(g.score)}${g.max ? '/' + esc(g.max) : ''}</b><button class="icon-btn sm" data-del-rec="grades|${g.id}" aria-label="حذف">${ic('trash')}</button></div>`).join('')}</div>` : empty('تظهر هنا نتائج الاختبارات المستوردة من منصة مدرستي');
  }

  v.innerHTML = topbar('ملف الطالب', { actions: `<button class="icon-btn" data-edit aria-label="تعديل">${ic('edit')}</button>` }) + `
  <div class="page profile">
    <div class="pf-head"><span class="av xl">${esc(initials(s.name))}</span><div><h2>${esc(s.name)}</h2><p>${esc(App.cls[s.classId]?.full || '')}</p></div></div>
    ${badgesHtml(studentBadges(s.id, D))}
    ${nc ? `<div class="pf-alert">${ic('flag')}<div><b>يحتاج تواصلًا</b><small>${nc.reasons.map(r => esc(r.reason)).join(' · ')}</small></div></div>` : ''}
    <div class="pf-stats">
      <div><b>${st.rate ?? '—'}${st.rate !== null ? '%' : ''}</b><small>الحضور</small></div><div><b>${st.absent}</b><small>غياب</small></div><div><b>${st.late}</b><small>تأخر</small></div>
      <div><b>${st.escaped}</b><small>هروب</small></div><div><b>${st.excused}</b><small>استئذان</small></div><div class="gold"><b>${st.points}</b><small>نقاط</small></div></div>
    ${profile360(s, { att, hw, notes, contacts, pts, grades })}
    <div class="guardian card"><div class="g-tx"><small>ولي الأمر${s.guardianName ? ': ' + esc(s.guardianName) : ''}</small><b dir="ltr" class="sens">${s.guardianPhone ? esc(s.guardianPhone) : '—'}</b></div>
      ${s.guardianPhone ? `<a class="icon-btn round" href="tel:${esc(s.guardianPhone)}" data-tel aria-label="اتصال">${ic('phone')}</a>` : ''}
      <button class="icon-btn round wa" data-new="msg" aria-label="واتساب">${ic('wa')}</button>
      ${s.guardianPhone ? '' : `<button class="btn xs soft" data-edit>إضافة رقم</button>`}</div>
    <div class="quick-row">
      <button data-new="pt">${ic('star')}<span>مشاركة</span></button><button data-new="pos">${ic('sparkle')}<span>إيجابي</span></button>
      <button data-new="hw">${ic('book')}<span>واجب</span></button><button data-new="note">${ic('note')}<span>ملاحظة</span></button><button data-new="contact">${ic('phone')}<span>تواصل</span></button>
      <button data-new="cert">${ic('medal')}<span>شهادة</span></button><button data-new="report">${ic('print')}<span>تقرير</span></button>
      <button data-new="monthly">${ic('cal')}<span>شهري</span></button><button data-new="remedy">${ic('aid')}<span>علاجية</span></button><button data-new="photo">${ic('camera')}<span>صورة</span></button></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="tab-body">${body}</div>
  </div>`;
  bindBack(v);
  const re = () => App.render();
  $$('[data-tab]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { ...p, tab: b.dataset.tab }; App.render(); });
  $$('[data-edit]', v).forEach(b => b.onclick = async () => { const r = await studentForm(s); if (r === 'deleted') App.back(); else if (r) re(); });
  const ctx = { date: ymd(), period: Sched.live()?.entry.period || 0 };
  $$('[data-new]', v).forEach(b => b.onclick = async () => {
    const k = b.dataset.new;
    let ok;
    if (k === 'pt') { await addPoint({ studentId: s.id, classId: s.classId, ...ctx, type: 'participation', reason: 'مشاركة في الدرس' }, '★ أضيفت نقطة مشاركة'); ok = true; }
    if (k === 'pos') ok = await pointsSheet(s.id, ctx);
    if (k === 'hw') ok = await homeworkSheet(s.id, ctx);
    if (k === 'note') ok = await noteSheet(s.id, ctx);
    if (k === 'contact') ok = await contactSheet(s.id, { reason: nc?.reasons[0]?.reason || '' });
    if (k === 'msg') ok = await messageSheet(s.id, {});
    if (k === 'cert') return certificateSheet(s.id, 1);
    if (k === 'monthly') return monthlySheet(s.id, 0);
    if (k === 'remedy') { const ex = (await DB.byIndex('remedial', 'studentId', s.id)).find(r => r.status === 'open'); if (ex) return App.go('remedial', { tab: 'open' }); const c = (await Remedy.candidates()).find(x => x.sid === s.id); if (await remedySheet(s.id, { reasons: c?.reasons || [] })) App.go('remedial', { tab: 'open' }); return; }
    if (k === 'photo') return photoSheet({ classId: s.classId, studentId: s.id, perf: 'results', caption: s.name });
    if (k === 'report') return App.go('reports', { type: 'student', studentId: s.id, classId: s.classId, range: 'term', run: true });
    if (ok) re();
  });
  $$('[data-res-hw]', v).forEach(b => b.onclick = async () => { if (await resolveHw(b.dataset.resHw)) re(); });
  $$('[data-del-pt]', v).forEach(b => b.onclick = async () => { if (await confirmBox('حذف هذه النقطة؟', { ok: 'حذف', danger: true })) { await DB.del('points', b.dataset.delPt); re(); } });
  /* إلغاء أي سجل أُدخل بالخطأ: تقصير واجب، تواصل/شهادة، درجة اختبار */
  const recNames = { homework: 'حالة الواجب هذه', contacts: 'سجل التواصل هذا', grades: 'هذه الدرجة' };
  $$('[data-del-rec]', v).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const [store, id] = b.dataset.delRec.split('|');
    if (!await confirmBox(`حذف ${recNames[store]}؟`, { ok: 'حذف', danger: true })) return;
    const old = await DB.get(store, id); await DB.del(store, id); re();
    toast('حُذف', '', { undo: async () => { await DB.put(store, old); App.render(); } });
  });
  $$('[data-ev]', v).forEach(b => b.onclick = async () => {
    const [k, id] = b.dataset.ev.split('|');
    if (k === 'note') { if (await noteActions(id)) re(); }
    if (k === 'hw') { const h = await DB.get('homework', id); if (h && !h.resolved && await resolveHw(id)) re(); }
  });
};

/* ===== ملف الطالب 360°: كل شيء في لمحة مع عدد تكرار كل حالة ===== */
function profile360(s, R) {
  const count = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const st = k => R.att.filter(a => a.status === k).length;
  const total = R.att.length, rate = total ? Math.round((st('present') + st('late')) / total * 100) : null;
  const pts = R.pts.reduce((a, b) => a + (b.value || 1), 0);
  const hwK = count(R.hw, h => h.kind), negK = count(R.notes.filter(n => n.kind === 'سلوكية'), n => (n.degree ? n.degree + ': ' : '') + n.text), posK = count(R.pts.filter(x => x.type === 'positive'), x => x.reason);
  const openCases = [...R.hw, ...R.notes].filter(x => !x.resolved);
  const lastC = [...R.contacts].sort((a, b) => b.date.localeCompare(a.date))[0];
  const grades = R.grades.filter(g => g.max && !isNaN(+g.score)).map(g => +g.score / +g.max * 100);
  const avgG = grades.length ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null;
  const row = (icn, t, val, cls = '') => `<div class="p3-row ${cls}"><span>${ic(icn)}</span><b>${t}</b><em>${val}</em></div>`;
  const list = (arr, unit) => arr.length ? `<div class="p3-list">${arr.slice(0, 5).map(([k, n]) => `<span><i class="sens">${esc(k)}</i><b>${n}×</b></span>`).join('')}</div>` : '';
  return `<details class="p360" open><summary>${ic('pulse')} ملف 360° — لمحة شاملة</summary>
    <div class="p3-grid">
      ${row('checkSq', 'الحضور', rate === null ? '—' : rate + '%', rate !== null && rate < 85 ? 'bad' : 'ok')}
      ${row('x', 'غياب · تأخر · هروب', `${st('absent')} · ${st('late')} · ${st('escaped')}`, st('absent') + st('escaped') >= 3 ? 'bad' : '')}
      ${row('book', 'تقصير الواجبات', `${R.hw.length}${R.hw.filter(h => !h.resolved).length ? ` (${R.hw.filter(h => !h.resolved).length} مفتوحة)` : ''}`, R.hw.length >= 3 ? 'bad' : '')}
      ${row('star', 'المشاركة والنقاط', `${pts} نقطة · ${R.pts.filter(x => x.type === 'participation').length} مشاركة`, pts >= 10 ? 'ok' : '')}
      ${row('note', 'الملاحظات', `${R.notes.length}${R.notes.filter(n => n.importance === 'high').length ? ` (${R.notes.filter(n => n.importance === 'high').length} عالية)` : ''}`, R.notes.filter(n => n.importance === 'high').length ? 'bad' : '')}
      ${row('phone', 'التواصل مع ولي الأمر', R.contacts.length ? `${R.contacts.length} · آخره ${shortDate(lastC.date)}` : 'لم يُسجل', '')}
      ${avgG !== null ? row('school', 'متوسط الاختبارات', avgG + '%', avgG < 60 ? 'bad' : 'ok') : ''}
      ${row('flag', 'حالات مفتوحة', openCases.length || '✓ لا شيء', openCases.length ? 'bad' : 'ok')}
    </div>
    ${hwK.length ? `<span class="lbl">تكرار أنواع تقصير الواجب</span>${list(hwK)}` : ''}
    ${negK.length ? `<span class="lbl">تكرار الملاحظات السلوكية</span>${list(negK)}` : ''}
    ${posK.length ? `<span class="lbl">أكثر ما تميّز فيه</span>${list(posK)}` : ''}
  </details>`;
}

async function resolveHw(id) {
  const h = await DB.get('homework', id);
  const r = await sheet(`<p>${esc(App.stu[h.studentId]?.name)} — ${esc(h.kind)} (${shortDate(h.date)})</p>
    <span class="lbl">ما الذي تم؟</span>${chips('r', ['حلّ الواجب لاحقًا', 'تنبيه الطالب', 'التواصل مع ولي الأمر', 'إحالة للمرشد'], 'حلّ الواجب لاحقًا')}
    <label class="fld"><span>تفاصيل (اختياري)</span><input name="d"></label><button class="btn primary block" data-ok>${ic('check')} تمت المعالجة</button>`,
    { title: 'معالجة حالة واجب', onMount: (el, close) => { bindChips(el); el.querySelector('[data-ok]').onclick = () => close([chipVal(el, 'r'), el.querySelector('[name=d]').value.trim()].filter(Boolean).join(' — ')); } });
  if (!r) return false;
  await DB.put('homework', { ...h, resolved: true, status: 'done', resolution: r, resolvedAt: new Date().toISOString() });
  toast('✓ عولجت الحالة', 'ok'); return true;
}
async function noteActions(id) {
  const n = await DB.get('notes', id);
  const r = await choose(n.text, [
    { value: 'msg', label: 'تجهيز رسالة تواصل', sub: n.referTo || 'ولي الأمر / المرشد / الوكيل', icon: ic('wa') },
    { value: 'contact', label: 'تسجيل تواصل بشأنها', icon: ic('phone') },
    ...(caseSt(n) === 'open' ? [{ value: 'follow', label: 'نقلها إلى «تحت المتابعة»', sub: 'بدأت إجراءً ولم تُغلق بعد', icon: ic('history') }] : []),
    ...(n.resolved ? [{ value: 'reopen', label: 'إعادة فتحها', icon: ic('sync') }] : [{ value: 'resolve', label: 'تسجيل ما تم وإغلاقها', icon: ic('check') }]),
    { value: 'edit', label: 'تعديل', icon: ic('edit') },
    { value: 'del', label: 'حذف', icon: ic('trash') }]);
  if (r === 'msg') return messageSheet(n.studentId, { kind: 'neg', behavior: n.text, to: { 'المرشد الطلابي': 'counselor', 'وكيل شؤون الطلاب': 'vp' }[n.referTo] || 'parent', noteId: n.id, date: n.date });
  if (r === 'contact') return contactSheet(n.studentId, { reason: n.text, noteId: n.id, with: n.referTo || 'ولي الأمر' });
  if (r === 'edit') return noteSheet(n.studentId, {}, n);
  if (r === 'follow') { await setCaseSt('notes', id, 'follow'); return true; }
  if (r === 'reopen') { await setCaseSt('notes', id, 'open'); return true; }
  if (r === 'del') { if (await confirmBox('حذف الملاحظة؟', { ok: 'حذف', danger: true })) { await DB.del('notes', id); return true; } }
  if (r === 'resolve') {
    const a = await sheet(`<label class="fld"><span>ما تم بشأنها</span><input name="a" value="${esc(n.action || '')}" placeholder="توجيه، تواصل، إحالة..."></label><button class="btn primary block" data-ok>إغلاق الحالة</button>`,
      { title: 'إغلاق الملاحظة', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close(el.querySelector('[name=a]').value.trim() || 'عولجت') });
    if (a) { await DB.put('notes', { ...n, action: a, resolved: true, status: 'done', resolvedAt: new Date().toISOString() }); return true; }
  }
  return false;
}

/* ===== المتابعة ===== */
Screens.followup = async (v, p) => {
  const tab = p.tab || 'contact';
  const D = await Follow.load();
  const nc = await Follow.needsContact(D);
  const stf = p.st || 'open';
  const act = x => App.stu[x.studentId] && App.stu[x.studentId].active !== false;
  const hwOpen = D.hw.filter(h => !h.resolved && act(h));
  const notesOpen = D.notes.filter(n => !n.resolved && act(n));
  const stChips = arr => `<div class="seg small st-seg">${['open', 'follow', 'done'].map(k => `<button data-st="${k}" class="${k === stf ? 'on' : ''}">${CASE_ST[k][0]} <i>${arr.filter(x => caseSt(x) === k).length}</i></button>`).join('')}</div>`;
  const care = Care.attention(D);
  const tabs = [['contact', 'تحتاج تواصلًا', nc.length], ['early', 'تنبيه مبكر', care.filter(x => !x.contacted).length], ['hw', 'الواجبات', hwOpen.length], ['notes', 'الملاحظات', notesOpen.length], ['freq', 'الأكثر تكرارًا', '']];
  let body = '';
  const nm = sid => esc(App.stu[sid]?.name || '—'), cn = sid => esc(App.className(App.stu[sid]?.classId));
  if (tab === 'contact') {
    body = nc.length ? nc.map(x => `<div class="fu-card"><div class="fu-h" data-open="${x.sid}"><span class="av">${esc(initials(App.stu[x.sid].name))}</span><div><b>${nm(x.sid)}</b><small>${cn(x.sid)}</small></div></div>
      <ul class="fu-reasons">${x.reasons.map(r => `<li class="r-${r.kind}">${esc(r.reason)}</li>`).join('')}</ul>
      <div class="row gap"><button class="btn sm wa grow" data-msg="${x.sid}" data-note="${x.reasons.find(r => r.kind === 'note')?.ref || ''}">${ic('wa')} رسالة</button><button class="btn sm soft grow" data-ct="${x.sid}" data-note="${x.reasons.find(r => r.kind === 'note')?.ref || ''}">${ic('phone')} سجّل تواصل</button></div></div>`).join('')
      : `<div class="empty">${ic('check')}<h3>لا توجد حالات معلقة</h3><p>تظهر هنا تلقائيًا: الملاحظات المهمة، تكرار تقصير الواجبات (3+)، الغياب المتكرر، والهروب — حتى تسجل التواصل بشأنها.</p></div>`;
  } else if (tab === 'early') {
    body = attentionHtml(care);
  } else if (tab === 'hw') {
    const all = D.hw.filter(act), shown = all.filter(h => caseSt(h) === stf).slice(0, 300);
    const by = {}; shown.forEach(h => (by[h.studentId] ||= []).push(h));
    const total = {}; D.hw.forEach(h => total[h.studentId] = (total[h.studentId] || 0) + 1);
    body = stChips(all) + (Object.keys(by).length ? Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([sid, arr]) => `<div class="fu-card"><div class="fu-h" data-open="${sid}"><span class="av">${esc(initials(App.stu[sid].name))}</span><div class="grow"><b>${nm(sid)}</b><small>${cn(sid)} · إجمالي التكرار: ${total[sid]}</small></div><span class="count-b ${arr.length >= 3 ? 'hot' : ''}">${arr.length}</span></div>
      ${arr.sort((a, b) => b.date.localeCompare(a.date)).map(h => `<div class="fu-row"><span>${esc(h.kind)} <small>${shortDate(h.date)}${h.note ? ' · ' + esc(h.note) : ''}</small></span>${stf === 'open' ? `<button class="btn xs ghost" data-fol="homework|${h.id}">متابعة</button>` : ''}${stf === 'done' ? `<button class="btn xs ghost" data-fol="homework|${h.id}|open">إعادة فتح</button>` : `<button class="btn xs soft" data-res="${h.id}">معالجة</button>`}</div>`).join('')}</div>`).join('')
      : `<div class="empty">${ic('book')}<h3>${stf === 'done' ? 'لا توجد حالات معالجة بعد' : stf === 'follow' ? 'لا حالات تحت المتابعة' : 'لا توجد حالات واجبات مفتوحة'}</h3><p>«مفتوحة» لم يُتخذ فيها إجراء، «تحت المتابعة» بدأت معها، «تمت المعالجة» أُغلقت.</p></div>`);
  } else if (tab === 'notes') {
    const ord = { high: 0, mid: 1, low: 2 };
    const allN = D.notes.filter(act), shownN = allN.filter(n => caseSt(n) === stf);
    body = stChips(allN) + (shownN.length ? shownN.sort((a, b) => ord[a.importance] - ord[b.importance] || b.date.localeCompare(a.date)).map(n => `<div class="fu-card imp-${n.importance}" data-note-act="${n.id}"><div class="fu-h"><span class="imp-dot"></span><div class="grow"><b>${nm(n.studentId)}</b><small>${cn(n.studentId)} · ${shortDate(n.date)} · ${esc(n.kind)}</small></div><span class="pill">${{ low: 'منخفضة', mid: 'متوسطة', high: 'عالية' }[n.importance]}</span></div><p class="fu-text sens">${esc(n.text)}</p>${n.referTo ? `<small class="muted">جاهزة للتواصل مع: ${esc(n.referTo)}${n.contacted ? ' · ✓ تم التواصل' : ''}</small>` : ''}${n.action ? `<small class="muted">ما تم: ${esc(n.action)}</small>` : ''}</div>`).join('')
      : `<div class="empty">${ic('note')}<h3>لا ملاحظات ${CASE_ST[stf][0]}</h3><p>المس أي ملاحظة لتغيير حالتها: مفتوحة ← تحت المتابعة ← تمت المعالجة.</p></div>`);
  } else {
    const since = ymd(addDays(new Date(), -30));
    const rank = (arr, key) => { const m = {}; arr.forEach(x => m[x.studentId] = (m[x.studentId] || 0) + 1); return Object.entries(m).filter(([s]) => App.stu[s]?.active !== false).sort((a, b) => b[1] - a[1]).slice(0, 8); };
    const recent = D.att.filter(a => a.date >= since);
    const block = (t, icn, arr, cls) => `<section class="card"><div class="card-h"><h3>${ic(icn)} ${t}</h3><small class="muted">آخر 30 يومًا</small></div>${arr.length ? arr.map(([sid, n], i) => `<button class="rank-row" data-open="${sid}"><span class="rk">${i + 1}</span><span class="grow"><b>${nm(sid)}</b><small>${cn(sid)}</small></span><span class="count-b ${cls}">${n}</span></button>`).join('') : '<p class="muted pad">لا يوجد</p>'}</section>`;
    const topPts = (() => { const m = {}; D.pts.filter(x => x.date >= since).forEach(x => m[x.studentId] = (m[x.studentId] || 0) + (x.value || 1)); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); })();
    body = block('الأكثر غيابًا', 'x', rank(recent.filter(a => a.status === 'absent')), 'bad') + block('الأكثر تأخرًا', 'timer', rank(recent.filter(a => a.status === 'late')), 'warn') +
      block('الهروب من الحصة', 'run', rank(recent.filter(a => a.status === 'escaped')), 'esc') + block('تقصير الواجبات', 'book', rank(D.hw.filter(h => h.date >= since)), 'hw') + block('الأكثر مشاركة وتميزًا ⭐', 'star', topPts, 'gold');
  }
  v.innerHTML = topbar('المتابعة', { back: false }) + `<div class="page"><div class="tabs sticky">${tabs.map(([k, l, n]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}${n !== '' ? ` <i>${n}</i>` : ''}</button>`).join('')}</div>${body}</div>`;
  const re = () => App.render();
  $$('[data-tab]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { tab: b.dataset.tab }; App.render(); });
  $$('[data-st]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { tab, st: b.dataset.st }; App.render(); });
  $$('[data-fol]', v).forEach(b => b.onclick = async () => { const [s, id, to] = b.dataset.fol.split('|'); await setCaseSt(s, id, to || 'follow'); re(); });
  $$('[data-open]', v).forEach(b => b.onclick = () => App.go('student', { id: b.dataset.open }));
  $$('[data-msg]', v).forEach(b => b.onclick = async () => { const n = b.dataset.note ? await DB.get('notes', b.dataset.note) : null; if (await messageSheet(b.dataset.msg, { kind: 'neg', behavior: n?.text || '', noteId: n?.id, date: n?.date })) re(); });
  $$('[data-ct]', v).forEach(b => b.onclick = async () => { const x = nc.find(y => y.sid === b.dataset.ct); if (await contactSheet(b.dataset.ct, { reason: x?.reasons[0]?.reason, noteId: b.dataset.note })) re(); });
  $$('[data-res]', v).forEach(b => b.onclick = async () => { if (await resolveHw(b.dataset.res)) re(); });
  if (tab === 'early') bindAttention(v, care);
  $$('[data-note-act]', v).forEach(b => b.onclick = async () => { if (await noteActions(b.dataset.noteAct)) re(); });
};
