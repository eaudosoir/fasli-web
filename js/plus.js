/* فصلي — الإضافات: النسخ السحابي، صور الشواهد، ورقة العمل والاختبار، الخطة العلاجية، التقرير الشهري */
'use strict';

/* ================= 1) النسخ الاحتياطي السحابي ================= */
const b64ToText = s => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
const Cloud = {
  _lastSnap: 0,
  /* نسخة داخلية يرفعها أندرويد تلقائيًا إلى حساب Google */
  async snap(force = false) {
    if (!Native.has() || !window.FasliAndroid.saveSnapshot) return false;
    if (!force && Date.now() - this._lastSnap < 20 * 60000) return false;
    try {
      const b = await backupPayload();
      const ok = Native.call('saveSnapshot', await blobToB64(new Blob([JSON.stringify(b)], { type: 'application/json' })));
      if (ok) { this._lastSnap = Date.now(); await App.set('lastSnapshot', new Date().toISOString()); }
      return !!ok;
    } catch (e) { console.warn(e); return false; }
  },
  shareDue() { const l = App.S.lastCloudShare; return !l || (Date.now() - new Date(l).getTime()) > 7 * 86400000; },
  async shareToDrive() {
    const b = await backupPayload();
    await Native.shareFile(`فصلي-نسخة-${ymd()}.json`, new Blob([JSON.stringify(b)], { type: 'application/json' }), 'application/json');
    await App.set('lastCloudShare', new Date().toISOString());
    await App.set('lastBackup', new Date().toISOString());
  },
  /* بعد إعادة التثبيت أو جهاز جديد: يعرض استعادة البيانات من النسخة السحابية */
  async offerRestore() {
    if (!Native.has() || !window.FasliAndroid.readSnapshot || App.S.snapshotOffered) return false;
    const [ses, att] = await Promise.all([DB.all('sessions'), DB.all('attendance')]);
    if (ses.length || att.length) return false;
    const raw = Native.call('readSnapshot'); if (!raw) return false;
    let b; try { b = JSON.parse(b64ToText(raw)); } catch (e) { return false; }
    await App.set('snapshotOffered', true);
    try { b = await openBackupFile(b); } catch (e) { toast(esc(e.message), 'bad'); return false; }
    const n = (b.data?.attendance || []).length + (b.data?.sessions || []).length;
    if (!n) return false;
    if (!await confirmBox(`${ic('cloud')} وجدنا نسختك المحفوظة في السحابة بتاريخ <b>${esc((b.exportedAt || '').slice(0, 10))}</b><br><small>${(b.data.students || []).length} طالب · ${(b.data.attendance || []).length} سجل حضور. هل تريد استعادتها؟</small>`, { ok: 'استعادة بياناتي' })) return false;
    await DB.importAll(b); await App.load(); App.syncNative(); toast('تمت استعادة بياناتك من السحابة ✓', 'ok');
    return true;
  }
};
document.addEventListener('visibilitychange', () => { if (document.hidden && App.students?.length) Cloud.snap(); });

function cloudCardHtml() {
  const snap = App.S.lastSnapshot, sh = App.S.lastCloudShare;
  return `<section class="card cloud-card"><div class="card-h"><h3>${ic('cloud')} الحماية السحابية</h3><span class="pill ${Native.has() && snap ? 'ok' : ''}">${Native.has() && snap ? 'تعمل' : 'غير مفعّلة'}</span></div>
    <div class="cloud-row"><span>${ic('sync')}</span><div><b>نسخة تلقائية في حساب Google</b><small>${snap ? `آخر تحديث: ${shortDate(snap.slice(0, 10))} ${new Date(snap).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' })}` : 'تُحدَّث عند خروجك من التطبيق'} — يرفعها أندرويد مع نسخ جهازك، وتُستعاد تلقائيًا إذا أعدت تثبيت فصلي أو انتقلت لجهاز جديد بنفس الحساب.</small></div></div>
    <p class="muted small">${ic('info')} تأكد مرة واحدة: إعدادات الجهاز ← Google ← النسخ الاحتياطي ← «نسخ احتياطي بواسطة Google One» مفعّل.</p>
    <div class="cloud-row"><span>${ic('upload')}</span><div><b>نسخة أسبوعية إلى Google Drive</b><small>${sh ? `آخر رفع: ${shortDate(sh.slice(0, 10))}` : 'لم ترفع نسخة بعد'} — ملف تفتحه من أي جهاز، اختر «Drive» من قائمة المشاركة.</small></div></div>
    <button class="btn gold block" data-drive>${ic('cloud')} رفع نسخة إلى Google Drive الآن</button></section>`;
}
function bindCloudCard(v) {
  v.querySelector('[data-drive]')?.addEventListener('click', async () => { await Cloud.shareToDrive(); setTimeout(() => App.render(), 800); });
}

/* ================= 2) صور الشواهد ================= */
const Photos = {
  LIMIT: 150,
  async compress(file, max = 1280, q = .72) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const thumbC = document.createElement('canvas'); const t = 320 / Math.max(c.width, c.height); thumbC.width = Math.round(c.width * t); thumbC.height = Math.round(c.height * t);
      thumbC.getContext('2d').drawImage(c, 0, 0, thumbC.width, thumbC.height);
      return { data: c.toDataURL('image/jpeg', q), thumb: thumbC.toDataURL('image/jpeg', .7), w: c.width, h: c.height };
    } finally { URL.revokeObjectURL(url); }
  },
  all() { return DB.all('photos'); },
  async inRange(from, to) { return (await DB.range('photos', 'date', from, to)).sort((a, b) => b.at.localeCompare(a.at)); }
};
const perfName = k => (PERF.find(x => x[0] === k) || [])[1] || '';

async function photoSheet(ctx = {}) {
  const n = (await Photos.all()).length;
  if (n >= Photos.LIMIT) toast(`لديك ${n} صورة — صدّر الصور القديمة واحذفها حفاظًا على مساحة النسخ السحابي`, 'bad');
  const file = await pickFile('image/*'); if (!file) return null;
  let ph; try { ph = await Photos.compress(file); } catch (e) { toast('تعذر قراءة الصورة', 'bad'); return null; }
  const cls = App.classes.filter(c => App.classStudents(c.id).length);
  const r = await sheet(`<div class="ph-prev"><img src="${ph.thumb}" alt=""></div>
    <label class="fld"><span>عنصر الأداء الوظيفي</span><select name="perf">${PERF.map(([k, t]) => `<option value="${k}" ${k === (ctx.perf || 'strategies') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="fld"><span>الفصل</span><select name="cls"><option value="">— بدون —</option>${cls.map(c => `<option value="${c.id}" ${c.id === ctx.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>وصف الشاهد</span><div class="voice-fld"><input name="cap" placeholder="مثال: تعلم تعاوني — خريطة المملكة" value="${esc(ctx.caption || (ctx.classId && Curr.lesson(ctx.classId)?.title) || '')}">${micBtn('[name=cap]')}</div></label>
    <button class="btn primary block" data-ok>${ic('check')} حفظ الشاهد</button>`, {
    title: 'صورة شاهد', onMount: (el, close) => {
      bindMic(el);
      el.querySelector('[data-ok]').onclick = () => close({ perf: el.querySelector('[name=perf]').value, classId: el.querySelector('[name=cls]').value, caption: el.querySelector('[name=cap]').value.trim() });
    }
  });
  if (!r) return null;
  const rec = { id: uid(), date: ctx.date || ymd(), ...r, studentId: ctx.studentId || '', data: ph.data, thumb: ph.thumb, w: ph.w, h: ph.h, at: new Date().toISOString() };
  await DB.put('photos', rec); logUse('photo');
  toast(`${ic('camera')} حُفظ الشاهد في «${esc(perfName(r.perf))}»`, 'ok');
  return rec;
}

function photoViewer(p, onChange) {
  const el = overlay(`<div class="ph-view"><img src="${p.data}" alt="">
    <div class="ph-cap"><b>${esc(p.caption || 'بدون وصف')}</b><small>${esc(perfName(p.perf))}${p.classId ? ' · ' + esc(App.className(p.classId)) : ''} · ${shortDate(p.date)}</small></div>
    <div class="row gap center-row"><button class="btn light" data-sh>${ic('share')} مشاركة</button><button class="btn danger" data-del>${ic('trash')} حذف</button></div></div>`, 'dark');
  el.querySelector('[data-sh]').onclick = async () => { const blob = await (await fetch(p.data)).blob(); Native.shareFile(`شاهد-${p.date}.jpg`, blob, 'image/jpeg'); };
  el.querySelector('[data-del]').onclick = async () => { if (await confirmBox('حذف هذه الصورة؟', { ok: 'حذف', danger: true })) { await DB.del('photos', p.id); el._close(); onChange?.(); } };
}

Screens.photos = async (v, p) => {
  const all = (await Photos.all()).sort((a, b) => b.at.localeCompare(a.at));
  const f = p.perf || '';
  const list = f ? all.filter(x => x.perf === f) : all;
  const used = PERF.filter(([k]) => all.some(x => x.perf === k));
  v.innerHTML = topbar('صور الشواهد', { actions: `<button class="icon-btn" data-add aria-label="إضافة">${ic('camera')}</button>` }) + `<div class="page">
    <div class="stars-hero navy">${ic('camera')}<div><b>شواهد مصوّرة لملف الإنجاز</b><small>${all.length} صورة · تظهر تلقائيًا تحت عنصرها في «شواهد الأداء الوظيفي» وتُطبع معه</small></div></div>
    <button class="btn gold block" data-add>${ic('camera')} التقط صورة أو اختر من المعرض</button>
    ${used.length ? `<div class="class-chips"><button class="chip ${!f ? 'on' : ''}" data-f="">الكل</button>${used.map(([k, t]) => `<button class="chip ${f === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}</div>` : ''}
    ${list.length ? `<div class="ph-grid">${list.map(x => `<button class="ph-t" data-v="${x.id}"><img src="${x.thumb}" alt="" loading="lazy"><span>${esc(x.caption || perfName(x.perf))}</span></button>`).join('')}</div>`
      : `<div class="empty">${ic('camera')}<h3>لا صور بعد</h3><p>صوّر نشاطًا أو وسيلة أو عمل الطلاب من زر «صورة» في الحصة، أو من هنا.</p></div>`}
    ${all.length ? `<button class="btn soft block" data-zip>${ic('download')} تصدير كل الصور (ملف مضغوط)</button>` : ''}</div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-add]', v).forEach(b => b.onclick = async () => { if (await photoSheet({ perf: f || undefined })) App.render(); });
  $$('[data-f]', v).forEach(b => b.onclick = () => setP({ perf: b.dataset.f }));
  $$('[data-v]', v).forEach(b => b.onclick = () => photoViewer(all.find(x => x.id === b.dataset.v), () => App.render()));
  v.querySelector('[data-zip]')?.addEventListener('click', async () => {
    toast('جارٍ تجهيز الصور…');
    const z = new JSZip();
    all.forEach((x, i) => { const dir = (perfName(x.perf) || 'أخرى').replace(/[\\/:*?"<>|]/g, ''); z.file(`${dir}/${x.date}-${i + 1}${x.caption ? '-' + x.caption.slice(0, 40).replace(/[\\/:*?"<>|]/g, '') : ''}.jpg`, x.data.split(',')[1], { base64: true }); });
    Native.saveFile(`صور-الشواهد-${ymd()}.zip`, await z.generateAsync({ type: 'blob' }), 'application/zip');
  });
};

/* ================= 3) ورقة العمل والاختبار القصير ================= */
function seededShuffle(arr, seedStr) {
  let h = 2166136261; for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
  const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a;
}
Screens.worksheet = async (v, p) => {
  const grade = p.grade || App.cls[App._lastClass]?.grade || 4;
  const plan = Curr.plan(grade);
  const nowW = Curr.weekOf().n || 1;
  const weeks = p.weeks || [p.week || nowW];
  const kind = p.kind || 'ws', count = p.count || 8, key = p.key !== false;
  const classes = App.classes.filter(c => c.grade === grade && App.classStudents(c.id).length);
  const sel = p.cls || classes.map(c => c.id);
  const pool = []; const seen = new Set();
  weeks.forEach(w => QB.list(grade, w).forEach(([q, a]) => { if (!seen.has(q)) { seen.add(q); pool.push([q, a]); } }));
  const title = kind === 'quiz' ? 'اختبار قصير' : 'ورقة عمل';
  const lessonsTxt = weeks.map(w => plan[w - 1]).filter(Boolean).join(' · ');
  const versions = (sel.length ? sel : ['']).map(cid => ({ cid, items: seededShuffle(pool, `${cid}|${weeks.join(',')}|${ymd()}`).slice(0, count) }));
  const S = App.S;
  const page = ({ cid, items }, isKey) => `<div class="ws-page ${isKey ? 'key' : ''}">
    <div class="ws-head"><div class="ws-k"><b>المملكة العربية السعودية</b><span>وزارة التعليم</span><span>${esc(S.school)}</span></div>
      <img src="img/logo.png" alt=""><div class="ws-k left"><span>المادة: ${esc(S.subject)}</span><span>الصف: ${esc(cid ? App.cls[cid].full : GRADES[grade])}</span><span>${hijri(new Date())}</span></div></div>
    <h2 class="ws-title">${title}${isKey ? ' — نموذج الإجابة' : ''}</h2>${lessonsTxt ? `<p class="ws-les">${esc(lessonsTxt)}</p>` : ''}
    ${isKey ? '' : `<div class="ws-name"><span>اسم الطالب: ..............................................</span>${kind === 'quiz' ? `<span class="ws-score">الدرجة: <b>&nbsp;&nbsp;&nbsp;</b> / ${items.length}</span>` : ''}</div>`}
    <ol class="ws-q">${items.map(([q, a]) => `<li><b>${esc(q)}</b>${isKey ? `<div class="ws-ans">${esc(a)}</div>` : '<div class="ws-line"></div><div class="ws-line"></div>'}</li>`).join('')}</ol>
    <div class="ws-foot"><span>معلم المادة: ${esc(S.teacherName)}</span>${kind === 'quiz' && !isKey ? '<span>توقيع ولي الأمر: ............</span>' : ''}</div></div>`;
  v.innerHTML = topbar('ورقة عمل واختبار قصير') + `<div class="page">
    <div class="no-print">
    <div class="seg">${[4, 5, 6].map(g => `<button class="${g === grade ? 'on' : ''}" data-g="${g}">${GRADES[g]}</button>`).join('')}</div>
    <div class="seg small"><button class="${kind === 'ws' ? 'on' : ''}" data-k="ws">${ic('sheet')} ورقة عمل</button><button class="${kind === 'quiz' ? 'on' : ''}" data-k="quiz">${ic('checkSq')} اختبار قصير</button></div>
    <section class="card"><div class="card-h"><h3>${ic('route')} الدروس</h3><small class="muted">${pool.length} سؤالًا متاحًا</small></div>
      <div class="ws-weeks">${(plan.length ? plan : CURR_WEEKS.map(() => '')).map((t, i) => QB.list(grade, i + 1).length ? `<button class="chip ${weeks.includes(i + 1) ? 'on' : ''}" data-w="${i + 1}">أ${i + 1}${t ? ': ' + esc(t.split(':').pop().trim()) : ''}</button>` : '').join('')}</div></section>
    <div class="row gap"><label class="fld grow"><span>عدد الأسئلة</span><select data-n>${[5, 8, 10, 12, 15, 20].map(n => `<option ${n === count ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="switch grow"><input type="checkbox" data-key ${key ? 'checked' : ''}><span></span> نموذج إجابة</label></div>
    ${classes.length > 1 ? `<span class="lbl">نموذج مختلف الترتيب لكل فصل</span><div class="class-chips">${classes.map(c => `<button class="chip ${sel.includes(c.id) ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>` : ''}
    ${pool.length ? `<button class="btn primary block" data-print>${ic('print')} طباعة / PDF (${versions.length} ${versions.length === 1 ? 'نموذج' : 'نماذج'}${key ? ' + الإجابات' : ''})</button>` : `<div class="hint">${ic('info')} لا توجد أسئلة لهذه الدروس — أضفها من بنك الأسئلة.</div>`}
    <p class="muted small center">معاينة:</p></div>
    <div class="print-area ws-wrap">${pool.length ? versions.map(x => page(x, false) + (key ? page(x, true) : '')).join('') : ''}</div></div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, grade, weeks, kind, count, key, cls: sel, ...x }; App.render(); };
  $$('[data-g]', v).forEach(b => b.onclick = () => setP({ grade: +b.dataset.g, weeks: [nowW], cls: undefined }));
  $$('[data-k]', v).forEach(b => b.onclick = () => setP({ kind: b.dataset.k }));
  $$('[data-w]', v).forEach(b => b.onclick = () => { const w = +b.dataset.w; const ws = weeks.includes(w) ? weeks.filter(x => x !== w) : [...weeks, w].sort((a, b) => a - b); setP({ weeks: ws.length ? ws : [w] }); });
  $$('[data-c]', v).forEach(b => b.onclick = () => { const c = b.dataset.c; const s2 = sel.includes(c) ? sel.filter(x => x !== c) : [...sel, c]; setP({ cls: s2 }); });
  v.querySelector('[data-n]').onchange = e => setP({ count: +e.target.value });
  v.querySelector('[data-key]').onchange = e => setP({ key: e.target.checked });
  v.querySelector('[data-print]')?.addEventListener('click', () => { logUse('worksheet'); Native.print(`${title} — ${GRADES[grade]}`); });
};

/* ================= 4) الخطة العلاجية ================= */
const REMEDY_ACTIONS = ['توجيه فردي وتشجيع', 'أوراق عمل علاجية', 'إعادة شرح المهارة', 'تعلم بالأقران (زميل متميز)', 'نقله إلى مقعد أمامي', 'متابعة الواجبات يوميًا', 'تعزيز وتحفيز عند التحسن', 'تواصل مع ولي الأمر', 'إحالة للمرشد الطلابي'];
const REMEDY_RESULTS = ['تحسّن ملحوظ', 'تحسّن جزئي', 'لم يتحسن بعد'];
const Remedy = {
  async candidates(D) {
    D = D || await Follow.load();
    const plans = await DB.all('remedial');
    const openIds = new Set(plans.filter(x => x.status === 'open').map(x => x.studentId));
    const map = {};
    Care.attention(D).forEach(x => (map[x.sid] = { sid: x.sid, reasons: x.flags.map(f => f.t) }));
    const d30 = ymd(addDays(new Date(), -30));
    const hw = {}; D.hw.filter(h => h.date >= d30).forEach(h => hw[h.studentId] = (hw[h.studentId] || 0) + 1);
    Object.entries(hw).forEach(([s, n]) => { if (n >= 4) ((map[s] ||= { sid: s, reasons: [] }).reasons).push(`${n} تقصير في الواجبات خلال 30 يومًا`); });
    (await DB.all('grades')).filter(g => g.date >= d30 && +g.max && g.score !== '' && g.score != null && +g.score / +g.max < .5).forEach(g => ((map[g.studentId] ||= { sid: g.studentId, reasons: [] }).reasons).push(`درجة منخفضة: ${g.title || 'اختبار'} (${g.score}/${g.max})`));
    return Object.values(map).filter(x => App.stu[x.sid] && App.stu[x.sid].active !== false && !openIds.has(x.sid))
      .map(x => ({ ...x, reasons: [...new Set(x.reasons)] })).sort((a, b) => b.reasons.length - a.reasons.length);
  },
  parentMsg(r) {
    const s = App.stu[r.studentId], S = App.S;
    return `السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب/ ${s.name} المحترم\n\nحرصًا منا على تميّز ابنكم في مادة ${S.subject}، وضعنا له خطة دعم فردية بسبب: ${r.reasons.join('، ')}.\n\nتشمل الخطة: ${r.actions.join('، ')}.\n\nونأمل تعاونكم بمتابعة واجباته اليومية ومراجعة الدروس معه في البيت، وسأوافيكم بتقدّمه بإذن الله.\n\nمعلم ابنكم/ ${S.teacherName}\nمعلم ${S.subject} — ${S.school}`;
  }
};
async function remedySheet(sid, preset = {}, existing) {
  const s = App.stu[sid];
  const r0 = existing || { reasons: preset.reasons || [], actions: ['توجيه فردي وتشجيع', 'أوراق عمل علاجية', 'تواصل مع ولي الأمر'], goal: '', days: 14 };
  const res = await sheet(`<div class="who">${ic('aid')} <b>${esc(s.name)}</b><small>${esc(App.className(s.classId))}</small></div>
    <label class="fld"><span>أسباب الخطة (تشخيص)</span><textarea name="why" rows="3">${esc(r0.reasons.join('\n'))}</textarea></label>
    <span class="lbl">الإجراءات العلاجية</span>${chips('act', REMEDY_ACTIONS, null, true)}
    <label class="fld"><span>الهدف</span><input name="goal" placeholder="مثال: أن يسلّم واجباته كاملة ويشارك مرتين أسبوعيًا" value="${esc(r0.goal || '')}"></label>
    <label class="fld"><span>مدة الخطة</span><select name="days">${[7, 14, 21, 30].map(d => `<option value="${d}" ${d === (r0.days || 14) ? 'selected' : ''}>${d === 7 ? 'أسبوع' : d === 14 ? 'أسبوعان' : d === 21 ? '3 أسابيع' : 'شهر'}</option>`).join('')}</select></label>
    <button class="btn primary block" data-ok>${ic('check')} ${existing ? 'حفظ التعديل' : 'اعتماد الخطة'}</button>`, {
    title: 'خطة علاجية', onMount: (el, close) => {
      $$('[data-chips="act"] .chip', el).forEach(c => c.classList.toggle('on', r0.actions.includes(c.dataset.v)));
      bindChips(el);
      el.querySelector('[data-ok]').onclick = () => {
        const actions = $$('[data-chips="act"] .chip.on', el).map(c => c.dataset.v);
        const reasons = el.querySelector('[name=why]').value.split('\n').map(x => x.trim()).filter(Boolean);
        if (!reasons.length) return toast('اكتب سببًا واحدًا على الأقل', 'bad');
        if (!actions.length) return toast('اختر إجراءً واحدًا على الأقل', 'bad');
        close({ reasons, actions, goal: el.querySelector('[name=goal]').value.trim(), days: +el.querySelector('[name=days]').value });
      };
    }
  });
  if (!res) return null;
  const rec = existing ? { ...existing, ...res } : { id: uid(), studentId: sid, classId: s.classId, date: ymd(), status: 'open', followups: [], result: '', at: new Date().toISOString(), ...res };
  await DB.put('remedial', rec); if (!existing) logUse('remedy');
  toast(existing ? 'حُفظت الخطة' : `${ic('aid')} اعتُمدت الخطة العلاجية`, 'ok');
  return rec;
}
Screens.remedial = async (v, p) => {
  const tab = p.tab || 'cand';
  const D = await Follow.load();
  const plans = (await DB.all('remedial')).filter(r => App.stu[r.studentId]).sort((a, b) => b.date.localeCompare(a.date));
  const open = plans.filter(r => r.status === 'open'), done = plans.filter(r => r.status === 'done');
  const cand = tab === 'cand' ? await Remedy.candidates(D) : [];
  const due = r => ymd(addDays(parseYmd(r.date), r.days || 14));
  const planCard = r => { const s = App.stu[r.studentId]; const late = r.status === 'open' && due(r) < ymd();
    return `<div class="fu-card rm-card ${r.status}"><div class="fu-h" data-open="${s.id}"><span class="av">${esc(initials(s.name))}</span><div class="grow"><b>${esc(s.name)}</b><small>${esc(App.className(s.classId))} · بدأت ${shortDate(r.date)}${r.status === 'open' ? ` · ${late ? '<span class="bad-t">انتهت المدة — سجّل النتيجة</span>' : `تنتهي ${shortDate(due(r))}`}` : ` · ${esc(r.result)}`}</small></div></div>
      <ul class="care-flags">${r.reasons.map(x => `<li>${ic('alert')} ${esc(x)}</li>`).join('')}</ul>
      <div class="rm-acts">${r.actions.map(a => `<span class="bdg">${esc(a)}</span>`).join('')}</div>
      ${r.goal ? `<p class="small"><b>الهدف:</b> ${esc(r.goal)}</p>` : ''}
      ${(r.followups || []).length ? `<ul class="rm-fu">${r.followups.map(f => `<li><small>${shortDate(f.date)}</small> ${esc(f.text)}</li>`).join('')}</ul>` : ''}
      ${r.status === 'open' ? `<div class="row gap"><button class="btn sm soft grow" data-fu="${r.id}">${ic('note')} متابعة</button><button class="btn sm wa grow" data-pm="${r.id}">${ic('wa')} ولي الأمر</button><button class="btn sm gold grow" data-end="${r.id}">${ic('check')} النتيجة</button></div>
        <button class="lnk" data-ed="${r.id}">${ic('edit')} تعديل الخطة</button>` : ''}</div>`; };
  v.innerHTML = topbar('الخطة العلاجية') + `<div class="page"><div class="no-print">
    <div class="stars-hero navy">${ic('aid')}<div><b>خطط علاجية فردية</b><small>يرصد فصلي المتعثرين تلقائيًا (غياب، تقصير، درجات منخفضة، تراجع المشاركة) — وكل خطة شاهد في ملف الأداء</small></div></div>
    <div class="seg small no-print"><button data-t="cand" class="${tab === 'cand' ? 'on' : ''}">مرشحون</button><button data-t="open" class="${tab === 'open' ? 'on' : ''}">قائمة (${open.length})</button><button data-t="done" class="${tab === 'done' ? 'on' : ''}">منجزة (${done.length})</button></div>
    ${tab === 'cand' ? (cand.length ? `<p class="hint">${ic('pulse')} طلاب تظهر عليهم مؤشرات تعثر ولا توجد لهم خطة حالية.</p>` + cand.map(x => `<div class="fu-card care"><div class="fu-h" data-open="${x.sid}"><span class="av">${esc(initials(App.stu[x.sid].name))}</span><div class="grow"><b>${esc(App.stu[x.sid].name)}</b><small>${esc(App.className(App.stu[x.sid].classId))}</small></div><span class="count-b ${x.reasons.length >= 2 ? 'hot' : ''}">${x.reasons.length}</span></div>
        <ul class="care-flags">${x.reasons.map(t => `<li>${ic('alert')} ${esc(t)}</li>`).join('')}</ul><button class="btn sm primary block" data-new="${x.sid}">${ic('aid')} ضع خطة علاجية</button></div>`).join('')
      : `<div class="empty">${ic('check')}<h3>لا يوجد طلاب متعثرون الآن 👏</h3><p>يمكنك وضع خطة لأي طالب من ملفه.</p></div>`) : ''}
    ${tab === 'open' ? (open.length ? open.map(planCard).join('') : `<div class="empty">${ic('aid')}<h3>لا خطط قائمة</h3><p>ابدأ من تبويب «مرشحون».</p></div>`) : ''}
    ${tab === 'done' ? (done.length ? `<div class="rep-tiles">${REMEDY_RESULTS.map(x => `<div><b>${done.filter(r => r.result === x).length}</b><small>${x}</small></div>`).join('')}</div>` + done.map(planCard).join('') : `<div class="empty">${ic('aid')}<h3>لا خطط منجزة بعد</h3></div>`) : ''}</div>
    ${plans.length ? `<div class="print-area rm-print"><div class="rep-head"><img src="img/logo.png" alt=""><div><h2>سجل الخطط العلاجية</h2><p>${esc(App.S.teacherName)} · ${esc(App.S.subject)} · ${esc(App.S.school)} · ${hijri(new Date())}</p></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>م</th><th>الطالب</th><th>الفصل</th><th>التشخيص</th><th>الإجراءات</th><th>البداية</th><th>النتيجة</th></tr></thead><tbody>${plans.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(App.stu[r.studentId].name)}</td><td>${esc(App.className(r.classId))}</td><td>${esc(r.reasons.join('، '))}</td><td>${esc(r.actions.join('، '))}</td><td>${shortDate(r.date)}</td><td>${esc(r.result || 'قائمة')}</td></tr>`).join('')}</tbody></table></div>
      <div class="rep-sign"><span>المعلم: ${esc(App.S.teacherName)}</span><span>التوقيع: ..................</span></div></div>
      <button class="btn soft block no-print" data-print>${ic('print')} طباعة سجل الخطط (PDF)</button>` : ''}</div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-t]', v).forEach(b => b.onclick = () => setP({ tab: b.dataset.t }));
  $$('[data-open]', v).forEach(b => b.onclick = () => App.go('student', { id: b.dataset.open }));
  $$('[data-new]', v).forEach(b => b.onclick = async () => { const x = cand.find(c => c.sid === b.dataset.new); if (await remedySheet(x.sid, { reasons: x.reasons })) setP({ tab: 'open' }); });
  const get = id => plans.find(r => r.id === id);
  $$('[data-ed]', v).forEach(b => b.onclick = async () => { const r = get(b.dataset.ed); if (await remedySheet(r.studentId, {}, r)) App.render(); });
  $$('[data-fu]', v).forEach(b => b.onclick = async () => {
    const t = await sheet(`<label class="fld"><span>ما الذي لاحظته؟</span><div class="voice-fld"><textarea name="t" rows="3" placeholder="مثال: سلّم واجبين هذا الأسبوع وشارك في الدرس"></textarea>${micBtn('[name=t]')}</div></label><button class="btn primary block" data-ok>حفظ</button>`,
      { title: 'متابعة الخطة', onMount: (el, close) => { bindMic(el); el.querySelector('[data-ok]').onclick = () => close(el.querySelector('[name=t]').value.trim()); } });
    if (!t) return; const r = get(b.dataset.fu); await DB.put('remedial', { ...r, followups: [...(r.followups || []), { date: ymd(), text: t }] }); App.render();
  });
  $$('[data-pm]', v).forEach(b => b.onclick = async () => {
    const r = get(b.dataset.pm), s = App.stu[r.studentId];
    const m = await sheet(`<label class="fld"><span>نص الرسالة (يمكنك تعديله)</span><textarea name="m" rows="12">${esc(Remedy.parentMsg(r))}</textarea></label><button class="btn wa block" data-ok>${ic('wa')} إرسال واتساب</button>`,
      { title: 'رسالة لولي الأمر', onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => close(el.querySelector('[name=m]').value) });
    if (!m) return;
    Native.open(`https://wa.me/${phoneIntl(s.guardianPhone)}?text=${encodeURIComponent(m)}`);
    await DB.put('contacts', { id: uid(), studentId: s.id, classId: s.classId, date: ymd(), with: 'ولي الأمر', channel: 'واتساب', reason: 'خطة علاجية: ' + r.reasons[0], result: 'أُرسلت', at: new Date().toISOString() });
    await DB.put('remedial', { ...r, followups: [...(r.followups || []), { date: ymd(), text: 'أُبلغ ولي الأمر بالخطة عبر واتساب' }] }); setTimeout(() => App.render(), 400);
  });
  $$('[data-end]', v).forEach(b => b.onclick = async () => {
    const res = await choose('نتيجة الخطة العلاجية', REMEDY_RESULTS.map((x, i) => ({ value: x, label: x, icon: ['🌟', '📈', '⏳'][i] })));
    if (!res) return; const r = get(b.dataset.end);
    await DB.put('remedial', { ...r, status: 'done', result: res, endDate: ymd() });
    if (res !== 'لم يتحسن بعد') toast('أحسنت! 👏 تُحسب الخطة في «تحسين نتائج المتعلمين»', 'ok');
    setP({ tab: 'done' });
  });
  v.querySelector('[data-print]')?.addEventListener('click', () => Native.print('سجل الخطط العلاجية'));
};

/* ================= 5) التقرير الشهري لكل طالب ================= */
function monthlyData(sid, D, grades, from, to) {
  const inR = x => x.studentId === sid && x.date >= from && x.date <= to;
  const att = D.att.filter(inR), pts = D.pts.filter(inR), hw = D.hw.filter(inR), notes = D.notes.filter(inR);
  const c = k => att.filter(a => a.status === k).length;
  const present = c('present') + c('late');
  return {
    total: att.length, present, rate: att.length ? Math.round(present / att.length * 100) : null, absent: c('absent'), late: c('late'), escaped: c('escaped'),
    points: pts.reduce((a, b) => a + (b.value || 1), 0), part: pts.filter(x => x.type === 'participation').length,
    pos: [...new Set(pts.filter(x => x.type === 'positive').map(x => x.reason))].slice(0, 3), hw: hw.length, hwOpen: hw.filter(h => !h.resolved).length,
    notes: notes.filter(n => n.kind === 'سلوكية').length, grades: grades.filter(inR).slice(-4)
  };
}
function monthlyComment(m) {
  if (!m.total) return 'لم تُسجّل حصص في هذه الفترة.';
  const good = (m.rate ?? 0) >= 95 && !m.hwOpen && !m.notes && m.points >= 3;
  if (good) return 'أداء متميز ومشاركة فاعلة والتزام بالواجبات — نفخر به ونتمنى له دوام التفوق.';
  const p = [];
  if (m.absent >= 2) p.push('الانتظام في الحضور');
  if (m.hwOpen) p.push('حل الواجبات وتسليمها في وقتها');
  if (m.points < 2) p.push('المشاركة في الدرس');
  if (m.notes) p.push('الالتزام بالسلوك الصفي');
  return p.length ? `يحتاج إلى مزيد من الاهتمام في: ${p.join('، ')} — ونأمل متابعتكم معنا.` : 'أداء جيد، ونتطلع لمزيد من التميز.';
}
async function drawMonthly(s, m, from, to, comment) {
  try { await document.fonts.ready; } catch (e) { }
  const W = 1240, H = 1754, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.direction = 'rtl';
  const F = (w, z) => `${w} ${z}px FasliNaskh, 'Noto Naskh Arabic', serif`;
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  x.fillStyle = '#FBF8F1'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 330); g.addColorStop(0, '#223F86'); g.addColorStop(1, '#0B1F4D'); x.fillStyle = g; x.fillRect(0, 0, W, 330);
  x.fillStyle = '#D9A33A'; x.fillRect(0, 330, W, 8);
  // بلا شعار التطبيق حتى إطلاقه رسميًا (بطلب المعلم)
  x.textAlign = 'right'; x.fillStyle = '#F6D27A'; x.font = F(700, 30); x.fillText(App.S.school || '', W - 80, 100);
  x.fillStyle = '#fff'; x.font = F(700, 60); x.fillText('تقرير الأداء الشهري', W - 80, 175);
  x.fillStyle = '#C9D3EC'; x.font = F(600, 26); x.fillText(`مادة ${App.S.subject} · ${hijri(parseYmd(from))} — ${hijri(parseYmd(to))}`, W - 80, 230);
  // الطالب
  x.textAlign = 'right'; x.fillStyle = '#0B1F4D'; x.font = F(700, 52); x.fillText(s.name, W - 80, 440);
  x.fillStyle = '#7A6A4A'; x.font = F(600, 30); x.fillText(App.cls[s.classId]?.full || App.className(s.classId), W - 80, 495);
  // البطاقات
  const tiles = [['نسبة الحضور', m.rate === null ? '—' : m.rate + '%', '#16316E'], ['نقاط المشاركة', m.points, '#B0801C'], ['الغياب', m.absent, '#B3261E'], ['التأخر', m.late, '#9A5B00'], ['تقصير الواجبات', m.hw, '#5B3FA8'], ['ملاحظات سلوكية', m.notes, '#3A4A52']];
  const tw = (W - 160 - 2 * 30) / 3, th = 170;
  tiles.forEach(([l, val, col], i) => {
    const cx = W - 80 - (i % 3) * (tw + 30) - tw, cy = 560 + Math.floor(i / 3) * (th + 30);
    x.fillStyle = '#fff'; rr(cx, cy, tw, th, 26); x.fill(); x.strokeStyle = '#EADFC6'; x.lineWidth = 2; x.stroke();
    x.fillStyle = col; rr(cx + tw - 14, cy + 30, 6, th - 60, 3); x.fill();
    x.textAlign = 'center'; x.fillStyle = col; x.font = F(700, 64); x.fillText(String(val), cx + tw / 2, cy + 100);
    x.fillStyle = '#5A6470'; x.font = F(600, 27); x.fillText(l, cx + tw / 2, cy + 145);
  });
  let y = 980;
  const section = (t) => { x.textAlign = 'right'; x.fillStyle = '#16316E'; x.font = F(700, 34); x.fillText(t, W - 80, y); x.fillStyle = '#D9A33A'; x.fillRect(W - 80 - x.measureText(t).width, y + 14, x.measureText(t).width, 4); y += 66; };
  const line = (t, col = '#2C3A44') => { x.textAlign = 'right'; x.fillStyle = col; x.font = F(600, 29); x.fillText(t, W - 100, y); y += 50; };
  const badges = studentBadges(s.id, await Follow.load());
  if (m.pos.length || badges.length) { section('مواطن التميّز'); if (m.pos.length) line('• ' + m.pos.join('، ')); if (badges.length) line('• الأوسمة: ' + badges.map(b => b.name).join('، '), '#8A6214'); y += 10; }
  if (m.grades.length) { section('الدرجات'); m.grades.forEach(gr => line(`• ${gr.title || 'اختبار'}: ${gr.score}${gr.max ? ' من ' + gr.max : ''}`)); y += 10; }
  section('رأي المعلم');
  x.font = F(600, 30); const words = comment.split(' '); let ln = '';
  words.forEach(w => { const t = ln ? ln + ' ' + w : w; if (x.measureText(t).width > W - 200) { line(ln); ln = w; } else ln = t; }); if (ln) line(ln);
  // التذييل
  x.fillStyle = '#0B1F4D'; x.fillRect(0, H - 150, W, 150); x.fillStyle = '#D9A33A'; x.fillRect(0, H - 150, W, 6);
  x.textAlign = 'right'; x.fillStyle = '#fff'; x.font = F(700, 32); x.fillText(`معلم المادة: ${App.S.teacherName}`, W - 80, H - 70);
  x.textAlign = 'left'; x.fillStyle = '#C9D3EC'; x.font = F(600, 26); x.fillText(hijri(new Date()), 80, H - 70);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
const monthRange = off => periodRange('month', new Date(new Date().getFullYear(), new Date().getMonth() - off, 1));
async function monthlySheet(sid, off = 0, onSent) {
  const s = App.stu[sid];
  const [from, to] = monthRange(off);
  const D = await Follow.load(); const grades = await DB.all('grades');
  const m = monthlyData(sid, D, grades, from, to);
  return sheet(`<div class="who">${ic('cal')} <b>${esc(s.name)}</b><small>${esc(App.className(s.classId))} · ${shortDate(from)} — ${shortDate(to)}</small></div>
    <label class="fld"><span>رأي المعلم (يظهر في التقرير)</span><textarea name="c" rows="3">${esc(monthlyComment(m))}</textarea></label>
    <div class="cert-prev mr-prev"><img alt="معاينة التقرير"></div>
    <div class="row gap"><button class="btn wa grow" data-share>${ic('share')} مشاركة الصورة (واتساب)</button><button class="btn soft" data-save>${ic('download')} حفظ</button></div>
    <button class="btn ghost block" data-txt>${ic('wa')} إرسال ملخص نصي لولي الأمر</button>`, {
    title: 'التقرير الشهري', onMount: async (el) => {
      let blob;
      const render = async () => { blob = await drawMonthly(s, m, from, to, el.querySelector('[name=c]').value.trim() || monthlyComment(m)); el.querySelector('.mr-prev img').src = URL.createObjectURL(blob); };
      await render(); el.querySelector('[name=c]').onchange = render;
      const fname = `تقرير-شهري-${shortName(s.name)}.png`;
      const log = async (ch) => {
        await DB.put('contacts', { id: uid(), studentId: sid, classId: s.classId, date: ymd(), with: 'ولي الأمر', channel: ch, reason: 'التقرير الشهري', result: 'أُرسل', at: new Date().toISOString() });
        const all = { ...(App.S.monthlySent || {}) }; all[from] = [...new Set([...(all[from] || []), sid])]; Object.keys(all).sort().slice(0, -4).forEach(k => delete all[k]);
        await App.set('monthlySent', all); logUse('monthly'); onSent?.();
      };
      el.querySelector('[data-share]').onclick = async () => { await Native.shareFile(fname, blob, 'image/png'); await log('واتساب'); };
      el.querySelector('[data-save]').onclick = () => Native.saveFile(fname, blob, 'image/png');
      el.querySelector('[data-txt]').onclick = async () => {
        const t = `السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب/ ${s.name} المحترم\n\nملخص أداء ابنكم في مادة ${App.S.subject} للفترة من ${hijri(parseYmd(from))} إلى ${hijri(parseYmd(to))}:\n✅ الحضور: ${m.rate === null ? 'لا توجد حصص مسجلة' : `${m.rate}% (${m.present} من ${m.total})`}${m.absent ? ` · غياب ${m.absent}` : ''}${m.late ? ` · تأخر ${m.late}` : ''}\n⭐ المشاركة: ${m.points} نقطة\n📚 الواجبات: ${m.hw ? `${m.hw} تقصير` : 'ملتزم'}\n${m.grades.length ? `📝 الدرجات: ${m.grades.map(g => `${g.title || 'اختبار'} ${g.score}${g.max ? '/' + g.max : ''}`).join('، ')}\n` : ''}\n${el.querySelector('[name=c]').value.trim()}\n\nمعلم ابنكم/ ${App.S.teacherName}\n${App.S.school}`;
        Native.open(`https://wa.me/${phoneIntl(s.guardianPhone)}?text=${encodeURIComponent(t)}`); await log('واتساب');
      };
    }
  });
}
Screens.monthly = async (v, p) => {
  const off = p.off || 0;
  const [from, to] = monthRange(off);
  const cid = p.classId || App._lastClass && App._lastClass !== 'all' && App._lastClass || App.classes.find(c => App.classStudents(c.id).length)?.id;
  const D = await Follow.load(); const grades = await DB.all('grades');
  const sent = new Set(((App.S.monthlySent || {})[from]) || []);
  const studs = App.classStudents(cid);
  const sentN = studs.filter(s => sent.has(s.id)).length;
  v.innerHTML = topbar('التقرير الشهري') + `<div class="page">
    <div class="stars-hero">${ic('cal')}<div><b>تقرير شهري أنيق لكل طالب</b><small>${shortDate(from)} — ${shortDate(to)} · صورة جاهزة بالحضور والمشاركة والواجبات والدرجات ورأي المعلم</small></div></div>
    <div class="seg small"><button data-off="1" class="${off === 1 ? 'on' : ''}">الشهر الماضي</button><button data-off="0" class="${off === 0 ? 'on' : ''}">هذا الشهر</button></div>
    <div class="class-chips">${App.classes.filter(c => App.classStudents(c.id).length).map(c => `<button class="chip ${c.id === cid ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <div class="wk-prog"><div><b>${sentN}</b> من ${studs.length} أُرسلت</div><i style="width:${studs.length ? sentN / studs.length * 100 : 0}%"></i></div>
    ${studs.length && sentN < studs.length ? `<button class="btn wa block" data-next>${ic('send')} التقرير التالي (${esc(shortName(studs.find(s => !sent.has(s.id))?.name || ''))})</button>` : ''}
    <div class="wk-list">${studs.map(s => { const m = monthlyData(s.id, D, grades, from, to); return `<div class="wk-row ${sent.has(s.id) ? 'sent' : ''}">
      <div class="grow" data-r="${s.id}"><b>${esc(s.name)}</b><small>${m.total ? `حضور ${m.rate}%` : 'بلا حصص'} · ⭐${m.points}${m.hw ? ` · 📚${m.hw}` : ''}${m.absent ? ` · غ${m.absent}` : ''}</small></div>
      ${sent.has(s.id) ? `<span class="wk-ok">${ic('check')}</span>` : ''}<button class="icon-btn round" data-r="${s.id}" aria-label="التقرير">${ic('cal')}</button></div>`; }).join('')}</div></div>`;
  bindBack(v);
  const setP = x => { App.stack[App.stack.length - 1].params = { ...p, ...x }; App.render(); };
  $$('[data-off]', v).forEach(b => b.onclick = () => setP({ off: +b.dataset.off }));
  $$('[data-c]', v).forEach(b => b.onclick = () => setP({ classId: b.dataset.c }));
  const open = sid => monthlySheet(sid, off, () => setTimeout(() => App.render(), 300));
  $$('[data-r]', v).forEach(b => b.onclick = () => open(b.dataset.r));
  v.querySelector('[data-next]')?.addEventListener('click', () => open(studs.find(x => !sent.has(x.id)).id));
};
