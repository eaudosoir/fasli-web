/* فصلي — نسخة العرض: بيانات وهمية بالكامل لعرض التطبيق على فريق التقويم */
'use strict';

/* ===== مولّد أرقام ثابت (نفس البيانات في كل مرة) ===== */
function demoRng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

/* بعد التهيئة الأولى نضيف سجلات أسابيع سابقة ليظهر التطبيق «شغّالًا» */
const _demoSeedBase = seedIfEmpty;
seedIfEmpty = async function () {
  const fresh = !(await DB.getSetting('seeded', false));
  await _demoSeedBase();
  if (fresh) await demoFill();
};

async function demoFill() {
  const R = demoRng(1448);
  const pick = a => a[Math.floor(R() * a.length)];
  const studs = (await DB.all('students')).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const byC = {}; studs.forEach(s => (byC[s.classId] ||= []).push(s));
  const weak = new Set(), star = new Set();
  Object.values(byC).forEach(a => { [3, 12].forEach(i => a[i] && weak.add(a[i].id)); [1, 7, 16, 21].forEach(i => a[i] && star.add(a[i].id)); });

  const tt = (await DB.all('timetable')).filter(t => t.classId !== 'wait');
  const now = new Date(), days = []; const d = new Date(); d.setHours(12, 0, 0, 0);
  if (d.getDay() <= 4) days.push(new Date(d)); // اليوم: الحصص التي انتهت فقط
  while (days.length < 21) { d.setDate(d.getDate() - 1); if (d.getDay() <= 4) days.push(new Date(d)); }
  days.reverse();
  const ended = (day, period) => { if (ymd(day) !== ymd(now)) return true; const p = DEFAULT_BELL.periods.find(x => x.n === period); if (!p) return false; const [h, m] = p.end.split(':'); const e = new Date(now); e.setHours(+h, +m, 0, 0); return now > e; };
  const at = (day, period) => { const p = DEFAULT_BELL.periods.find(x => x.n === period) || DEFAULT_BELL.periods[0]; const [h, m] = p.start.split(':'); const x = new Date(day); x.setHours(+h, +m + 5, 0, 0); return x.toISOString(); };

  const O = { sessions: [], attendance: [], points: [], homework: [], notes: [], contacts: [], grades: [], remedial: [] };
  const quizNo = {};
  days.forEach((day, di) => {
    const date = ymd(day), old = di < days.length - 6;
    tt.filter(t => t.day === day.getDay() && ended(day, t.period)).forEach(t => {
      const list = byC[t.classId] || [], counts = { present: 0, absent: 0, late: 0, excused: 0, escaped: 0 }, here = [];
      list.forEach(s => {
        const r = R(), w = weak.has(s.id);
        const st = r < (w ? .14 : .025) ? 'absent' : r < (w ? .22 : .05) ? 'late' : r < (w ? .23 : .06) ? 'excused' : r < (w ? .24 : .062) ? 'escaped' : 'present';
        counts[st]++; if (st === 'present' || st === 'late') here.push(s);
        O.attendance.push({ id: `${date}|${t.period}|${s.id}`, date, period: t.period, classId: t.classId, studentId: s.id, status: st, at: at(day, t.period), history: [] });
      });
      O.sessions.push({ id: `${date}|${t.period}`, date, period: t.period, classId: t.classId, complete: true, completedAt: at(day, t.period), counts, cover: false, merged: [] });

      // المشاركة: المتميزون أكثر حضورًا في المشاركة
      const pool = here.filter(x => !weak.has(x.id) || R() < .35).sort(() => R() - .5);
      const n = 9 + Math.floor(R() * 5);
      pool.slice(0, n).concat(here.filter(x => star.has(x.id) && R() < .5)).forEach((s, i) =>
        O.points.push({ id: uid() + i, studentId: s.id, classId: t.classId, date, period: t.period, type: 'participation', reason: 'مشاركة في الدرس', value: 1, at: at(day, t.period) }));
      if (R() < .6) { const s = pick(here.filter(x => !weak.has(x.id))); if (s) O.points.push({ id: uid() + 'p', studentId: s.id, classId: t.classId, date, period: t.period, type: 'positive', reason: pick(DEFAULT_LISTS.positive), value: pick([1, 2, 3]), at: at(day, t.period) }); }

      // الواجبات
      here.forEach((s, i) => {
        if (R() < (weak.has(s.id) ? .3 : .035)) {
          const done = old && R() < .7, fol = !done && R() < .4;
          O.homework.push({ id: uid() + i, studentId: s.id, classId: t.classId, date, period: t.period, kind: pick(DEFAULT_LISTS.homeworkKinds.slice(0, 4)), note: '', resolved: done, status: done ? 'done' : fol ? 'follow' : 'open', resolution: done ? 'أكمل الواجب' : undefined, at: at(day, t.period) });
        }
      });

      // ملاحظات سلوكية وتعليمية
      if (R() < .16 && here.length) {
        const s = R() < .55 ? (here.find(x => weak.has(x.id)) || pick(here)) : pick(here);
        const neg = pick(DEFAULT_LISTS.negative.slice(0, 9)), done = old && R() < .6;
        O.notes.push({ id: uid() + 'n', studentId: s.id, classId: t.classId, date, period: t.period, kind: 'سلوكية', importance: neg.includes('الثانية') ? 'mid' : 'low', text: neg.replace(/^الدرجة [^:]+:\s*/, ''), degree: neg.match(/^الدرجة [^:]+/)[0], needsContact: R() < .4, referTo: '', action: done ? 'تنبيه شفهي وتوجيه' : '', resolved: done, status: done ? 'done' : 'open', at: at(day, t.period) });
      }

      // اختبار قصير في الأسبوع الثاني والرابع
      const wk = Math.floor(di / 5);
      if ((wk === 1 || wk === 3) && !(quizNo[t.classId + wk])) {
        quizNo[t.classId + wk] = 1;
        list.forEach((s, i) => {
          const sc = weak.has(s.id) ? 2 + Math.floor(R() * 3) : star.has(s.id) ? 9 + Math.floor(R() * 2) : 6 + Math.floor(R() * 5);
          O.grades.push({ id: uid() + 'g' + i, studentId: s.id, classId: t.classId, date, title: `اختبار قصير ${wk === 1 ? 1 : 2}`, score: Math.min(10, sc), max: 10, at: at(day, t.period) });
        });
      }
    });
  });

  // تواصل مع أولياء الأمور
  [...weak].slice(0, 10).forEach((sid, i) => {
    const s = studs.find(x => x.id === sid), day = days[4 + (i % 12)];
    O.contacts.push({ id: uid() + 'c' + i, studentId: sid, classId: s.classId, date: ymd(day), with: 'ولي الأمر', channel: i % 3 ? 'واتساب' : 'اتصال', reason: i % 2 ? 'تكرار الغياب' : 'تقصير في الواجبات', result: i % 3 ? 'أُرسلت' : 'تم التواصل وتجاوب ولي الأمر', at: day.toISOString() });
  });
  [...star].slice(0, 6).forEach((sid, i) => {
    const s = studs.find(x => x.id === sid), day = days[8 + i];
    O.contacts.push({ id: uid() + 's' + i, studentId: sid, classId: s.classId, date: ymd(day), with: 'ولي الأمر', channel: 'شهادة', reason: 'شهادة تميّز: المشاركة الفاعلة', result: 'أُرسلت', at: day.toISOString() });
  });

  // خطط علاجية: قائمة ومنجزة
  const plans = [
    { reasons: ['تكرار الغياب', 'درجة منخفضة: اختبار قصير 1'], actions: ['توجيه فردي وتشجيع', 'أوراق عمل علاجية', 'تواصل مع ولي الأمر'], goal: 'أن ينتظم في الحضور ويرفع درجته في الاختبار القادم', fu: ['أُبلغ ولي الأمر بالخطة عبر واتساب', 'حلّ ورقة العمل العلاجية الأولى'] },
    { reasons: ['تقصير متكرر في الواجبات'], actions: ['متابعة الواجبات يوميًا', 'تعلم بالأقران (زميل متميز)'], goal: 'أن يسلّم واجباته كاملة أسبوعين متتاليين', fu: ['سلّم واجبين متتاليين'] },
    { reasons: ['ضعف المشاركة', 'درجة منخفضة: اختبار قصير 1'], actions: ['إعادة شرح المهارة', 'نقله إلى مقعد أمامي'], goal: 'أن يشارك مرتين أسبوعيًا', fu: ['شارك في الحصة مرتين هذا الأسبوع', 'تحسّن في الاختبار الثاني'], done: 'تحسّن ملحوظ' },
    { reasons: ['تكرار التأخر عن الحصة'], actions: ['توجيه فردي وتشجيع', 'تواصل مع ولي الأمر'], goal: 'الحضور في بداية الحصة', fu: ['تواصل مع ولي الأمر هاتفيًا'], done: 'تحسّن جزئي' }
  ];
  plans.forEach((p, i) => {
    const sid = [...weak][i * 3], s = studs.find(x => x.id === sid), start = days[p.done ? 2 + i : 9 + i];
    O.remedial.push({ id: uid() + 'r' + i, studentId: sid, classId: s.classId, date: ymd(start), status: p.done ? 'done' : 'open', reasons: p.reasons, actions: p.actions, goal: p.goal, days: 14,
      followups: p.fu.map((text, k) => ({ date: ymd(days[Math.min(days.length - 1, days.indexOf(start) + 2 + k * 3)]), text })), result: p.done || '', endDate: p.done ? ymd(days[days.indexOf(start) + 10]) : undefined, at: start.toISOString() });
  });

  for (const [store, arr] of Object.entries(O)) if (arr.length) await DB.putMany(store, arr);
  await DB.setSetting('lastBackup', new Date().toISOString());
  await DB.setSetting('lastCloudShare', new Date().toISOString());
}

/* ===== شريط «نسخة عرض» + منع الإرسال الفعلي لواتساب ===== */
async function demoReset() {
  if (!await confirmBox(`إعادة بيانات العرض إلى حالتها الأولى؟<br><small>تُحذف أي تغييرات أُجريت أثناء العرض.</small>`, { ok: 'إعادة البيانات' })) return;
  try { DB._db?.close(); } catch (e) { } DB._db = null;
  const r = indexedDB.deleteDatabase(DB_NAME);
  r.onsuccess = r.onerror = r.onblocked = () => location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('button');
  b.id = 'demo-pill'; b.type = 'button';
  b.innerHTML = `<span>نسخة عرض — جميع الأسماء والبيانات وهمية</span><b>↺ إعادة البيانات</b>`;
  document.body.classList.add('demo');
  b.title = 'إعادة البيانات التجريبية';
  b.onclick = demoReset;
  document.body.appendChild(b);

  // في نسخة العرض لا تُرسل أي رسالة فعليًا: تُعرض الرسالة كما ستصل لولي الأمر
  const open0 = Native.open.bind(Native);
  Native.open = url => {
    if (!/wa\.me|whatsapp/.test(url)) return open0(url);
    let txt = ''; try { txt = new URL(url).searchParams.get('text') || ''; } catch (e) { }
    sheet(`<div class="demo-wa"><div class="demo-wa-h">${ic('wa')} واتساب</div><div class="demo-wa-msg">${esc(txt).replace(/\n/g, '<br>')}</div></div>
      <p class="muted small center">في التطبيق الفعلي تُفتح هذه الرسالة في واتساب جاهزة للإرسال إلى رقم ولي الأمر.<br>نسخة العرض لا ترسل أي رسالة.</p>
      <button class="btn primary block" data-close>تم</button>`, { title: 'معاينة الرسالة' });
  };
});
