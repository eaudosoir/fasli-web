/* فصلي — نسخة الويب للآيفون: التثبيت على الشاشة الرئيسية، العمل بدون إنترنت، حفظ الملفات */
'use strict';

const PWA = {
  ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches,

  init() {
    if (Native.has()) return; // داخل تطبيق الأندرويد لا حاجة لشيء من هذا
    document.documentElement.classList.toggle('is-ios', this.ios);
    document.documentElement.classList.toggle('is-standalone', this.standalone());

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) toast('وصل تحديث جديد لفصلي — أعد فتح التطبيق لتطبيقه', 'ok');
          });
        });
      }).catch(() => { });
    }

    // طلب حفظ دائم للبيانات حتى لا يمسحها المتصفح
    try { navigator.storage?.persist?.(); } catch (e) { }

    if (this.ios) this.patchFiles();
    setTimeout(() => this.installHint(), 2500);
  },

  /* في الآيفون: حفظ الملفات عبر قائمة المشاركة («حفظ في الملفات» أو واتساب أو البريد) */
  patchFiles() {
    const share = async (name, blob, mime) => {
      const f = new File([blob], name, { type: mime || blob.type });
      if (!navigator.canShare?.({ files: [f] })) return false;
      try { await navigator.share({ files: [f] }); return true; }
      catch (e) {
        if (e.name === 'AbortError') return true; // ألغى المعلم المشاركة
        // انتهت مهلة اللمسة أثناء تجهيز الملف: نطلب لمسة جديدة
        await sheet(`<div class="who">${ic('download')} <b>${esc(name)}</b><small>الملف جاهز</small></div>
          <button class="btn primary block" data-ok>${ic('download')} حفظ أو مشاركة الملف</button>
          <p class="muted small center">اختر «حفظ في الملفات» لحفظه في جوالك</p>`, {
          title: 'الملف جاهز', onMount: (el, close) => {
            el.querySelector('[data-ok]').onclick = async () => { try { await navigator.share({ files: [f] }); } catch (x) { } close(true); };
          }
        });
        return true;
      }
    };
    const save0 = Native.saveFile.bind(Native);
    Native.saveFile = async (name, blob, mime) => { if (!(await share(name, blob, mime))) return save0(name, blob, mime); };
    Native.shareFile = Native.saveFile;
  },

  /* إرشاد التثبيت على الشاشة الرئيسية (مرة كل ثلاثة أيام حتى يثبّته) */
  installHint() {
    if (!this.ios || this.standalone()) return;
    let last = 0; try { last = +localStorage.getItem('fasli-ios-hint') || 0; } catch (e) { }
    if (Date.now() - last < 3 * 864e5) return;
    try { localStorage.setItem('fasli-ios-hint', String(Date.now())); } catch (e) { }
    const shareIc = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-5px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;
    sheet(`<div class="center"><img src="img/apple-touch-icon.png" alt="" style="width:72px;height:72px;border-radius:18px;margin:4px auto 10px;display:block"></div>
      <p class="center"><b>ثبّت فصلي على شاشتك الرئيسية</b><br><span class="muted small">ليفتح مثل التطبيق تمامًا ويعمل بدون إنترنت</span></p>
      <ol class="ios-steps">
        <li>اضغط زر المشاركة ${shareIc} أسفل Safari</li>
        <li>اختر <b>«إضافة إلى الشاشة الرئيسية»</b></li>
        <li>اضغط <b>«إضافة»</b> ثم افتح فصلي من أيقونته</li>
      </ol>
      <p class="muted small center">افتح الرابط من Safari تحديدًا، فهذه الخطوة لا تظهر في المتصفحات الأخرى.</p>
      <button class="btn primary block" data-close>فهمت</button>`, { title: 'تثبيت التطبيق' });
  }
};

PWA.init();
