/* فصلي — توزيع المنهج 1448هـ (الفصل الأول) وترتيب الخميس */
'use strict';

/* بداية كل أسبوع دراسي (الأحد) */
const CURR_WEEKS = [
  [1, '2026-08-23'], [2, '2026-08-30'], [3, '2026-09-06'], [4, '2026-09-13'], [5, '2026-09-20'], [6, '2026-09-27'],
  [7, '2026-10-04'], [8, '2026-10-11'], [9, '2026-10-18'], [10, '2026-10-25'], [11, '2026-11-01'], [12, '2026-11-08'],
  [13, '2026-11-15'], [14, '2026-11-29'], [15, '2026-12-06'], [16, '2026-12-13'], [17, '2026-12-20'], [18, '2026-12-27'], [19, '2027-01-03']
];
const CURR_BREAKS = [['2026-11-22', '2026-11-28', 'إجازة الخريف'], ['2027-01-08', '2027-01-16', 'إجازة منتصف العام']];

const DEFAULT_CURRICULUM = {
  4: ['المواطنة: الدراسات الاجتماعية + التهيئة', 'المواطنة: الهوية الوطنية', 'المواطنة: نظام الحكم', 'المواطنة: الرموز الوطنية + مراجعة',
    'التاريخ: مفهوم التاريخ', 'التاريخ: المصادر', 'التاريخ: السبب والنتيجة', 'التاريخ: الترتيب الزمني + مراجعة',
    'الجغرافيا: مفهوم الجغرافيا', 'الجغرافيا: الموقع', 'الجغرافيا: المكان', 'الجغرافيا: البيئة', 'الجغرافيا: الحركة + مراجعة',
    'الاقتصاد: مفهوم الاقتصاد', 'الاقتصاد: التبادل التجاري', 'التبادل التجاري + مراجعة', 'التبادل التجاري + مراجعة عامة',
    'اختبارات شفهية وعملية', 'اختبارات نهائية'],
  5: ['الخلفاء الراشدون + التهيئة', 'الخلفاء الراشدون + الخليفة أبو بكر الصديق', 'الخليفة عمر بن الخطاب', 'الخليفة عثمان بن عفان',
    'الخليفة علي بن أبي طالب + مراجعة', 'التاريخ الإسلامي: الدولة الأموية', 'التاريخ الإسلامي: الدولة العباسية', 'التاريخ الإسلامي: الحضارة الإسلامية + مراجعة',
    'الأمن الوطني: الأمن', 'الأمن الوطني: أجهزة الأمن + مراجعة', 'جغرافية وطني: الموقع والحدود', 'جغرافية وطني: مظاهر السطح',
    'جغرافية وطني: المناطق الرملية', 'جغرافية وطني: الأودية', 'جغرافية وطني: المناطق الساحلية والجزر', 'جغرافية وطني: المناطق الإدارية + مراجعة',
    'المناطق الإدارية + مراجعة عامة', 'اختبارات شفهية وعملية', 'اختبارات نهائية'],
  6: ['التاريخ: مفهوم التاريخ + التهيئة', 'التاريخ: مفهوم التاريخ', 'التاريخ: المصطلحات التاريخية + مراجعة',
    'الدولة السعودية الأولى: شبه الجزيرة العربية قبل قيام الدولة', 'الدولة السعودية الأولى: تأسيس الدولة السعودية الأولى', 'الدولة السعودية الأولى: أئمة الدولة السعودية الأولى',
    'الدولة السعودية الأولى: معارك الدفاع عن الدولة', 'معارك الدفاع عن الدولة السعودية الأولى + مراجعة',
    'الدولة السعودية الثانية: تأسيس الدولة السعودية الثانية', 'الدولة السعودية الثانية: أئمة الدولة السعودية الثانية',
    'الجوانب الحضارية للدولتين السعودية الأولى والثانية', 'الجوانب الحضارية للدولتين + مراجعة',
    'المملكة العربية السعودية: الملك عبدالعزيز بن عبدالرحمن آل سعود', 'المملكة العربية السعودية: توحيد المملكة',
    'ملوك المملكة: الملك سعود - الملك فيصل', 'ملوك المملكة: الملك خالد - الملك فهد - الملك عبدالله',
    'ملوك المملكة (خالد - فهد - عبدالله) + مراجعة عامة', 'اختبارات شفهية وعملية', 'اختبارات نهائية']
};

const Curr = {
  plan(grade) { const c = App.S.curriculum || {}; return (c[grade] && c[grade].length ? c[grade] : DEFAULT_CURRICULUM[grade]) || []; },
  weekOf(date = ymd()) {
    for (const [a, b, name] of CURR_BREAKS) if (date >= a && date <= b) return { n: 0, brk: name };
    let cur = null;
    for (const [n, start] of CURR_WEEKS) if (date >= start && date <= ymd(addDays(parseYmd(start), 6))) cur = n;
    if (cur) return { n: cur };
    if (date < CURR_WEEKS[0][1]) return { n: 0, brk: 'قبل بداية الدراسة' };
    return { n: 0, brk: 'بعد نهاية الفصل الدراسي' };
  },
  lesson(classId, date = ymd()) {
    const c = App.cls[classId]; if (!c) return null;
    const w = this.weekOf(date); if (!w.n) return w.brk ? { week: 0, title: w.brk } : null;
    const t = this.plan(c.grade)[w.n - 1];
    return { week: w.n, title: t || '' };
  },
  done(classId) { return ((App.S.lessonDone || {})[classId]) || {}; },
  base() { // الأسبوع الذي بدأ فيه المعلم استخدام المتابعة؛ ما قبله يُعدّ منجزًا
    if (App.S.currBase === undefined) { const w = this.weekOf().n || 0; App.S.currBase = w; DB.setSetting('currBase', w); }
    return App.S.currBase || 0;
  },
  lastDone(classId) { const d = this.done(classId); const ks = Object.keys(d).map(Number); return Math.max(ks.length ? Math.max(...ks) : 0, this.base() - 1); },
  async markDone(classId, week, on = true) {
    const all = { ...(App.S.lessonDone || {}) }; const d = { ...(all[classId] || {}) };
    if (on) d[week] = ymd(); else delete d[week];
    all[classId] = d; await App.set('lessonDone', all);
  },
  status(classId) {
    const now = this.weekOf().n || (ymd() > CURR_WEEKS[CURR_WEEKS.length - 1][1] ? 19 : 0);
    const last = this.lastDone(classId);
    const expected = Math.max(0, now - 1); // يتوقع إنهاء دروس الأسابيع السابقة
    const diff = last - expected;
    return { now, last, diff, label: diff > 0 ? `متقدم ${weeksAr(diff)}` : diff < 0 ? `متأخر ${weeksAr(-diff)}` : 'على الخطة', kind: diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'ok' };
  }
};

/* ===== ترتيب الخميس: دمج كل صف في فصل واحد بالتناوب ===== */
const DEFAULT_MERGE = { enabled: true, start: '2026-10-08', order: [3, 1, 2] };
const Merge = {
  cfg() { return { ...DEFAULT_MERGE, ...(App.S.merge || {}) }; },
  host(date = ymd()) {
    const c = this.cfg(); const d = parseYmd(date);
    if (!c.enabled || d.getDay() !== 4 || date < c.start) return null;
    const weeks = Math.round((d - parseYmd(c.start)) / (7 * 86400000));
    return c.order[((weeks % c.order.length) + c.order.length) % c.order.length];
  },
  active(date) { return !!this.host(date); }
};

const weeksAr = n => n === 1 ? 'أسبوعًا' : n === 2 ? 'أسبوعين' : n <= 10 ? `${n} أسابيع` : `${n} أسبوعًا`;
