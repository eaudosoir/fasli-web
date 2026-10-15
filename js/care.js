/* فصلي — المتابعة الذكية: تنبيه مبكر «يحتاجون متابعة»، رسالة الأسبوع لولي الأمر، النسخ الاحتياطي التلقائي */
'use strict';

/* ===== تنبيه مبكر: من بدأ يتراجع قبل أن تتفاقم حالته ===== */
const Care = {
  attention(D) {
    const today = ymd(), d7 = ymd(addDays(new Date(), -7)), d14 = ymd(addDays(new Date(), -14));
    const map = {};
    const add = (sid, t, kind) => { const s = App.stu[sid]; if (!s || s.active === false) return; (map[sid] ||= { sid, flags: [] }).flags.push({ t, kind }); };
    const per = (arr, f) => { const m = {}; arr.filter(f).forEach(x => m[x.studentId] = (m[x.studentId] || 0) + 1); return m; };
    const abs7 = per(D.att, a => a.date >= d7 && a.status === 'absent');
    const late7 = per(D.att, a => a.date >= d7 && a.status === 'late');
    const hw7 = per(D.hw, h => h.date >= d7);
    const neg14 = per(D.notes, n => n.date >= d14 && n.kind === 'سلوكية');
    const seen14 = per(D.att, a => a.date >= d14 && ['present', 'late'].includes(a.status));
    const pts = (from, to) => { const m = {}; D.pts.filter(x => x.date >= from && x.date <= to).forEach(x => m[x.studentId] = (m[x.studentId] || 0) + (x.value || 1)); return m; };
    const p7 = pts(d7, today), pPrev = pts(d14, ymd(addDays(new Date(), -8))), p14 = pts(d14, today);
    Object.entries(abs7).forEach(([s, n]) => n >= 2 && add(s, `غاب ${n} حصص خلال آخر 7 أيام`, 'abs'));
    Object.entries(late7).forEach(([s, n]) => n >= 2 && add(s, `تأخر ${n} مرات خلال آخر 7 أيام`, 'late'));
    Object.entries(hw7).forEach(([s, n]) => n >= 2 && add(s, `قصّر في الواجبات ${n} مرات هذا الأسبوع`, 'hw'));
    Object.entries(neg14).forEach(([s, n]) => n >= 2 && add(s, `${n} ملاحظات سلوكية خلال أسبوعين`, 'note'));
    Object.entries(seen14).forEach(([s, n]) => { if (n >= 4 && !p14[s]) add(s, `حضر ${n} حصص ولم يشارك منذ أسبوعين`, 'quiet'); });
    Object.entries(pPrev).forEach(([s, n]) => { if (n >= 4 && (p7[s] || 0) <= n / 3) add(s, `تراجعت مشاركته (${p7[s] || 0} هذا الأسبوع مقابل ${n} قبله)`, 'drop'); });
    const lastC = {}; D.contacts.forEach(c => { if (!lastC[c.studentId] || c.date > lastC[c.studentId]) lastC[c.studentId] = c.date; });
    return Object.values(map).map(x => ({ ...x, contacted: lastC[x.sid] >= d7 ? lastC[x.sid] : '' }))
      .sort((a, b) => (!!a.contacted - !!b.contacted) || b.flags.length - a.flags.length || App.stu[a.sid].name.localeCompare(App.stu[b.sid].name, 'ar'));
  }
};
const CARE_IC = { abs: 'x', late: 'timer', hw: 'book', note: 'note', quiet: 'eye', drop: 'pulse' };

function attentionHtml(list) {
  if (!list.length) return `<div class="empty">${ic('check')}<h3>لا أحد يحتاج متابعة الآن 👏</h3><p>يراقب فصلي طلابك تلقائيًا: الغياب والتأخر المتكرر هذا الأسبوع، تقصير الواجبات، الملاحظات السلوكية، ومن توقف عن المشاركة أو تراجعت مشاركته.</p></div>`;
  return `<p class="hint">${ic('pulse')} قائمة أسبوعية تتحدث تلقائيًا — تصرّف مبكرًا قبل أن تتحول الحالة إلى مشكلة.</p>` + list.map(x => `<div class="fu-card care ${x.contacted ? 'done' : ''}"><div class="fu-h" data-open="${x.sid}"><span class="av">${esc(initials(App.stu[x.sid].name))}</span><div class="grow"><b>${esc(App.stu[x.sid].name)}</b><small>${esc(App.className(App.stu[x.sid].classId))}${x.contacted ? ` · ✓ تواصلت ${shortDate(x.contacted)}` : ''}</small></div><span class="count-b ${x.flags.length >= 2 ? 'hot' : ''}">${x.flags.length}</span></div>
    <ul class="care-flags">${x.flags.map(f => `<li class="cf-${f.kind}">${ic(CARE_IC[f.kind])} ${esc(f.t)}</li>`).join('')}</ul>
    <div class="row gap"><button class="btn sm wa grow" data-cmsg="${x.sid}">${ic('wa')} رسالة</button><button class="btn sm soft grow" data-cct="${x.sid}">${ic('phone')} سجّل تواصل</button></div></div>`).join('');
}
function bindAttention(v, list) {
  $$('[data-open]', v).forEach(b => b.onclick = () => App.go('student', { id: b.dataset.open }));
  $$('[data-cmsg]', v).forEach(b => b.onclick = async () => { const x = list.find(y => y.sid === b.dataset.cmsg); if (await messageSheet(x.sid, { kind: 'neg', behavior: x.flags[0].t })) App.render(); });
  $$('[data-cct]', v).forEach(b => b.onclick = async () => { const x = list.find(y => y.sid === b.dataset.cct); if (await contactSheet(x.sid, { reason: x.flags.map(f => f.t).join('، ') })) App.render(); });
}
Screens.attention = async (v) => {
  const list = Care.attention(await Follow.load());
  v.innerHTML = topbar('يحتاجون متابعة') + `<div class="page">${attentionHtml(list)}</div>`;
  bindBack(v); bindAttention(v, list);
};

/* ===== رسالة الأسبوع لولي الأمر ===== */
function weeklySummary(sid, D, from, to) {
  const inR = x => x.studentId === sid && x.date >= from && x.date <= to;
  const att = D.att.filter(inR), pts = D.pts.filter(inR), hw = D.hw.filter(inR), notes = D.notes.filter(inR);
  const c = k => att.filter(a => a.status === k).length;
  const points = pts.reduce((a, b) => a + (b.value || 1), 0);
  const pos = [...new Set(pts.filter(x => x.type === 'positive').map(x => x.reason))];
  return { total: att.length, present: c('present') + c('late'), absent: c('absent'), late: c('late'), escaped: c('escaped'), points, part: pts.filter(x => x.type === 'participation').length, pos, hw: hw.length, hwKinds: [...new Set(hw.map(h => h.kind))], notes: notes.filter(n => n.kind === 'سلوكية').map(n => n.text) };
}
function weeklyMessage(s, w, from, to) {
  const S = App.S, cname = App.cls[s.classId]?.full || App.className(s.classId);
  const L = [];
  L.push(`السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب/ ${s.name} المحترم\n`);
  L.push(`إليكم ملخص أداء ابنكم في مادة ${S.subject} (${cname}) لهذا الأسبوع من ${shortDate(from)} إلى ${shortDate(to)}:\n`);
  L.push(w.total ? `✅ الحضور: حضر ${w.present} من ${w.total} حصص${w.absent ? ` · غياب ${w.absent}` : ''}${w.late ? ` · تأخر ${w.late}` : ''}${w.escaped ? ` · خروج من الحصة ${w.escaped}` : ''}` : '✅ الحضور: لم تُسجّل حصص هذا الأسبوع');
  L.push(`⭐ المشاركة: ${w.points ? `${w.points} نقطة${w.part ? ` (${w.part} مشاركة في الدرس)` : ''}` : 'لم يشارك هذا الأسبوع، ونتطلع لمشاركته'}`);
  if (w.pos.length) L.push(`🌟 تميّز في: ${w.pos.slice(0, 3).join('، ')}`);
  L.push(w.hw ? `📚 الواجبات: سُجّل عليه ${w.hw} ${w.hw === 1 ? 'ملاحظة' : 'ملاحظات'} (${w.hwKinds.join('، ')})` : '📚 الواجبات: ملتزم بواجباته، بارك الله فيه');
  if (w.notes.length) L.push(`📝 ملاحظة سلوكية: ${w.notes[0]}`);
  const good = !w.absent && !w.hw && !w.notes.length && w.points > 0;
  L.push('\n' + (good ? 'أداء متميز نفخر به، شكرًا لحسن متابعتكم وأسأل الله له دوام التوفيق.' : 'نأمل تعاونكم ومتابعتكم لنرتقي بمستواه معًا، فهو ابن لنا ويهمنا تميّزه.'));
  L.push(`\nمعلم ابنكم/ ${S.teacherName}\nمعلم ${S.subject} — ${S.school}`);
  return L.join('\n');
}
Screens.weekly = async (v, p) => {
  const off = p.off || 0;
  const [from, to] = weekRange(addDays(new Date(), -7 * off));
  const cid = p.classId || App._lastClass && App._lastClass !== 'all' && App._lastClass || App.classes.find(c => App.classStudents(c.id).length)?.id;
  const D = await Follow.load();
  const sent = new Set(((App.S.weeklySent || {})[from]) || []);
  const studs = App.classStudents(cid);
  const rows = studs.map(s => ({ s, w: weeklySummary(s.id, D, from, to) }));
  const sentN = studs.filter(s => sent.has(s.id)).length;
  v.innerHTML = topbar('رسالة الأسبوع لأولياء الأمور') + `<div class="page">
    <div class="stars-hero">${ic('send')}<div><b>ملخص أسبوعي لكل طالب بضغطة</b><small>${shortDate(from)} — ${shortDate(to)} · الحضور والمشاركة والواجبات والسلوك في رسالة واتساب جاهزة</small></div></div>
    <div class="seg small"><button data-off="1" class="${off === 1 ? 'on' : ''}">الأسبوع الماضي</button><button data-off="0" class="${off === 0 ? 'on' : ''}">هذا الأسبوع</button></div>
    <div class="class-chips">${App.classes.filter(c => App.classStudents(c.id).length).map(c => `<button class="chip ${c.id === cid ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <div class="wk-prog"><div><b>${sentN}</b> من ${studs.length} أُرسلت</div><i style="width:${studs.length ? sentN / studs.length * 100 : 0}%"></i></div>
    ${studs.length ? `<button class="btn wa block" data-next>${ic('send')} إرسال للطالب التالي${sentN < studs.length ? ` (${esc(shortName(studs.find(s => !sent.has(s.id))?.name || ''))})` : ''}</button>` : ''}
    <div class="wk-list">${rows.map(({ s, w }) => `<div class="wk-row ${sent.has(s.id) ? 'sent' : ''}">
      <div class="grow" data-prev="${s.id}"><b>${esc(s.name)}</b><small>${w.total ? `حضور ${w.present}/${w.total}` : 'بلا حصص'} · ⭐${w.points}${w.hw ? ` · 📚${w.hw}` : ''}${w.absent ? ` · غ${w.absent}` : ''}${s.guardianPhone ? '' : ' · لا يوجد رقم'}</small></div>
      ${sent.has(s.id) ? `<span class="wk-ok">${ic('check')}</span>` : ''}<button class="icon-btn round wa" data-send="${s.id}" aria-label="إرسال">${ic('wa')}</button></div>`).join('')}</div>
    <p class="muted small center">يفتح واتساب برسالة جاهزة لكل ولي أمر — اضغط إرسال في واتساب ثم ارجع لفصلي للطالب التالي.</p></div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-off]', v).forEach(b => b.onclick = () => setP({ off: +b.dataset.off }));
  $$('[data-c]', v).forEach(b => b.onclick = () => setP({ classId: b.dataset.c }));
  const send = async (sid, txt) => {
    const s = App.stu[sid];
    Native.open(`https://wa.me/${phoneIntl(s.guardianPhone)}?text=${encodeURIComponent(txt)}`);
    const all = { ...(App.S.weeklySent || {}) }; all[from] = [...new Set([...(all[from] || []), sid])];
    Object.keys(all).sort().slice(0, -6).forEach(k => delete all[k]);
    await App.set('weeklySent', all);
    await DB.put('contacts', { id: uid(), studentId: sid, classId: s.classId, date: ymd(), with: 'ولي الأمر', channel: 'واتساب', reason: 'رسالة الأسبوع (ملخص الأداء)', result: 'أُرسلت', at: new Date().toISOString() });
    logUse('weekly'); setTimeout(() => App.render(), 400);
  };
  const preview = async sid => {
    const s = App.stu[sid], w = rows.find(r => r.s.id === sid).w;
    const r = await sheet(`<div class="who">${ic('wa')} <b>${esc(s.name)}</b><small>${s.guardianPhone ? `<span dir="ltr">${maskPhone(phoneIntl(s.guardianPhone))}</span>` : 'لا يوجد رقم — ستختار جهة الاتصال في واتساب'}</small></div>
      <label class="fld"><span>نص الرسالة (يمكنك تعديله)</span><textarea name="m" rows="13">${esc(weeklyMessage(s, w, from, to))}</textarea></label>
      <button class="btn wa block" data-ok>${ic('wa')} إرسال واتساب</button>`, { title: 'رسالة الأسبوع', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close(el.querySelector('[name=m]').value) });
    if (r) send(sid, r);
  };
  $$('[data-send]', v).forEach(b => b.onclick = () => preview(b.dataset.send));
  $$('[data-prev]', v).forEach(b => b.onclick = () => preview(b.dataset.prev));
  v.querySelector('[data-next]')?.addEventListener('click', () => { const s = studs.find(x => !sent.has(x.id)); if (!s) return toast('أُرسلت رسائل كل طلاب الفصل ✓', 'ok'); preview(s.id); });
};

/* ===== النسخ الاحتياطي التلقائي اليومي ===== */
const AutoBackup = {
  enabled() { return App.S.autoBackup !== false; },
  async run(force = false) {
    if (!Native.has() || (!force && (!this.enabled() || App.S.lastAutoBackup === ymd()))) return false;
    try {
      const b = await backupPayload();
      const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
      const name = `فصلي-تلقائي-${dayName(new Date())}.json`;
      const ok = Native.call('saveBackup', name, await blobToB64(blob));
      try { await Cloud.snap(true); } catch (e) { }
      if (ok === false) return false;
      await App.set('lastAutoBackup', ymd());
      return true;
    } catch (e) { console.warn(e); return false; }
  }
};
