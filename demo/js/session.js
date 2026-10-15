/* فصلي — شاشة الحصة: الحضور، المشاركة، الواجبات، والنوافذ السريعة */
'use strict';

Screens.session = async (v, p) => {
  // اختيار الحصة إن لم تحدد
  if (!p.classId) return sessionPicker(v, p);
  const date = p.date || ymd(), period = p.period || 0, classId = p.classId;
  const mode = p.mode || 'att';
  const host = Merge.host(date);
  const merged = !!host && !p.cover && !!App.cls[classId];
  const studs = merged ? App.students.filter(s => App.cls[s.classId]?.grade === App.cls[classId].grade).sort((a, b) => a.classId.localeCompare(b.classId) || a.name.localeCompare(b.name, 'ar')) : App.classStudents(classId);
  const sset = new Set(studs.map(s => s.id));
  const les = Curr.lesson(classId, date);
  const sesId = `${date}|${period}|${classId}`;
  const ses = await DB.get('sessions', sesId);
  const att = (await DB.byIndex('attendance', 'date', date)).filter(a => a.period === period && sset.has(a.studentId));
  const amap = Object.fromEntries(att.map(a => [a.studentId, a]));
  const pts = (await DB.byIndex('points', 'date', date)).filter(a => a.period === period && sset.has(a.studentId));
  const hws = (await DB.byIndex('homework', 'date', date)).filter(a => a.period === period && sset.has(a.studentId));
  const nts = (await DB.byIndex('notes', 'date', date)).filter(a => a.period === period && sset.has(a.studentId));
  const isToday = date === ymd();
  const live = Sched.live();
  const isLive = isToday && live?.entry.classId === classId && live?.entry.period === period;
  const pt = Sched.periodTimes(period);
  const status = id => amap[id]?.status || 'present';
  const counts = Object.fromEntries(ATT_ORDER.map(k => [k, studs.filter(s => status(s.id) === k).length]));
  const panel = !p.cover && studs.length ? await sessionPanel(classId, studs) : '';

  const head = `<div class="ses-head">
      <div class="ses-title"><h2>${esc(App.className(classId))}</h2>
        <p>${period ? `الحصة ${ordinal(period)}${pt ? ` · ${fmt12(pt.start)}` : ''}` : 'حصة إضافية'} · ${shortDate(date)} · ${hijri(parseYmd(date))}</p></div>
      ${isLive ? `<div class="ses-timer">${ic('timer')}<b data-countdown>--:--</b></div>` : `<button class="btn sm ghost" data-change>${ic('edit')} تغيير</button>`}
    </div>
    ${ses?.complete ? `<div class="ses-done">${ic('check')} الحضور معتمد ${ses.completedAt ? `الساعة ${new Date(ses.completedAt).toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}` : ''} — أي تعديل يُحفظ في سجل التعديل</div>` : ''}
    ${p.cover ? `<div class="ses-flag cover">${ic('clock')} حصة انتظار — تغطية فصل ${esc(App.className(classId))}</div>` : ''}
    ${merged ? `<div class="ses-flag merge">${ic('merge')} الخميس: طلاب الصف ${GRADES[App.cls[classId].grade]} مدموجون في فصل ${SECTIONS[host]} (${studs.length} طالب) — يُسجَّل كل طالب في فصله</div>` : ''}
    ${les && !p.cover ? `<div class="ses-lesson">${ic('book')}<div class="grow"><small>${les.week ? `درس الأسبوع ${les.week}` : ''}</small><b>${esc(les.title || 'لم يُحدد درس هذا الأسبوع')}</b></div>${les.week ? `<button class="btn xs ${Curr.done(classId)[les.week] ? 'soft' : 'gold'}" data-ldone>${Curr.done(classId)[les.week] ? '✓ أُنجز' : 'أنهيته'}</button>` : ''}</div>` : ''}
    ${!p.cover && App.cls[classId] ? reachHtml(classId) : ''}
    ${panel}
    ${studs.length ? toolsBar() : ''}
    <div class="seg" role="tablist">
      <button data-mode="att" class="${mode === 'att' ? 'on' : ''}">${ic('checkSq')} الحضور</button>
      <button data-mode="part" class="${mode === 'part' ? 'on' : ''}">${ic('star')} المشاركة</button>
      <button data-mode="hw" class="${mode === 'hw' ? 'on' : ''}">${ic('book')} الواجبات</button>
      ${merged ? '' : `<button data-mode="seat" class="${mode === 'seat' ? 'on' : ''}">${ic('seat')} المقاعد</button>`}
    </div>`;

  let body = '';
  if (!studs.length) body = `<div class="empty">${ic('users')}<h3>لا يوجد طلاب في هذا الفصل</h3><p>أضف الطلاب أو استوردهم من ملف نور</p><button class="btn primary" data-go="students">إدارة الطلاب</button></div>`;
  else if (mode === 'seat') {
    body = seatBody(classId, studs, status, sid => pts.filter(x => x.studentId === sid).reduce((a, b) => a + (b.value || 1), 0));
  }
  else if (mode === 'att') {
    body = `<div class="att-summary">${ATT_ORDER.map(k => `<div class="as-i" style="--c:${ATT[k].color}"><b>${counts[k]}</b><small>${ATT[k].label}</small></div>`).join('')}</div>
      <div class="row gap wrap mb"><button class="btn sm soft" data-allp>${ic('check')} الكل حاضر</button><span class="muted small">اضغط الحالة لتغييرها — يُحفظ تلقائيًا</span></div>
      <div class="att-list">${studs.map((s, i) => {
      const st = status(s.id); const a = amap[s.id];
      const sp = pts.filter(x => x.studentId === s.id).length, sh = hws.filter(x => x.studentId === s.id).length, sn = nts.filter(x => x.studentId === s.id).length;
      return `<div class="att-row st-${st}" data-sid="${s.id}">
          <button class="att-name" data-quick="${s.id}"><span class="num">${i + 1}</span><span class="nm">${esc(s.name)}</span>
            <span class="badges">${sp ? `<i class="b-star">★${sp}</i>` : ''}${sh ? `<i class="b-hw">📚${sh}</i>` : ''}${sn ? `<i class="b-nt">📝${sn}</i>` : ''}${a?.history?.length ? `<i class="b-hi" title="معدّل">${ic('history')}</i>` : ''}</span></button>
          <div class="att-pills">${ATT_ORDER.map(k => `<button class="ap ${st === k ? 'on' : ''}" data-st="${k}" style="--c:${ATT[k].color}" aria-label="${ATT[k].label}">${ATT[k].label}</button>`).join('')}</div>
        </div>`;
    }).join('')}</div>`;
  } else {
    const isPart = mode === 'part';
    body = `<p class="hint">${isPart ? 'اضغط على الطالب لإضافة نقطة مشاركة — زر ✨ في زاوية البطاقة لنقطة سلوك إيجابي مع السبب، و(−) للتراجع' : 'اضغط على الطالب لتسجيل تقصيره في الواجب (لم يحل/ناقص/لم يحضر الكتاب...)'}</p>
      <div class="tap-grid">${studs.map(s => {
      const n = isPart ? pts.filter(x => x.studentId === s.id).reduce((a, b) => a + (b.value || 1), 0) : hws.filter(x => x.studentId === s.id).length;
      const absent = ['absent', 'escaped'].includes(status(s.id));
      return `<div class="tap-card ${n ? 'has' : ''} ${absent ? 'dim' : ''} ${isPart ? 'part' : 'hw'}" data-tap="${s.id}">
          <span class="av">${esc(initials(s.name))}</span><b>${esc(shortName(s.name))}</b>
          ${n ? `<span class="cnt">${isPart ? '★' : '📚'} ${n}</span>` : ''}
          ${isPart ? `<button class="mini" data-pos="${s.id}" aria-label="سلوك إيجابي">${ic('sparkle')}</button>${n ? `<button class="mini undo" data-undo="${s.id}" aria-label="تراجع">${ic('minus')}</button>` : ''}` : ''}
        </div>`;
    }).join('')}</div>`;
  }

  v.innerHTML = topbar('الحصة', { actions: `<button class="icon-btn" data-go="timetable" aria-label="الجدول">${ic('grid')}</button>` }) +
    `<div class="page session">${head}${body}</div>
     ${studs.length ? `<div class="sticky-foot row gap">${mode === 'att' ? `<button class="btn primary grow" data-commit>${ic('checkSq')} ${ses?.complete ? 'تحديث الاعتماد' : 'اعتماد الحضور'}</button>` : ''}${!p.cover ? `<button class="btn soft ${mode === 'att' ? '' : 'grow'}" data-summary>${ic('chart')} ملخص الحصة</button>` : ''}</div>` : ''}`;
  bindBack(v); bindGo(v);
  const rerender = (extra = {}) => { App.stack[App.stack.length - 1].params = { ...p, ...extra }; App.render(); };

  $$('[data-mode]', v).forEach(b => b.onclick = () => rerender({ mode: b.dataset.mode }));
  v.querySelector('[data-change]')?.addEventListener('click', async () => {
    const r = await pickSessionSheet({ date, period, classId });
    if (r) { App.stack[App.stack.length - 1].params = { ...r, mode }; App.render(); }
  });

  const setStatus = async (sid, st) => {
    const id = `${date}|${period}|${sid}`;
    const cur = amap[sid] || await DB.get('attendance', id);
    const rec = cur ? { ...cur } : { id, date, period, classId: App.stu[sid]?.classId || classId, studentId: sid, status: 'present', at: new Date().toISOString(), history: [] };
    if (rec.status === st && cur) return;
    if (cur && (ses?.complete || date !== ymd())) rec.history = [...(rec.history || []), { at: new Date().toISOString(), from: cur.status, to: st }];
    rec.status = st; rec.updatedAt = new Date().toISOString();
    await DB.put('attendance', rec); amap[sid] = rec;
  };

  $$('.att-row', v).forEach(row => {
    const sid = row.dataset.sid;
    $$('.ap', row).forEach(b => b.onclick = async () => {
      await setStatus(sid, b.dataset.st);
      row.className = `att-row st-${b.dataset.st}`;
      $$('.ap', row).forEach(x => x.classList.toggle('on', x === b));
      ATT_ORDER.forEach(k => counts[k] = studs.filter(s => status(s.id) === k).length);
      $$('.as-i b', v).forEach((el, i) => el.textContent = counts[ATT_ORDER[i]]);
      if (navigator.vibrate) navigator.vibrate(12);
    });
  });
  v.querySelector('[data-allp]')?.addEventListener('click', async () => {
    for (const s of studs) if (status(s.id) !== 'present') await setStatus(s.id, 'present');
    rerender();
  });
  $$('[data-quick]', v).forEach(b => b.onclick = () => studentQuick(b.dataset.quick, { date, period, classId }, rerender));
  v.querySelector('[data-commit]')?.addEventListener('click', async () => {
    for (const s of studs) if (!amap[s.id]) await DB.put('attendance', { id: `${date}|${period}|${s.id}`, date, period, classId: s.classId, studentId: s.id, status: 'present', at: new Date().toISOString(), history: [] });
    await DB.put('sessions', { id: sesId, date, period, classId, complete: true, completedAt: new Date().toISOString(), counts, cover: !!p.cover || !!ses?.cover, merged });
    Native.call('setPeriodStatus', `${date}|${period}`, 'done');
    toast(`${ic('check')} تم اعتماد حضور ${esc(App.className(classId))} — غياب ${counts.absent} · تأخر ${counts.late}`, 'ok');
    rerender();
    if (!p.cover && !merged && isLive) setTimeout(() => classSummary({ classId, date, period }), 500);
  });

  // المشاركة والواجبات
  const ctx = { date, period, classId };
  bindTools(v, { date, period, classId, cover: p.cover });
  v.querySelector('[data-summary]')?.addEventListener('click', () => classSummary({ classId, date, period }));
  $$('[data-sq]', v).forEach(b => b.onclick = () => studentQuick(b.dataset.sq, ctx, rerender));
  v.querySelector('.ses-panel')?.addEventListener('toggle', e => App._panelOpen = e.target.open);
  if (mode === 'seat') bindSeats(v, { classId, ctx, status, setStatus, rerender });
  v.querySelector('[data-reach]')?.addEventListener('click', async () => { if (await reachSheet(classId)) rerender(); });
  v.querySelector('[data-ldone]')?.addEventListener('click', async () => { await Curr.markDone(classId, les.week, !Curr.done(classId)[les.week]); rerender(); });
  $$('[data-tap]', v).forEach(card => card.onclick = async e => {
    if (e.target.closest('.mini')) return;
    const sid = card.dataset.tap;
    if (mode === 'part') {
      await addPoint({ studentId: sid, ...ctx, classId: App.stu[sid].classId, type: 'participation', reason: 'مشاركة في الدرس' }, `★ مشاركة لـ ${esc(shortName(App.stu[sid].name))}`);
      if (navigator.vibrate) navigator.vibrate(15);
      card.classList.add('pop'); setTimeout(() => rerender(), 160);
    } else {
      const ok = await homeworkSheet(sid, ctx); if (ok) rerender();
    }
  });
  $$('[data-pos]', v).forEach(b => b.onclick = async () => { if (await pointsSheet(b.dataset.pos, ctx)) rerender(); });
  $$('[data-undo]', v).forEach(b => b.onclick = async () => {
    const mine = pts.filter(x => x.studentId === b.dataset.undo).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    if (mine[0]) { await DB.del('points', mine[0].id); rerender(); }
  });
  App.tick();
};

async function sessionPicker(v, p) {
  const lessons = p.cover ? [] : Sched.lessonsOn();
  v.innerHTML = topbar(p.cover ? 'حصة انتظار' : 'الحصة') + `<div class="page">
    ${p.cover ? `<div class="ses-flag cover">${ic('clock')} حصة الانتظار ${p.period ? ordinal(p.period) : ''} — اختر الفصل الذي تغطيه</div>` : ''}
    ${p.cover ? '' : `<section class="card"><div class="card-h"><h3>${ic('clock')} حصص اليوم</h3></div>
      ${lessons.length ? `<div class="menu-list">${lessons.map(l => `<button class="menu-item" data-pick="${l.entry.classId}|${l.entry.period}"><span class="mi-ic num-ic">${l.entry.period}</span><span class="mi-tx"><b>${esc(App.className(l.entry.classId))}</b><small>${fmt12(l.start)} – ${fmt12(l.end)}</small></span>${ic('chev', 'mi-ch')}</button>`).join('')}</div>` : '<p class="muted pad">لا حصص في جدولك اليوم</p>'}
    </section>`}
    <section class="card"><div class="card-h"><h3>${ic('grid')} اختر فصلًا</h3></div>
      <div class="class-grid">${App.classes.map(c => `<button class="class-tile" data-cls="${c.id}"><b>${esc(c.name)}</b><small>${App.classStudents(c.id).length} طالب</small></button>`).join('')}</div>
    </section>
    <button class="btn ghost block" data-other>${ic('cal')} تسجيل أو تصحيح حصة سابقة</button></div>`;
  bindBack(v);
  $$('[data-pick]', v).forEach(b => b.onclick = () => { const [c, pp] = b.dataset.pick.split('|'); App.go('session', { classId: c, period: +pp, date: ymd() }, true); });
  $$('[data-cls]', v).forEach(b => b.onclick = async () => {
    if (p.cover && p.period) return App.go('session', { classId: b.dataset.cls, period: p.period, date: ymd(), cover: true }, true);
    const r = await pickSessionSheet({ date: ymd(), classId: b.dataset.cls, period: Sched.bellNow().n || 1 });
    if (r) App.go('session', { ...r, cover: !!p.cover }, true);
  });
  v.querySelector('[data-other]').onclick = async () => { const r = await pickSessionSheet({ date: ymd(), classId: App.classes[0].id, period: 1 }); if (r) App.go('session', r, true); };
}

function pickSessionSheet({ date, period, classId }) {
  return sheet(`<label class="fld"><span>التاريخ</span><input type="date" name="date" value="${date}" max="${ymd()}"></label>
    <label class="fld"><span>الفصل</span><select name="classId">${App.classes.map(c => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>الحصة</span><select name="period">${App.bell.periods.map(x => `<option value="${x.n}" ${x.n === period ? 'selected' : ''}>الحصة ${ordinal(x.n)} (${fmt12(x.start)})</option>`).join('')}</select></label>
    <button class="btn primary block" data-ok>فتح</button>`, {
    title: 'اختيار الحصة', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close({
      date: el.querySelector('[name=date]').value || ymd(), classId: el.querySelector('[name=classId]').value, period: +el.querySelector('[name=period]').value
    })
  });
}

/* «حدث الآن» (studentQuick) انتقلت إلى smart.js */

/* ===== نوافذ الإدخال ===== */
function chips(name, items, sel, multi = false) {
  return `<div class="chips" data-chips="${name}" ${multi ? 'data-multi' : ''}>${items.map(i => `<button type="button" class="chip ${i === sel ? 'on' : ''}" data-v="${esc(i)}">${esc(i)}</button>`).join('')}</div>`;
}
function bindChips(el) {
  $$('[data-chips]', el).forEach(g => $$('.chip', g).forEach(c => c.onclick = () => {
    if (!g.hasAttribute('data-multi')) $$('.chip', g).forEach(x => x.classList.remove('on'));
    c.classList.toggle('on'); g.dispatchEvent(new Event('change'));
  }));
}
const chipVal = (el, name) => $(`[data-chips="${name}"] .chip.on`, el)?.dataset.v || '';

async function homeworkSheet(sid, ctx, existing) {
  const s = App.stu[sid];
  const prev = (await DB.byIndex('homework', 'studentId', sid)).length;
  return sheet(`<div class="who">${ic('book')} <b>${esc(s.name)}</b> <small>${esc(App.className(s.classId))} · سُجّل عليه ${prev} مرة سابقًا</small></div>
    <span class="lbl">نوع التقصير</span>${chips('kind', App.lists.homeworkKinds, existing?.kind || App.lists.homeworkKinds[0])}
    <label class="fld"><span>ملاحظة (اختياري)</span><input name="note" value="${esc(existing?.note || '')}" placeholder="مثال: واجب صفحة 24"></label>
    <button class="btn primary block" data-ok>حفظ</button>`, {
    title: 'متابعة الواجب', onMount: (el, close) => {
      bindChips(el);
      el.querySelector('[data-ok]').onclick = async () => {
        const rec = { id: existing?.id || uid(), studentId: sid, classId: s.classId, date: ctx.date || ymd(), period: ctx.period || 0, kind: chipVal(el, 'kind'), note: el.querySelector('[name=note]').value.trim(), resolved: existing?.resolved || false, status: existing?.status || 'open', at: existing?.at || new Date().toISOString() };
        await DB.put('homework', rec);
        toast(`📚 سُجّل التقصير — المرة ${prev + (existing ? 0 : 1)}`, prev >= 2 ? 'warn' : 'ok', existing ? {} : { undo: async () => { await DB.del('homework', rec.id); App.render(); } }); close(true);
      };
    }
  });
}

async function pointsSheet(sid, ctx) {
  const s = App.stu[sid];
  return sheet(`<div class="who">${ic('sparkle')} <b>${esc(s.name)}</b></div>
    <span class="lbl">السبب</span>${chips('reason', App.lists.positive, App.lists.positive[0])}
    <label class="fld"><span>أو اكتب سببًا آخر</span><input name="other" placeholder="مبادرة، تميز..."></label>
    <span class="lbl">عدد النقاط</span>${chips('val', ['1', '2', '3', '5'], '1')}
    <button class="btn primary block" data-ok>${ic('star')} إضافة</button>`, {
    title: 'نقطة إيجابية وتحفيز', onMount: (el, close) => {
      bindChips(el);
      el.querySelector('[data-ok]').onclick = async () => {
        await addPoint({ studentId: sid, classId: s.classId, date: ctx.date || ymd(), period: ctx.period || 0, type: 'positive', reason: el.querySelector('[name=other]').value.trim() || chipVal(el, 'reason'), value: +chipVal(el, 'val') || 1 }, '✨ أضيفت النقاط الإيجابية');
        close(true);
      };
    }
  });
}

async function noteSheet(sid, ctx, existing) {
  const s = App.stu[sid];
  const n = existing || {};
  const prevSame = (await DB.byIndex('notes', 'studentId', sid)).length;
  return sheet(`<div class="who">${ic('note')} <b>${esc(s.name)}</b> <small>ملاحظات سابقة: ${prevSame}</small></div>
    <span class="lbl">نوع الملاحظة</span>${chips('kind', App.lists.noteKinds, n.kind || 'سلوكية')}
    <span class="lbl">درجة الأهمية</span><div class="chips imp" data-chips="imp">${[['low', 'منخفضة'], ['mid', 'متوسطة'], ['high', 'عالية']].map(([k, l]) => `<button type="button" class="chip imp-${k} ${(n.importance || 'mid') === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
    <span class="lbl">اختيار سريع (حسب قواعد السلوك والمواظبة)</span>
    <select name="pick"><option value="">— اختر —</option>${App.lists.negative.map(x => `<option>${esc(x)}</option>`).join('')}</select>
    <label class="fld"><span>نص الملاحظة</span><div class="voice-fld"><textarea name="text" rows="3" placeholder="اكتب الملاحظة أو اضغط الميكروفون وتكلم">${esc(n.text || '')}</textarea>${micBtn('[name=text]')}</div></label>
    <label class="switch"><input type="checkbox" name="needsContact" ${n.needsContact ? 'checked' : ''}><span></span> تحتاج تواصلًا</label>
    <label class="fld"><span>إحالة / تجهيز للتواصل مع</span><select name="refer">${['', 'ولي الأمر', 'المرشد الطلابي', 'وكيل شؤون الطلاب'].map(x => `<option ${n.referTo === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="fld"><span>ما تم بشأنها (اختياري)</span><input name="action" value="${esc(n.action || '')}" placeholder="تنبيه شفهي، توجيه، اتصال..."></label>
    <button class="btn primary block" data-ok>حفظ الملاحظة</button>`, {
    title: existing ? 'تعديل ملاحظة' : 'ملاحظة جديدة', onMount: (el, close) => {
      bindChips(el); bindMic(el);
      el.querySelector('[name=pick]').onchange = e => { const t = el.querySelector('[name=text]'); t.value = e.target.value.replace(/^الدرجة [^:]+:\s*/, ''); };
      el.querySelector('[data-ok]').onclick = async () => {
        const text = el.querySelector('[name=text]').value.trim();
        if (!text) return toast('اكتب نص الملاحظة', 'bad');
        const action = el.querySelector('[name=action]').value.trim();
        await DB.put('notes', {
          id: n.id || uid(), studentId: sid, classId: s.classId, date: n.date || ctx.date || ymd(), period: n.period ?? ctx.period ?? 0,
          kind: chipVal(el, 'kind'), importance: chipVal(el, 'imp') || 'mid', text, degree: (el.querySelector('[name=pick]').value.match(/^الدرجة [^:]+/) || [n.degree || ''])[0],
          needsContact: el.querySelector('[name=needsContact]').checked, referTo: el.querySelector('[name=refer]').value, action,
          resolved: n.resolved || false, status: n.status || 'open', at: n.at || new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        toast('📝 حُفظت الملاحظة', 'ok'); close(true);
      };
    }
  });
}

async function contactSheet(sid, preset = {}) {
  const s = App.stu[sid];
  return sheet(`<div class="who">${ic('phone')} <b>${esc(s.name)}</b></div>
    <span class="lbl">مع من</span>${chips('with', ['ولي الأمر', 'المرشد الطلابي', 'وكيل شؤون الطلاب'], preset.with || 'ولي الأمر')}
    <span class="lbl">طريقة التواصل</span>${chips('channel', ['اتصال', 'واتساب', 'رسالة نصية', 'حضور شخصي'], preset.channel || 'اتصال')}
    <label class="fld"><span>السبب</span><input name="reason" value="${esc(preset.reason || '')}" placeholder="الغياب المتكرر، الواجبات..."></label>
    <label class="fld"><span>النتيجة</span><div class="voice-fld"><input name="result" value="${esc(preset.result || '')}" placeholder="تم التفاهم، وعد بالمتابعة...">${micBtn('[name=result]')}</div></label>
    <label class="fld"><span>التاريخ</span><input type="date" name="date" value="${preset.date || ymd()}"></label>
    <button class="btn primary block" data-ok>تسجيل التواصل</button>`, {
    title: 'تسجيل تواصل ومتابعة', onMount: (el, close) => {
      bindChips(el); bindMic(el);
      el.querySelector('[data-ok]').onclick = async () => {
        const reason = el.querySelector('[name=reason]').value.trim();
        if (!reason) return toast('اكتب سبب التواصل', 'bad');
        await DB.put('contacts', { id: uid(), studentId: sid, classId: s.classId, date: el.querySelector('[name=date]').value || ymd(), with: chipVal(el, 'with'), channel: chipVal(el, 'channel'), reason, result: el.querySelector('[name=result]').value.trim(), noteId: preset.noteId || '', at: new Date().toISOString() });
        if (preset.noteId) { const n = await DB.get('notes', preset.noteId); if (n) await DB.put('notes', { ...n, contacted: true, contactedAt: new Date().toISOString() }); }
        toast('📞 سُجّل التواصل', 'ok'); close(true);
      };
    }
  });
}

/* ===== رسائل واتساب بصوت المعلم (من صِلة) ===== */
function buildMessage({ s, to, kind, behavior, date, extra }) {
  const S = App.S, cname = App.cls[s.classId]?.full || App.className(s.classId);
  const d = parseYmd(date || ymd());
  const dateTx = `${dayName(d)} ${hijri(d)}`;
  const sign = `\n\n${to === 'parent' ? 'معلم ابنكم' : 'المعلم'}/ ${S.teacherName}\nمعلم ${S.subject} — ${S.school}`;
  const beh = String(behavior || '').replace(/^الدرجة [^:]+:\s*/, '');
  const per = extra?.period ? ` (الحصة ${ordinal(extra.period)})` : '';
  const T = {
    absent: [`نحيطكم علمًا بغياب ابنكم عن حصة ${S.subject} يوم ${dateTx}${per}.`, 'نأمل متابعته وحثّه على الانتظام في الحضور، شاكرين تعاونكم.'],
    late: [`نحيطكم علمًا بتأخر ابنكم عن حصة ${S.subject} يوم ${dateTx}${per}.`, 'نأمل توجيهه بالحرص على الحضور في الوقت المحدد، شاكرين تعاونكم.'],
    escaped: [`نحيطكم علمًا بخروج ابنكم من حصة ${S.subject} دون استئذان يوم ${dateTx}${per}.`, 'نأمل التواصل معنا ومتابعته في ذلك، فهو ابن لنا ويهمنا انضباطه.'],
    hw: [`نحيطكم بأن ابنكم ${beh && beh !== 'لم يحل الواجب' ? `سُجّل عليه في الواجب: ${beh}` : 'لم يحل الواجب'} في مادة ${S.subject} يوم ${dateTx}.`, 'نأمل متابعته في حل واجباته بانتظام، شاكرين حسن تعاونكم.']
  };
  if (T[kind]) {
    const body = `${T[kind][0]}\n${T[kind][1]}`;
    if (to === 'parent') return `السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب/ ${s.name} المحترم\n\n${body}${typeof extra === 'string' && extra ? '\n\n' + extra : ''}` + sign;
    const who = to === 'vp' ? `سعادة وكيل شؤون الطلاب ${S.vpStudents || ''}` : 'سعادة المرشد الطلابي';
    return `${who} المحترم\nالسلام عليكم ورحمة الله وبركاته\n\nأحيطكم علمًا بأن الطالب/ ${s.name} من ${cname}: ${T[kind][0].replace(/^نحيطكم (علمًا )?ب(أن )?/, '').replace(/ابنكم/g, 'الطالب')}\nللاطلاع واتخاذ ما ترونه مناسبًا، ولكم جزيل الشكر.` + sign;
  }
  if (to === 'parent') {
    const hello = `السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب/ ${s.name} المحترم\n\n`;
    if (kind === 'pos') return hello + `يسعدني بصفتي معلم ابنكم في مادة ${S.subject} (${cname}) أن أشيد بتميّزه في: ${beh}، وذلك يوم ${dateTx}، وهذا ما عهدناه منه. أسأل الله أن يديم عليه التوفيق، وشكرًا لحسن متابعتكم واهتمامكم.${typeof extra === 'string' && extra ? '\n\n' + extra : ''}` + sign;
    return hello + `حرصًا مني على مصلحة ابنكم، أود إحاطتكم بأنه لوحظ عليه يوم ${dateTx} في حصة ${S.subject}: ${beh}.\nوأنا على ثقة بتعاونكم معي في توجيهه؛ فهو ابن لنا ويهمنا تميزه.${typeof extra === 'string' && extra ? '\n\n' + extra : ''}` + sign;
  }
  const who = to === 'vp' ? `سعادة وكيل شؤون الطلاب ${S.vpStudents || ''}` : `سعادة ${S.counselor && S.counselor !== 'المرشد الطلابي' ? 'المرشد الطلابي ' + S.counselor : 'المرشد الطلابي'}`;
  if (kind === 'pos') return `${who} المحترم\nالسلام عليكم ورحمة الله وبركاته\n\nأحب أن أشيد بالطالب/ ${s.name} من ${cname}، لتميّزه في: ${beh}، وذلك يوم ${dateTx}، وأقترح تكريمه وتحفيزه.${typeof extra === 'string' && extra ? '\n\n' + extra : ''}` + sign;
  return `${who} المحترم\nالسلام عليكم ورحمة الله وبركاته\n\nأحيطكم علمًا بأن الطالب/ ${s.name} من ${cname} لوحظ عليه يوم ${dateTx} في حصة ${S.subject}: ${beh}.\nللاطلاع واتخاذ ما ترونه مناسبًا، ولكم جزيل الشكر.${typeof extra === 'string' && extra ? '\n\n' + extra : ''}` + sign;
}

async function messageSheet(sid, preset = {}) {
  const s = App.stu[sid];
  const L = App.lists;
  return sheet(`<div class="who">${ic('wa')} <b>${esc(s.name)}</b> <small>${esc(App.className(s.classId))}</small></div>
    <span class="lbl">المرسَل إليه</span><div class="chips" data-chips="to">
      <button type="button" class="chip ${(preset.to || 'parent') === 'parent' ? 'on' : ''}" data-v="parent">ولي الأمر</button>
      <button type="button" class="chip ${preset.to === 'vp' ? 'on' : ''}" data-v="vp">وكيل شؤون الطلاب</button>
      <button type="button" class="chip ${preset.to === 'counselor' ? 'on' : ''}" data-v="counselor">المرشد الطلابي</button></div>
    <span class="lbl">نوع الرسالة</span><div class="chips" data-chips="kind">
      <button type="button" class="chip ${(preset.kind || 'pos') === 'pos' ? 'on' : ''}" data-v="pos">إشادة (سلوك إيجابي)</button>
      <button type="button" class="chip ${preset.kind === 'neg' ? 'on' : ''}" data-v="neg">ملاحظة (سلوك سلبي)</button>
      <button type="button" class="chip ${preset.kind === 'absent' ? 'on' : ''}" data-v="absent">غياب</button>
      <button type="button" class="chip ${preset.kind === 'late' ? 'on' : ''}" data-v="late">تأخر</button>
      <button type="button" class="chip ${preset.kind === 'escaped' ? 'on' : ''}" data-v="escaped">هروب</button>
      <button type="button" class="chip ${preset.kind === 'hw' ? 'on' : ''}" data-v="hw">الواجب</button></div>
    <label class="fld" data-behf><span>السلوك</span><select name="beh"></select></label>
    <label class="fld" data-behf><span>أو اكتب السلوك</span><input name="custom" value="${esc(preset.behavior && !L.positive.includes(preset.behavior) && !L.negative.includes(preset.behavior) ? preset.behavior : '')}"></label>
    <label class="fld"><span>نص الرسالة (يمكنك تعديله)</span><textarea name="msg" rows="9"></textarea></label>
    <div class="row gap"><button class="btn wa grow" data-send>${ic('wa')} إرسال واتساب</button><button class="btn ghost" data-copy>نسخ</button></div>
    <p class="muted small" data-phone-hint></p>`, {
    title: 'رسالة واتساب', onMount: (el, close) => {
      bindChips(el);
      const fill = () => {
        const kind = chipVal(el, 'kind'), list = kind === 'pos' ? L.positive : kind === 'hw' ? L.homeworkKinds : L.negative;
        $$('[data-behf]', el).forEach(f => f.hidden = ['absent', 'late', 'escaped'].includes(kind));
        const sel = el.querySelector('[name=beh]'), keep = sel.value || preset.behavior;
        sel.innerHTML = list.map(x => `<option ${x === keep ? 'selected' : ''}>${esc(x)}</option>`).join('');
      };
      const compose = () => {
        const to = chipVal(el, 'to');
        el.querySelector('[name=msg]').value = buildMessage({ s, to, kind: chipVal(el, 'kind'), behavior: el.querySelector('[name=custom]').value.trim() || el.querySelector('[name=beh]').value, date: preset.date, extra: preset.period ? { period: preset.period } : '' });
        const ph = to === 'parent' ? s.guardianPhone : to === 'vp' ? App.S.vpStudentsPhone : App.S.counselorPhone;
        el.querySelector('[data-phone-hint]').textContent = ph ? `سيُرسل إلى الرقم المسجل (${maskPhone(phoneIntl(ph))})` : 'لا يوجد رقم مسجل — سيفتح واتساب لتختار جهة الاتصال';
      };
      fill(); compose();
      $$('[data-chips="kind"]', el).forEach(g => g.addEventListener('change', () => { fill(); compose(); }));
      $$('[data-chips="to"]', el).forEach(g => g.addEventListener('change', compose));
      el.querySelector('[name=beh]').onchange = compose; el.querySelector('[name=custom]').oninput = compose;
      el.querySelector('[data-copy]').onclick = () => { navigator.clipboard?.writeText(el.querySelector('[name=msg]').value); toast('نُسخت الرسالة', 'ok'); };
      el.querySelector('[data-send]').onclick = async () => {
        const to = chipVal(el, 'to');
        const ph = phoneIntl(to === 'parent' ? s.guardianPhone : to === 'vp' ? App.S.vpStudentsPhone : App.S.counselorPhone);
        const txt = el.querySelector('[name=msg]').value;
        Native.open(`https://wa.me/${ph}?text=${encodeURIComponent(txt)}`);
        const beh = el.querySelector('[name=custom]').value.trim() || el.querySelector('[name=beh]').value;
        await DB.put('contacts', { id: uid(), studentId: sid, classId: s.classId, date: ymd(), with: { parent: 'ولي الأمر', vp: 'وكيل شؤون الطلاب', counselor: 'المرشد الطلابي' }[to], channel: 'واتساب', reason: ({ pos: 'إشادة: ', neg: 'ملاحظة: ', hw: 'الواجب: ', absent: 'غياب', late: 'تأخر', escaped: 'هروب من الحصة' }[chipVal(el, 'kind')] || '') + (['absent', 'late', 'escaped'].includes(chipVal(el, 'kind')) ? '' : beh.replace(/^الدرجة [^:]+:\s*/, '')), result: 'أُرسلت رسالة', noteId: preset.noteId || '', at: new Date().toISOString() });
        if (preset.noteId) { const n = await DB.get('notes', preset.noteId); if (n) await DB.put('notes', { ...n, contacted: true, contactedAt: new Date().toISOString() }); }
        toast('سُجّلت الرسالة في سجل التواصل', 'ok'); close(true);
      };
    }
  });
}
