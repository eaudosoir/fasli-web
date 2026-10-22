/* فصلي — رسالة جماعية لأولياء أمور الفصل عبر واتساب (من أعلى شاشة الحصة وشاشة الطلاب)
   طريقتان: إلى قروب الفصل (يختار المعلم القروب من واتساب)، أو لكل ولي أمر على حدة باسم ابنه. */
'use strict';

const BC_KINDS = [
  { k: 'link', t: 'تعبئة رابط' },
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
    link: 'الله يجزاك خير، كرمًا تعبّي الرابط هذا، ضروري الليلة:\n',
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
function bcCompose(body, name, plain = App.S.bcPlain) {
  if (plain) return String(body || '').replace(/\uFFFD/g, '').trim(); // النص كما كتبه المعلم بلا تحية ولا توقيع
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
    <span class="lbl">نوع الرسالة</span><div class="chips" data-chips="k">${BC_KINDS.map((x, i) => `<button type="button" class="chip ${x.k === 'general' ? 'on' : ''}" data-v="${x.k}">${x.t}</button>`).join('')}</div>
    <label class="fld"><span>نص الرسالة</span><div class="voice-fld"><textarea name="body" rows="5" placeholder="اكتب رسالتك لأولياء أمور ${esc(cname)}…"></textarea>${micBtn('[name=body]')}</div></label>
    <label class="switch"><input type="checkbox" name="plain" ${App.S.bcPlain ? 'checked' : ''}><span></span> النص فقط كما كتبته (بدون تحية واسم الطالب والتوقيع)</label>
    <label class="switch bc-sig-sw"><input type="checkbox" name="sig" ${App.S.sigOn === true ? 'checked' : ''}><span></span> إرفاق توقيعي المصوّر <img class="bc-sig-th" data-sigth alt=""></label>
    <details class="bc-prev"><summary>معاينة الرسالة</summary><div class="bc-msg" data-prev></div></details>
    <div class="bc-ways">
      <button class="btn wa block" data-way="group">${ic('users')} إرسال دفعة واحدة<small>تختار في واتساب قروب ${esc(cname)} أو «قائمة البث» فتصل للجميع</small></button>
      ${withPh.length ? `<button class="btn ghost block" data-way="vcf">${ic('download')} أرقام أولياء أمور ${esc(cname)} لجهات الاتصال<small>مرة واحدة لإنشاء «قائمة بث» للفصل في واتساب</small></button>` : ''}
      <button class="btn soft block" data-way="each" ${withPh.length ? '' : 'disabled'}>${ic('send')} لكل ولي أمر باسم ابنه<small>${withPh.length ? `${arNum(withPh.length)} ولي أمر — رسالة لكل واحد` : 'لا توجد أرقام — استورد ملف نور'}</small></button>
    </div>`, {
    title: 'رسالة جماعية', onMount: (el, close) => {
      bindChips(el); bindMic(el);
      const ta = el.querySelector('[name=body]'), prev = el.querySelector('[data-prev]');
      const pl = el.querySelector('[name=plain]');
      const upd = () => { prev.textContent = fixLinks(bcCompose(ta.value || '…', '', pl.checked)); };
      pl.onchange = () => { App.set('bcPlain', pl.checked); upd(); };
      const setK = k => { ta.value = bcText(k, cid); upd(); };
      $$('[data-chips="k"] .chip', el).forEach(c => c.addEventListener('click', () => setTimeout(() => setK(chipVal(el, 'k')), 0)));
      ta.oninput = upd; upd();
      const sw = el.querySelector('[name=sig]'), th = el.querySelector('[data-sigth]');
      let sigFile = null; Sig.file().then(f => { sigFile = f; th.src = URL.createObjectURL(f); }).catch(() => { });
      sw.onchange = () => App.set('sigOn', sw.checked);
      $$('[data-way]', el).forEach(b => b.onclick = () => {
        if (b.dataset.way === 'vcf') return bcVcf(cid, withPh);
        const body = ta.value.trim();
        if (!body) { ta.focus(); return toast('اكتب نص الرسالة', 'bad'); }
        const kind = BC_KINDS.find(x => x.k === chipVal(el, 'k'))?.t || 'عامة';
        const useSig = sw.checked && sigFile;
        if (b.dataset.way === 'group') {
          const text = fixLinks(bcCompose(body, ''));
          if (useSig) Sig.sendGroup(text, sigFile); // داخل اللمسة نفسها (مشاركة الصورة مع النص)
          else Native.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
        }
        close({ way: b.dataset.way, body, kind, sig: useSig ? sigFile : null });
      });
    }
  });
  if (!r) return;
  if (r.way === 'group') { await App.set('lastBroadcast', { cid, at: new Date().toISOString(), kind: r.kind }); if (!r.sig) toast(`اختر قروب ${esc(cname)} في واتساب ثم أرسل`, 'ok'); return; }
  return bcEach(cid, r, withPh);
}

/* لكل ولي أمر: قائمة بأزرار، كل ضغطة تفتح واتساب برسالة باسم الطالب وتُسجَّل في سجل التواصل */
async function bcEach(cid, r, list) {
  const sent = new Set();
  await sheet(`<div class="who">${ic('send')} <b>${esc(App.className(cid))} — ${esc(r.kind)}</b><small data-bc-cnt>أُرسلت ٠ من ${arNum(list.length)}</small></div>
    <p class="muted small">اضغط «إرسال» لكل طالب: يفتح واتساب برسالة باسمه، أرسلها ثم ارجع لفصلي وأكمل التالي.</p>
    ${r.sig ? (Sig.desktop() ? `<p class="bc-sig-note">${ic('info')} التوقيع المصوّر منسوخ: في كل محادثة اضغط <b>Ctrl+V</b> قبل الإرسال فتُرفق الصورة.</p>` : `<p class="bc-sig-note">${ic('info')} في الجوال لا يمكن إرفاق صورة برسالة موجهة لرقم محدد؛ التوقيع المصوّر يُرفق في «إرسال دفعة واحدة».</p>`) : ''}
    <div class="bc-list">${list.map((s, i) => `<div class="bc-row" data-i="${i}"><span class="bc-n">${arNum(i + 1)}</span><b class="grow">${esc(s.name)}</b><button class="btn sm wa" data-send="${i}">${ic('wa')} إرسال</button></div>`).join('')}</div>`, {
    title: 'إرسال لكل ولي أمر', wide: true, onMount: (el) => {
      const cnt = el.querySelector('[data-bc-cnt]');
      $$('[data-send]', el).forEach(b => b.onclick = async () => {
        const i = +b.dataset.send, s = list[i];
        if (r.sig && Sig.desktop() && !sent.size) Sig.copy(r.sig);
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

/* ملف جهات اتصال (vcf) بأرقام أولياء أمور الفصل: يُستورد في الجوال ثم تُنشأ منه «قائمة بث» في واتساب
   (رسالة واحدة تصل لكل ولي أمر على حدة؛ يشترط واتساب أن يكون رقم المعلم محفوظًا عندهم) */
function bcVcf(cid, list) {
  const cname = App.className(cid);
  const v = list.map(s => ['BEGIN:VCARD', 'VERSION:3.0', `FN:ولي أمر ${s.name} - ${cname}`, `N:ولي أمر ${s.name} - ${cname};;;;`, `ORG:${App.S.school || ''}`, `TEL;TYPE=CELL:+${phoneIntl(s.guardianPhone)}`, 'END:VCARD'].join('\r\n')).join('\r\n');
  Native.saveFile(`أولياء-أمور-${cname.replace(/\s+/g, '-')}.vcf`, new Blob([v], { type: 'text/vcard' }), 'text/vcard');
  sheet(`<div class="who">${ic('users')} <b>قائمة بث لفصل ${esc(cname)}</b><small>${arNum(list.length)} ولي أمر</small></div>
    <ol class="ios-steps">
      <li>افتح الملف الذي حُفظ في الجوال واختر «إضافة/استيراد» إلى جهات الاتصال</li>
      <li>في واتساب: النقاط الثلاث ← <b>«بث جديد»</b> (في الآيفون: الدردشات ← قوائم البث)</li>
      <li>اختر أولياء أمور ${esc(cname)} (اكتب «${esc(cname)}» في البحث) وسمّها «${esc(cname)}»</li>
    </ol>
    <p class="muted small">بعدها اضغط «إرسال دفعة واحدة» واختر قائمة البث: تصل الرسالة لكل ولي أمر في محادثته الخاصة. يشترط واتساب أن يكون رقمك محفوظًا عند ولي الأمر، وإلا فالأنسب قروب الفصل.</p>
    <button class="btn primary block" data-close>فهمت</button>`, { title: 'إرسال لأولياء الأمور دفعة واحدة' });
}

/* ===== التوقيع المصوّر =====
   صورة يرفعها المعلم، أو بطاقة جاهزة تُرسم من بياناته (الاسم، المادة، المدرسة) بخط النسخ.
   واتساب لا يقبل الصور عبر الروابط، لذلك تُرسل الصورة مع النص بقائمة المشاركة في الجوال،
   وفي الكمبيوتر تُنسخ الصورة ثم تُلصق (Ctrl+V) في المحادثة. */
const Sig = {
  desktop: () => !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  _cache: null,
  async file() {
    const key = (App.S.sigImg || '') + '|' + App.S.teacherName + App.S.subject + App.S.school;
    if (this._cache?.key === key) return this._cache.f;
    const blob = App.S.sigImg ? await (await fetch(App.S.sigImg)).blob() : await this.draw();
    const f = new File([blob], 'توقيع-المعلم.png', { type: blob.type || 'image/png' });
    this._cache = { key, f }; return f;
  },
  async draw() {
    const S = App.S, W = 1080, H = 400, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    try { await Promise.all(['700 60px "FasliNaskh"', '700 60px "Noto Naskh Arabic"', '400 30px "Noto Naskh Arabic"'].map(f => document.fonts.load(f))); } catch (e) { }
    const font = (w, s) => `${w} ${s}px "FasliNaskh", "Noto Naskh Arabic", serif`;
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0B1F4D'); bg.addColorStop(1, '#183A80');
    g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(0, 0, W, H, 36) : g.rect(0, 0, W, H); g.fill();
    g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.arc(W - 60, H + 40, 260, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#C9A227'; g.fillRect(W - 70, 70, 8, H - 140);
    g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = '#F3DC94'; g.font = font(400, 32); g.fillText('مع خالص التحية والتقدير', W - 100, 100);
    g.fillStyle = '#FFFFFF'; g.font = font(700, 66); g.fillText(S.teacherName || 'معلم المادة', W - 100, 185);
    g.fillStyle = '#DCE4F5'; g.font = font(700, 36); g.fillText(`معلم ${S.subject || 'المادة'}`, W - 100, 262);
    g.fillStyle = '#B9C6E4'; g.font = font(400, 32); g.fillText(S.school || '', W - 100, 318);
    // بلا أي شعار للتطبيق: التوقيع يحمل بيانات المعلم فقط
    return new Promise(ok => c.toBlob(ok, 'image/png'));
  },
  /* قروب الفصل: الصورة + النص معًا */
  sendGroup(text, file) {
    const data = { files: [file], text };
    if (!this.desktop() && navigator.canShare?.(data)) {
      navigator.share(data).catch(e => { if (e.name !== 'AbortError') Native.open(`https://wa.me/?text=${encodeURIComponent(text)}`); });
      return;
    }
    this.copy(file);
    Native.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
    toast('التوقيع المصوّر منسوخ: اختر القروب ثم اضغط Ctrl+V لإرفاقه قبل الإرسال', 'ok');
  },
  copy(file, quiet = false) {
    const fb = () => { if (!quiet) Native.saveFile(file.name, file, file.type); };
    try {
      if (navigator.clipboard?.write && window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ [file.type || 'image/png']: file })]).catch(fb);
    } catch (e) { }
    fb();
  },
  async upload() {
    const f = await pickFile('image/*'); if (!f) return false;
    const url = URL.createObjectURL(f);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; }).catch(() => null);
    if (!img) return toast('تعذر فتح الصورة', 'bad'), false;
    const k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    await App.set('sigImg', c.toDataURL(f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', .88));
    return true;
  }
};

/* إعدادات التوقيع المصوّر */
{
  const _set = Screens.settings;
  Screens.settings = async v => {
    await _set(v);
    v.querySelector('.page')?.insertAdjacentHTML('beforeend', `<section class="card"><div class="card-h"><h3>${ic('edit')} التوقيع المصوّر في رسائل واتساب</h3></div>
      <img class="sig-prev" data-sigprev alt="التوقيع">
      <label class="switch"><input type="checkbox" data-sigon ${App.S.sigOn === true ? 'checked' : ''}><span></span> إرفاقه في الرسائل الجماعية</label>
      <div class="row gap"><button class="btn soft grow" data-sigup>${ic('upload')} رفع صورة توقيعي</button>${App.S.sigImg ? `<button class="btn ghost grow" data-sigdef>التصميم الجاهز</button>` : ''}</div>
      <p class="muted small">التصميم الجاهز يُكتب من اسمك ومادتك ومدرستك في الإعدادات أعلاه.</p></section>`);
    Sig.file().then(f => { const im = v.querySelector('[data-sigprev]'); if (im) im.src = URL.createObjectURL(f); });
    v.querySelector('[data-sigon]').onchange = e => App.set('sigOn', e.target.checked);
    v.querySelector('[data-sigup]').onclick = async () => { if (await Sig.upload()) { toast('✓ حُفظ توقيعك', 'ok'); App.render(); } };
    v.querySelector('[data-sigdef]')?.addEventListener('click', async () => { await App.set('sigImg', ''); App.render(); });
  };
}
