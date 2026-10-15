/* فصلي — نسخة الويب المؤقتة (الجوال والتابلت) حتى صدور التطبيق في المتاجر */
'use strict';

/* بطاقة الحماية في شاشة النسخ الاحتياطي: لا يوجد نسخ سحابي تلقائي في المتصفح */
const _cloudCardNative = cloudCardHtml;
cloudCardHtml = function () {
  if (Native.has()) return _cloudCardNative();
  const sh = App.S.lastCloudShare;
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
      <button class="choice" data-v="restore"><span class="choice-ic">${ic('upload')}</span><span><b>عندي نسخة احتياطية من فصلي</b><small>من تطبيق الأندرويد أو جهاز آخر: النسخ الاحتياطي ← مشاركة النسخة</small></span></button>
      <button class="choice" data-v="noor"><span class="choice-ic">${ic('users')}</span><span><b>أبدأ بملف طلاب نور</b><small>ملف Excel من نور بأسماء الطلاب وجوالات أولياء الأمور</small></span></button>
      <button class="choice" data-v="later"><span class="choice-ic">${ic('chev')}</span><span><b>لاحقًا</b><small>أستكشف التطبيق أولًا</small></span></button>
    </div>`, { title: 'البداية', onMount: (el, close) => el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      // فتح اختيار الملف مباشرة داخل اللمسة نفسها (شرط في Safari)
      if (b.dataset.v === 'noor') importStudents().then(() => App.render()).catch(e => toast(esc(e.message), 'bad'));
      close(b.dataset.v);
    }) });
  if (r === 'restore') {
    App.stack = []; App.go('backup');
    setTimeout(() => { const x = $('#view [data-restore]'); if (x) { x.scrollIntoView({ block: 'center' }); x.classList.add('pulse-hint'); } toast('اضغط «استعادة من نسخة» واختر ملف النسخة', 'ok'); }, 300);
  }
}

document.addEventListener('DOMContentLoaded', () => setTimeout(() => webWelcome().catch(console.warn), 2600));

/* النسخ التلقائي اليومي خاص بتطبيق الأندرويد؛ يُخفى في الويب ويغني عنه زر «حفظ نسخة الآن» */
const _backupScreen = Screens.backup;
Screens.backup = async v => { await _backupScreen(v); if (!Native.has()) v.querySelector('[data-auto]')?.closest('section')?.remove(); };
