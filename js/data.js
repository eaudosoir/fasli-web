/* فصلي — البيانات الأساسية الافتراضية */
'use strict';

const GRADES = { 4: 'الرابع', 5: 'الخامس', 6: 'السادس' };
const GRADE_SHORT = { 4: 'رابع', 5: 'خامس', 6: 'سادس' };
const SECTIONS = { 1: 'أ', 2: 'ب', 3: 'ج' };
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

const DEFAULT_CLASSES = [];
for (const g of [4, 5, 6]) for (const s of [1, 2, 3])
  DEFAULT_CLASSES.push({ id: `g${g}s${s}`, grade: g, section: s, name: `${GRADE_SHORT[g]} ${SECTIONS[s]}`, full: `الصف ${GRADES[g]} ${SECTIONS[s]}` });

const DEFAULT_BELL = {
  periods: [
    { n: 1, start: '07:00', end: '07:45' },
    { n: 2, start: '07:45', end: '08:30' },
    { n: 3, start: '08:30', end: '09:15' },
    { n: 4, start: '09:40', end: '10:25' },
    { n: 5, start: '10:25', end: '11:10' },
    { n: 6, start: '11:10', end: '11:55' },
    { n: 7, start: '11:55', end: '12:40' }
  ],
  breakStart: '09:15', breakEnd: '09:40'
};

const ATT = {
  present: { label: 'حاضر', short: 'ح', color: 'var(--ok)' },
  absent: { label: 'غائب', short: 'غ', color: 'var(--bad)' },
  late: { label: 'متأخر', short: 'ت', color: 'var(--warn)' },
  excused: { label: 'مستأذن', short: 'س', color: 'var(--info)' },
  escaped: { label: 'هارب', short: 'هـ', color: 'var(--esc)' }
};
const ATT_ORDER = ['present', 'absent', 'late', 'excused', 'escaped'];

const DEFAULT_LISTS = {
  homeworkKinds: ['لم يحل الواجب', 'حل الواجب ناقصًا', 'لم يحضر الكتاب', 'لم يحضر الدفتر', 'لم يسلّم المهمة/النشاط', 'حل غير متقن'],
  positive: ['المشاركة الفاعلة في الدرس', 'الإجابة المتميزة', 'التعاون مع زملائه', 'الانضباط والهدوء داخل الفصل',
    'المبادرة ومساعدة المعلم', 'أداء الواجبات بانتظام', 'التحسن الملحوظ في المستوى', 'المحافظة على نظافة الفصل',
    'الأمانة والصدق', 'التميز في النشاط الصفي'],
  negative: [
    'الدرجة الأولى: التأخر عن الحصة',
    'الدرجة الأولى: النوم داخل الفصل',
    'الدرجة الأولى: تناول الطعام أثناء الدرس دون استئذان',
    'الدرجة الأولى: عدم الالتزام بالزي المدرسي',
    'الدرجة الثانية: الهروب من الحصة',
    'الدرجة الثانية: الخروج من الفصل دون استئذان',
    'الدرجة الثانية: إثارة الفوضى داخل الفصل',
    'الدرجة الثانية: عدم إحضار الكتب والأدوات المدرسية',
    'الدرجة الثانية: الإهمال المتكرر للواجبات',
    'الدرجة الثالثة: الإساءة اللفظية لأحد الزملاء',
    'الدرجة الثالثة: العبث بممتلكات المدرسة أو الزملاء',
    'الدرجة الثالثة: الاعتداء الجسدي البسيط على زميل',
    'الدرجة الرابعة: الإساءة أو التهديد لأحد منسوبي المدرسة'
  ],
  noteKinds: ['سلوكية', 'تعليمية']
};

const DEFAULT_SETTINGS = {
  teacherName: 'أ. عبدالله ال عواد',
  teacherPhone: '',
  school: 'مدرسة القادسية الابتدائية',
  subject: 'الدراسات الاجتماعية',
  principal: 'الأستاذ محمد عبدالله محمد ال يسارى',
  vpStudents: 'الأستاذ عمر الأسمري', vpStudentsPhone: '',
  counselor: 'المرشد الطلابي', counselorPhone: '',
  lockEnabled: false, autoOpen: true, alertMinutes: 5, startAlert: false, lockAfterMin: 3
};

/* قوائم الصفوف الرابع–السادس من ملف نور (الأسماء فقط؛ أرقام الجوال تُستورد من الملف داخل التطبيق) */
const SEED_ROSTERS = {};
/* جوالات أولياء الأمور (من ملف نور) بنفس ترتيب الأسماء */
const SEED_PHONES = {};



/* جدول المعلم 1448هـ (18 حصة) — day: 0=الأحد … 4=الخميس، classId 'wait' = حصة انتظار */
const DEFAULT_TIMETABLE = [
  [0, 1, 'wait'], [0, 2, 'g6s1'], [0, 3, 'g4s1'], [0, 5, 'g5s3'], [0, 6, 'g6s3'],
  [1, 1, 'wait'], [1, 3, 'g4s3'], [1, 4, 'g5s2'], [1, 6, 'g5s1'],
  [2, 1, 'g5s2'], [2, 2, 'g4s2'], [2, 3, 'g6s2'], [2, 4, 'wait'], [2, 5, 'g4s1'],
  [3, 2, 'g6s3'], [3, 3, 'g5s1'], [3, 4, 'wait'], [3, 6, 'g4s3'],
  [4, 1, 'g6s2'], [4, 3, 'g5s3'], [4, 4, 'g6s1'], [4, 5, 'wait'], [4, 6, 'g4s2']
].map(([day, period, classId]) => ({ id: `${day}|${period}`, day, period, classId, subject: classId === 'wait' ? 'انتظار' : 'الدراسات الاجتماعية' }));
const DEFAULT_DUTIES = [{ day: 2, start: '07:00', end: '07:20', label: 'إشراف — المقصف' }];

async function seedIfEmpty() {
  const done = await DB.getSetting('seeded', false);
  if (done) return;
  await DB.putMany('classes', DEFAULT_CLASSES);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await DB.setSetting(k, v);
  await DB.setSetting('bell', DEFAULT_BELL);
  await DB.setSetting('lists', DEFAULT_LISTS);
  const students = [];
  for (const [cid, str] of Object.entries(SEED_ROSTERS))
    str.split('،').forEach((n, i) => students.push({ id: uid() + i, name: n.trim(), classId: cid, nationalId: '', guardianPhone: (SEED_PHONES[cid] || '').split(',')[i] || '', guardianName: '', active: true, createdAt: new Date().toISOString() }));
  await DB.putMany('students', students);
  await DB.putMany('timetable', DEFAULT_TIMETABLE);
  await DB.setSetting('duties', DEFAULT_DUTIES);
  await DB.setSetting('seeded', true);
  await DB.setSetting('seedVersion', 3);
}

/* ترقية بيانات من إصدار سابق دون مسح أي سجل */
async function upgradeSeed() {
  const v = await DB.getSetting('seedVersion', 1);
  if (v >= 2) return upgradePhones();
  const studs = await DB.all('students');
  const add = [];
  for (const [cid, str] of Object.entries(SEED_ROSTERS))
    if (!studs.some(s => s.classId === cid && s.active !== false))
      str.split('،').forEach((n, i) => add.push({ id: uid() + i, name: n.trim(), classId: cid, nationalId: '', guardianPhone: '', guardianName: '', active: true, createdAt: new Date().toISOString() }));
  if (add.length) await DB.putMany('students', add);
  if (!(await DB.all('timetable')).length) await DB.putMany('timetable', DEFAULT_TIMETABLE);
  if (!(await DB.getSetting('duties'))) await DB.setSetting('duties', DEFAULT_DUTIES);
  await DB.setSetting('principal', DEFAULT_SETTINGS.principal);
  await DB.setSetting('seedVersion', 2);
  await upgradePhones();
}

/* إضافة جوالات أولياء الأمور للطلاب المحفوظين مسبقًا (دون تغيير أي رقم أدخله المعلم) */
async function upgradePhones() {
  if (await DB.getSetting('seedVersion', 1) >= 3) return;
  const studs = await DB.all('students'), upd = [];
  for (const [cid, str] of Object.entries(SEED_ROSTERS)) {
    const ph = (SEED_PHONES[cid] || '').split(',');
    str.split('،').forEach((n, i) => {
      const s = studs.find(x => x.classId === cid && normName(x.name) === normName(n));
      if (s && !s.guardianPhone && ph[i]) upd.push({ ...s, guardianPhone: ph[i] });
    });
  }
  if (upd.length) await DB.putMany('students', upd);
  await DB.setSetting('seedVersion', 3);
}
