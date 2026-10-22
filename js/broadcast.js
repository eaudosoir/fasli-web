/* فصلي — رسالة جماعية لأولياء أمور الفصل عبر واتساب (من أعلى شاشة الحصة وشاشة الطلاب)
   طريقتان: إلى قروب الفصل (يختار المعلم القروب من واتساب)، أو لكل ولي أمر على حدة باسم ابنه. */
'use strict';

const BC_KINDS = [
  { k: 'general', t: 'عامة' },
  { k: 'hw', t: 'تذكير بواجب' },
  { k: 'test', t: 'تذكير باختبار' },
  { k: 'lesson', t: 'درس الأسبوع' },
  { k: 'tools', t: 'أدوات مطلوبة' },
  { k: 'thanks', t: 'شكر وتقدير' }
];

function bcText(k, cid) {
  const les = (typeof Curr !== 'undefined' && Curr.lesson(cid)) || null, sub = App.S.subject || 'الدراسات الاجتماعية';
  return {
    general: '',
    hw: `نود تذكيركم بواجب مادة ${sub}: \nنأمل متابعة ابنكم في حله وإحضاره في الحصة القادمة.`,
    test: `نود إحاطتكم بموعد اختبار قصير في مادة ${sub} يوم ______ في درس: ${les?.title || '______'}.\nنأمل مساعدة ابنكم في المراجعة والاستعداد.`,
    lesson: `درس هذا الأسبوع في مادة ${sub}: ${les?.title || '______'}.\nنأمل مراجعته مع ابنكم وتشجيعه على المشاركة في الحصة.`,
    tools: `نأمل التأكد من إحضار ابنكم كتاب ${sub} والدفتر وأدوات الكتابة في كل حصة.`,
    thanks: `أشكر لكم متابعتكم واهتمامكم بأبنائكم، وأسعد بتعاونكم الدائم معي في مادة ${sub}.`
  }[k] || '';
}
/* تنظيف النص الملصوق: حذف التحية واسم الطالب المكررين (نضيفهما نحن باسم كل طالب)، وحذف الرموز التالفة */
function bcClean(body) {
  let lines = String(body || '').replace(/\uFFFD/g, '').split('\n');
  const head = l => /^\s*(السلام عليكم|ولي أمر الطالب|ولي امر الطالب|أولياء الأمور|اولياء الامور|أولياء أمور)/.test(l.replace(/^[^\p{L}]+/u, ''));
  // التحية قد تتكرر في أول النص أو بعد سطر عنوان مثل «*تنبيه عاجل*»
  for (let i = 0; i < Math.min(lines.length, 6); i++) if (head(lines[i])) { lines.splice(i, 1); i--; }
  return lines.join('\n').replace(/^\s*\n+/, '').replace(/\n{3,}/g, '\n\n').trim();
}
function bcCompose(body, name) {
  const S = App.S, b = bcClean(body);
  const signed = /معلمكم|معلم المادة|معلم الدراسات|معلم ال/.test(b.split('\n').slice(-3).join(' '));
  return `السلام عليكم ورحمة الله وبركاته\n${name ? `ولي أمر الطالب/ ${name} المحترم\n` : 'أولياء الأمور الكرام\n'}\n${b}${signed ? '' : `\n\nمعلم ${S.subject || 'المادة'}/ ${S.teacherName || ''}\n${S.school || ''}`}`;
}

/* أي رابط في رسالة واتساب: الأرقام العربية (٠-٩) داخل الرابط تُحوَّل إلى إنجليزية وإلا لا يعمل الرابط */
const fixLinks = s => String(s).replace(/(https?:\/\/|www\.)[^\s]+/gi, u => u.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\uFFFD/g, '');
{
  const open0 = Native.open.bind(Native);
  Native.open = url => {
    const m = String(url).match(/^(https:\/\/wa\.me\/\d*\/?\?text=)(.*)$/);
    if (m) { try { url = m[1] + encodeURIComponent(fixLinks(decodeURIComponent(m[2]))); } catch (e) { } }
    return open0(url);
  };
}

async function classBroadcast(cid) {
  const studs = App.classStudents(cid), withPh = studs.filter(s => phoneIntl(s.guardianPhone).length >= 11);
  const cname = App.className(cid);
  const r = await sheet(`<div class="who">${ic('wa')} <b>رسالة جماعية — ${esc(cname)}</b><small>${arNum(studs.length)} طالبًا · ${arNum(withPh.length)} لهم رقم ولي أمر</small></div>
    <span class="lbl">نوع الرسالة</span><div class="chips" data-chips="k">${BC_KINDS.map((x, i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-v="${x.k}">${x.t}</button>`).join('')}</div>
    <label class="fld"><span>نص الرسالة</span><div class="voice-fld"><textarea name="body" rows="5" placeholder="اكتب رسالتك لأولياء أمور ${esc(cname)}…"></textarea>${micBtn('[name=body]')}</div></label>
    <details class="bc-prev"><summary>معاينة الرسالة</summary><div class="bc-msg" data-prev></div></details>
    <div class="bc-ways">
      <button class="btn wa block" data-way="group">${ic('users')} إلى قروب الفصل<small>تختار قروب ${esc(cname)} من واتساب</small></button>
      <button class="btn soft block" data-way="each" ${withPh.length ? '' : 'disabled'}>${ic('send')} لكل ولي أمر باسم ابنه<small>${withPh.length ? `${arNum(withPh.length)} ولي أمر — رسالة لكل واحد` : 'لا توجد أرقام — استورد ملف نور'}</small></button>
    </div>`, {
    title: 'رسالة جماعية', onMount: (el, close) => {
      bindChips(el); bindMic(el);
      const ta = el.querySelector('[name=body]'), prev = el.querySelector('[data-prev]');
      const upd = () => { prev.textContent = fixLinks(bcCompose(ta.value || '…', '')); };
      const setK = k => { ta.value = bcText(k, cid); upd(); };
      $$('[data-chips="k"] .chip', el).forEach(c => c.addEventListener('click', () => setTimeout(() => setK(chipVal(el, 'k')), 0)));
      ta.oninput = upd; upd();
      $$('[data-way]', el).forEach(b => b.onclick = () => {
        const body = ta.value.trim();
        if (!body) { ta.focus(); return toast('اكتب نص الرسالة', 'bad'); }
        const kind = BC_KINDS.find(x => x.k === chipVal(el, 'k'))?.t || 'عامة';
        if (b.dataset.way === 'group') Native.open(`https://wa.me/?text=${encodeURIComponent(bcCompose(body, ''))}`); // داخل اللمسة نفسها
        close({ way: b.dataset.way, body, kind });
      });
    }
  });
  if (!r) return;
  if (r.way === 'group') { await App.set('lastBroadcast', { cid, at: new Date().toISOString(), kind: r.kind }); return toast(`اختر قروب ${esc(cname)} في واتساب ثم أرسل`, 'ok'); }
  return bcEach(cid, r, withPh);
}

/* لكل ولي أمر: قائمة بأزرار، كل ضغطة تفتح واتساب برسالة باسم الطالب وتُسجَّل في سجل التواصل */
async function bcEach(cid, r, list) {
  const sent = new Set();
  await sheet(`<div class="who">${ic('send')} <b>${esc(App.className(cid))} — ${esc(r.kind)}</b><small data-bc-cnt>أُرسلت ٠ من ${arNum(list.length)}</small></div>
    <p class="muted small">اضغط «إرسال» لكل طالب: يفتح واتساب برسالة باسمه، أرسلها ثم ارجع لفصلي وأكمل التالي.</p>
    <div class="bc-list">${list.map((s, i) => `<div class="bc-row" data-i="${i}"><span class="bc-n">${arNum(i + 1)}</span><b class="grow">${esc(s.name)}</b><button class="btn sm wa" data-send="${i}">${ic('wa')} إرسال</button></div>`).join('')}</div>`, {
    title: 'إرسال لكل ولي أمر', wide: true, onMount: (el) => {
      const cnt = el.querySelector('[data-bc-cnt]');
      $$('[data-send]', el).forEach(b => b.onclick = async () => {
        const i = +b.dataset.send, s = list[i];
        Native.open(`https://wa.me/${phoneIntl(s.guardianPhone)}?text=${encodeURIComponent(bcCompose(r.body, s.name))}`);
        if (!sent.has(s.id)) {
          sent.add(s.id);
          await DB.put('contacts', { id: uid(), studentId: s.id, classId: s.classId, date: ymd(), with: 'ولي الأمر', channel: 'واتساب', reason: `رسالة جماعية: ${r.kind}`, result: 'أُرسلت', at: new Date().toISOString() });
        }
        const row = b.closest('.bc-row'); row.classList.add('done'); b.innerHTML = `${ic('check')} أُرسلت`;
        cnt.textContent = `أُرسلت ${arNum(sent.size)} من ${arNum(list.length)}`;
        const next = el.querySelector('.bc-row:not(.done)'); next?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  });
  if (sent.size) toast(`${ic('check')} سُجّل التواصل مع ${arNum(sent.size)} ولي أمر`, 'ok');
}

/* زر في أعلى شاشة الحصة (بجانب اسم الفصل) */
{
  const _ses = Screens.session;
  Screens.session = async (v, p) => {
    await _ses(v, p);
    if (!p.classId || !App.cls[p.classId] || p.cover) return;
    const h = v.querySelector('.ses-head'); if (!h || v.querySelector('[data-bc]')) return;
    h.insertAdjacentHTML('afterend', `<button class="bc-bar sm" data-bc>${ic('wa')}<span class="grow"><b>رسالة جماعية لأولياء أمور ${esc(App.className(p.classId))}</b></span>${ic('chev')}</button>`);
    v.querySelector('[data-bc]').onclick = () => classBroadcast(p.classId);
  };
}
/* شريط في أعلى شاشة الطلاب عند اختيار فصل */
{
  const _st = Screens.students;
  Screens.students = async (v, p) => {
    await _st(v, p);
    const cid = p.classId ?? (App._lastClass || 'all');
    if (cid === 'all' || !App.cls[cid] || !App.classStudents(cid).length) return;
    v.querySelector('.class-chips')?.insertAdjacentHTML('afterend', `<button class="bc-bar" data-bc>${ic('wa')}<span class="grow"><b>رسالة جماعية لأولياء أمور ${esc(App.className(cid))}</b><small>إلى قروب الفصل أو لكل ولي أمر باسم ابنه</small></span>${ic('chev')}</button>`);
    v.querySelector('[data-bc]').onclick = () => classBroadcast(cid);
  };
}
