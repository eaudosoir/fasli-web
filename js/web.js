/* فصلي — نسخة الويب المؤقتة (الجوال والتابلت) حتى صدور التطبيق في المتاجر */
'use strict';

/* بطاقة الحماية في شاشة النسخ الاحتياطي: لا يوجد نسخ سحابي تلقائي في المتصفح */
const _cloudCardNative = cloudCardHtml;
cloudCardHtml = function () {
  if (Native.has()) return _cloudCardNative();
  const sh = App.S.lastCloudShare;
  if (typeof Sync !== 'undefined' && Sync.on()) {
    const st = Sync.status();
    return `<section class="card cloud-card"><div class="card-h"><h3>${ic('cloud')} حماية بياناتك</h3><span class="pill ${st.err ? 'bad' : 'ok'}">${st.err ? 'متوقفة' : 'متزامنة'}</span></div>
      <div class="cloud-row"><span>${ic('sync')}</span><div><b>محفوظة في حسابك وعلى كل أجهزتك</b><small dir="ltr" style="text-align:start">${esc(st.email)}</small></div></div>
      <div class="row gap"><button class="btn soft grow" data-go="sync">${ic('settings')} المزامنة</button><button class="btn gold grow" data-drive>${ic('download')} نسخة إضافية</button></div></section>`;
  }
  return `<section class="card cloud-card"><div class="card-h"><h3>${ic('cloud')} حماية بياناتك</h3><span class="pill ${sh && !Cloud.shareDue() ? 'ok' : 'bad'}">${sh && !Cloud.shareDue() ? 'محمية هذا الأسبوع' : 'تحتاج نسخة'}</span></div>
    <div class="cloud-row"><span>${ic('shield')}</span><div><b>البيانات محفوظة في هذا الجهاز فقط</b><small>لا تُرفع لأي خادم. لو حُذف المتصفح أو تغيّر الجهاز تضيع إن لم تحفظ نسخة.</small></div></div>
    <div class="cloud-row"><span>${ic('upload')}</span><div><b>نسخة أسبوعية إلى Google Drive أو «الملفات»</b><small>${sh ? `آخر نسخة: ${shortDate(sh.slice(0, 10))}` : 'لم تحفظ نسخة بعد'} — ومنها تنقل بياناتك إلى التطبيق الرسمي لاحقًا</small></div></div>
    <button class="btn gold block" data-drive>${ic('cloud')} حفظ نسخة الآن</button></section>`;
};

/* الترحيب عند أول فتح: نقل البيانات من تطبيق الأندرويد أو استيراد ملف نور */
async function webWelcome() {
  if (Native.has() || App.students.length) return;
  let seen = false; try { seen = localStorage.getItem('fasli-web-welcome') === '1'; } catch (e) { }
  if (seen) return;
  try { localStorage.setItem('fasli-web-welcome', '1'); } catch (e) { }
  const r = await sheet(`<div class="center"><img src="img/brand-navy.png" alt="فصلي" style="height:46px;margin:2px auto 8px;display:block"></div>
    <p class="center"><b>أهلًا بك في نسخة الويب من فصلي</b><br><span class="muted small">كل الشاشات والأدوات تعمل هنا، وبياناتك تُحفظ في جهازك فقط.</span></p>
    <div class="choice-list">
      ${typeof Sync !== 'undefined' && Sync.configured() ? `<button class="choice" data-v="sync"><span class="choice-ic">${ic('cloud')}</span><span><b>عندي حساب فصلي</b><small>سجّل دخولك فتنزل بياناتك من أجهزتك الأخرى</small></span></button>` : ''}
      <button class="choice" data-v="restore"><span class="choice-ic">${ic('upload')}</span><span><b>عندي نسخة احتياطية من فصلي</b><small>من تطبيق الأندرويد أو جهاز آخر: النسخ الاحتياطي ← مشاركة النسخة</small></span></button>
      <button class="choice" data-v="noor"><span class="choice-ic">${ic('users')}</span><span><b>أبدأ بملف طلاب نور</b><small>ملف Excel من نور بأسماء الطلاب وجوالات أولياء الأمور</small></span></button>
      <button class="choice" data-v="later"><span class="choice-ic">${ic('chev')}</span><span><b>لاحقًا</b><small>أستكشف التطبيق أولًا</small></span></button>
    </div>`, { title: 'البداية', onMount: (el, close) => el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      // فتح اختيار الملف مباشرة داخل اللمسة نفسها (شرط في Safari)
      if (b.dataset.v === 'noor') importStudents().then(() => App.render()).catch(e => toast(esc(e.message), 'bad'));
      close(b.dataset.v);
    }) });
  if (r === 'sync') { App.stack = []; App.go('sync'); return; }
  if (r === 'restore') {
    App.stack = []; App.go('backup');
    setTimeout(() => { const x = $('#view [data-restore]'); if (x) { x.scrollIntoView({ block: 'center' }); x.classList.add('pulse-hint'); } toast('اضغط «استعادة من نسخة» واختر ملف النسخة', 'ok'); }, 300);
  }
}

document.addEventListener('DOMContentLoaded', () => setTimeout(() => webWelcome().catch(console.warn), 2600));

/* النسخ التلقائي اليومي خاص بتطبيق الأندرويد؛ يُخفى في الويب ويغني عنه زر «حفظ نسخة الآن» */
const _backupScreen = Screens.backup;
Screens.backup = async v => { await _backupScreen(v); if (!Native.has()) v.querySelector('[data-auto]')?.closest('section')?.remove(); };

/* ===== واتساب على الكمبيوتر: بلا صفحة «دردشة على واتساب» الوسيطة =====
   في الجوال يفتح wa.me التطبيق مباشرة. في الكمبيوتر يفتح صفحة وسيطة كل مرة، فنحوّل الرابط
   إلى تطبيق واتساب للكمبيوتر (whatsapp://) أو إلى واتساب ويب في تبويب واحد يُعاد استخدامه. */
const WA = {
  desktop: () => !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  mode: () => App.S.waDesktop || '',
  parse(url) {
    const m = String(url).match(/^https:\/\/wa\.me\/(\d*)\/?(?:\?text=(.*))?$/);
    return m ? { phone: m[1] || '', text: m[2] || '' } : null;
  },
  build(x, mode) {
    const q = `${x.phone ? `phone=${x.phone}&` : ''}text=${x.text}`;
    return mode === 'app' ? `whatsapp://send?${q}` : `https://web.whatsapp.com/send?${q}`;
  },
  async choose() {
    const r = await choose('كيف تفتح واتساب على هذا الكمبيوتر؟', [
      { value: 'app', label: 'تطبيق واتساب للكمبيوتر', sub: 'يفتح المحادثة مباشرة في التطبيق المثبّت (أنصح به)', icon: ic('wa') },
      { value: 'web', label: 'واتساب ويب في المتصفح', sub: 'في تبويب واحد يُعاد استخدامه لكل رسالة', icon: ic('screen') }
    ]);
    if (r) { await App.set('waDesktop', r); toast(r === 'app' ? 'سيفتح تطبيق واتساب مباشرة — اضغط الزر مرة أخرى' : 'سيفتح واتساب ويب مباشرة — اضغط الزر مرة أخرى', 'ok'); }
    return r;
  }
};
{
  const open0 = Native.open.bind(Native);
  Native.open = url => {
    const x = !Native.has() && WA.desktop() ? WA.parse(url) : null;
    if (!x) return open0(url);
    const mode = WA.mode();
    if (!mode) { WA.choose(); return; } // نافذة الاختيار تفصل اللمسة، لذلك يُطلب الضغط مرة أخرى في أول مرة فقط
    if (mode === 'app') { location.href = WA.build(x, 'app'); return; }
    window.open(WA.build(x, 'web'), 'fasli-whatsapp');
  };
}
/* خيار في الإعدادات لتغيير الطريقة */
{
  const _set = Screens.settings;
  Screens.settings = async v => {
    await _set(v);
    if (Native.has() || !WA.desktop()) return;
    const m = WA.mode();
    v.querySelector('.page')?.insertAdjacentHTML('beforeend', `<section class="card"><div class="card-h"><h3>${ic('wa')} واتساب على الكمبيوتر</h3></div>
      <div class="chips" data-wa>${[['app', 'تطبيق واتساب للكمبيوتر'], ['web', 'واتساب ويب']].map(([k, t]) => `<button type="button" class="chip ${m === k ? 'on' : ''}" data-v="${k}">${t}</button>`).join('')}</div>
      <p class="muted small">تُفتح الرسائل مباشرة دون صفحة «دردشة على واتساب».</p></section>`);
    $$('[data-wa] .chip', v).forEach(c => c.onclick = async () => { await App.set('waDesktop', c.dataset.v); toast('✓ حُفظ', 'ok'); App.render(); });
  };
}
