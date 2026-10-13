/* فصلي — أدوات مساعدة */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ===== التاريخ والوقت ===== */
const pad = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const fmt12 = hm => { let [h, m] = hm.split(':').map(Number); const ap = h < 12 ? 'ص' : 'م'; h = h % 12 || 12; return `${h}:${pad(m)} ${ap}`; };

let _hijriFmt, _hijriDay, _gregFmt;
try {
  _hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  _hijriDay = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric' });
} catch (e) { }
_gregFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const hijri = d => _hijriFmt ? _hijriFmt.format(d).replace('هـ', '').trim() + 'هـ' : '';
const hijriDayNum = d => _hijriDay ? _hijriDay.format(d) : '';
const greg = d => _gregFmt.format(d) + 'م';
const dayName = d => ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][d.getDay()];
const shortDate = s => { const d = parseYmd(s); return `${dayName(d)} ${d.getDate()}/${d.getMonth() + 1}`; };

function periodRange(kind, ref = new Date()) {
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (kind === 'day') return [ymd(today), ymd(today)];
  if (kind === 'week') { const s = addDays(today, -today.getDay()); return [ymd(s), ymd(addDays(s, 6))]; }
  if (kind === 'month') return [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0))];
  if (kind === 'term') return [ymd(addDays(today, -120)), ymd(today)];
  return [ymd(today), ymd(today)];
}

/* ===== الأسماء ===== */
const normName = s => String(s || '').replace(/[أإآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/\bال\s+/g, 'ال').replace(/[ـً-ْ]/g, '').replace(/\s+/g, ' ').trim();
const shortName = s => { const p = String(s).trim().split(/\s+/); return p.length <= 2 ? s : `${p[0]} ${p[p.length - 1]}`; };
const initials = s => { const p = String(s).trim().split(/\s+/); return (p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : ''); };
function nameScore(a, b) {
  const A = normName(a).split(' '), B = normName(b).split(' ');
  if (normName(a) === normName(b)) return 1;
  let hit = 0; A.forEach(w => { if (B.includes(w)) hit++; });
  const first = A[0] === B[0] ? 0.25 : 0;
  return Math.min(0.99, hit / Math.max(A.length, B.length) + first);
}
const phoneIntl = p => { p = String(p || '').replace(/\D/g, ''); if (p.startsWith('00')) p = p.slice(2); if (p.startsWith('05')) p = '966' + p.slice(1); else if (p.startsWith('5') && p.length === 9) p = '966' + p; return p; };
const maskPhone = p => p ? String(p).replace(/^(\d{3})\d+(\d{2})$/, '$1•••••$2') : '';

/* ===== أيقونات ===== */
const IC = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.2 2.4 3.5 5.2"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  checkSq: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7.5 12.3 3 3 6-6.6"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  book: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  note: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
  phone: '<path d="M5 3.5h3.2l1.6 4.4-2.2 1.4a11 11 0 0 0 7.1 7.1l1.4-2.2 4.4 1.6V19a1.7 1.7 0 0 1-1.8 1.7A16.5 16.5 0 0 1 3.3 5.3 1.7 1.7 0 0 1 5 3.5z"/>',
  wa: '<path d="M4 20l1.2-4A8.5 8.5 0 1 1 8.3 19z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1.7a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.3 8.6a1.6 1.6 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 5.7 3.9l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2.7a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M9 5l7 7-7 7"/>',
  chev: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.4-4.6"/>',
  download: '<path d="M12 4v11M7 10.5 12 15.5l5-5M4.5 19.5h15"/>',
  upload: '<path d="M12 16V5M7 9.5 12 4.5l5 5M4.5 19.5h15"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  file: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.1"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4M12 8v4.5l3 1.8"/>',
  run: '<circle cx="14" cy="4.5" r="2"/><path d="m8 21 3-6 3 2.5V21M6 12l3-4h5l3 4 3 1M11 15l-1.5-4"/>',
  door: '<path d="M5 21V4a1 1 0 0 1 1-1h9v18M15 3l4 1.5V21M3 21h18"/><circle cx="12" cy="12.5" r=".8"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  school: '<path d="M2.5 9.5 12 4.5l9.5 5-9.5 5z"/><path d="M6.5 11.5V17c3.5 2.5 7.5 2.5 11 0v-5.5M21.5 9.5v6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.1M4.5 12h.1M4.5 18h.1"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.1"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1.2 3.6 1.2 5 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.8M12 17.2v.1"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8"/><path d="m12 12.8.9 1.6 1.7.3-1.3 1.1.3 1.7-1.6-.8-1.6.8.3-1.7-1.3-1.1 1.7-.3z"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  merge: '<path d="M6 4v4a6 6 0 0 0 6 6 6 6 0 0 1 6 6M18 4v4a6 6 0 0 1-3 5.2"/><path d="m3.5 6.5 2.5-2.5 2.5 2.5M15.5 6.5 18 4l2.5 2.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  seat: '<rect x="3.5" y="4" width="7" height="6" rx="1.5"/><rect x="13.5" y="4" width="7" height="6" rx="1.5"/><rect x="3.5" y="14" width="7" height="6" rx="1.5"/><rect x="13.5" y="14" width="7" height="6" rx="1.5"/>',
  screen: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  bank: '<path d="M4 6.5C4 5 5 4 6.5 4H20v13H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5M9 8.5h6M9 12h4"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

/* ===== رسائل وتنبيهات داخل الواجهة ===== */
function toast(msg, kind = '', opts = {}) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind + (opts.undo ? ' has-act' : ''); t.innerHTML = `<span>${msg}</span>`;
  const hide = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
  if (opts.undo) {
    const b = document.createElement('button'); b.className = 'toast-act'; b.innerHTML = `${ic('history')} تراجع`;
    b.onclick = async () => { b.disabled = true; hide(); try { await opts.undo(); toast('تم التراجع', ''); } catch (e) { toast('تعذر التراجع', 'bad'); } };
    t.appendChild(b);
  }
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(hide, opts.undo ? 6000 : 2600);
}

/* حالة المتابعة لأي حالة (واجب أو ملاحظة): مفتوحة / تحت المتابعة / تمت المعالجة */
const caseSt = x => x.resolved ? 'done' : x.status === 'follow' ? 'follow' : 'open';
const CASE_ST = { open: ['مفتوحة', 'bad'], follow: ['تحت المتابعة', 'gold'], done: ['تمت المعالجة', 'ok'] };
const casePill = x => `<span class="pill st ${CASE_ST[caseSt(x)][1]}">${CASE_ST[caseSt(x)][0]}</span>`;
async function setCaseSt(store, id, st) {
  const x = await DB.get(store, id); if (!x) return;
  const rec = { ...x, status: st === 'follow' ? 'follow' : st === 'done' ? 'done' : 'open', resolved: st === 'done', followAt: st === 'follow' ? new Date().toISOString() : x.followAt };
  if (st !== 'done') { delete rec.resolvedAt; } else rec.resolvedAt = rec.resolvedAt || new Date().toISOString();
  await DB.put(store, rec);
  toast(`الحالة: ${CASE_ST[st][0]}`, 'ok', { undo: async () => { await DB.put(store, x); App.render(); } });
}

/* إضافة نقطة مع إمكانية التراجع الفوري */
async function addPoint(rec, msg) {
  const r = { id: uid(), at: new Date().toISOString(), value: 1, ...rec };
  await DB.put('points', r);
  toast(msg || '★ أضيفت نقطة', 'ok', { undo: async () => { await DB.del('points', r.id); if (App._afterUndo) App._afterUndo(); else App.render(); } });
  return r;
}

/* ===== الإدخال الصوتي (تتكلم ويكتب التطبيق) ===== */
const Voice = {
  _cb: null,
  supported() { return Native.has() || !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  listen(cb) {
    this._cb = cb;
    if (Native.has()) { if (Native.call('speechToText', 'ar-SA') === false) toast('الإدخال الصوتي غير متاح في هذا الجهاز', 'bad'); return; }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return toast('الإدخال الصوتي غير متاح', 'bad');
    const r = new R(); r.lang = 'ar-SA'; r.interimResults = false;
    r.onresult = e => this.result(e.results[0][0].transcript); r.onerror = () => toast('لم أسمع جيدًا، حاول مرة أخرى', 'bad');
    r.start(); toast('🎙️ تكلم الآن...');
  },
  result(text) { const cb = this._cb; this._cb = null; if (text && cb) cb(String(text)); else if (!text) toast('لم أسمع جيدًا، حاول مرة أخرى', 'bad'); }
};
/* زر ميكروفون بجانب أي حقل نص: <div class="voice-fld">حقل + زر</div> */
function micBtn(target) { return Voice.supported() ? `<button type="button" class="mic-btn" data-mic="${target}" aria-label="إدخال صوتي">${ic('mic')}</button>` : ''; }
function bindMic(root) {
  $$('[data-mic]', root).forEach(b => b.onclick = () => {
    const f = root.querySelector(b.dataset.mic); if (!f) return;
    b.classList.add('rec');
    Voice.listen(t => { b.classList.remove('rec'); f.value = (f.value.trim() ? f.value.trim() + ' ' : '') + t; f.dispatchEvent(new Event('input')); });
    setTimeout(() => b.classList.remove('rec'), 8000);
  });
}

/* لوحة سفلية (Bottom sheet) */
function sheet(html, { title = '', onMount, wide = false } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${wide ? 'wide' : ''}" role="dialog">
      <div class="sheet-grip"></div>
      ${title ? `<div class="sheet-head"><h3>${title}</h3><button class="icon-btn" data-close>${ic('x')}</button></div>` : ''}
      <div class="sheet-body">${html}</div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const close = v => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 250); resolve(v); };
    wrap.querySelector('.sheet-bg').onclick = () => close(null);
    wrap.querySelectorAll('[data-close]').forEach(b => b.onclick = () => close(null));
    wrap._close = close;
    App._sheets.push(wrap);
    if (onMount) onMount(wrap.querySelector('.sheet'), close);
  }).finally(() => { App._sheets = App._sheets.filter(w => document.body.contains(w)); });
}
async function confirmBox(msg, { ok = 'تأكيد', danger = false } = {}) {
  return sheet(`<p class="confirm-msg">${msg}</p><div class="row gap"><button class="btn ${danger ? 'danger' : 'primary'} grow" data-ok>${ok}</button><button class="btn ghost grow" data-close>إلغاء</button></div>`,
    { onMount: (el, close) => { el.querySelector('[data-ok]').onclick = () => close(true); } });
}
function choose(title, options) { // options: [{value,label,sub,icon}]
  return sheet(`<div class="choice-list">${options.map((o, i) => `<button class="choice" data-i="${i}">${o.icon ? `<span class="choice-ic">${o.icon}</span>` : ''}<span><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></button>`).join('')}</div>`,
    { title, onMount: (el, close) => el.querySelectorAll('.choice').forEach(b => b.onclick = () => close(options[+b.dataset.i].value)) });
}

/* ===== جسر أندرويد ===== */
const Native = {
  has: () => typeof window.FasliAndroid !== 'undefined',
  call(fn, ...a) { try { if (this.has() && window.FasliAndroid[fn]) return window.FasliAndroid[fn](...a); } catch (e) { console.warn(e); } return undefined; },
  async saveFile(name, blob, mime) {
    if (this.has()) {
      const b64 = await blobToB64(blob);
      const r = this.call('saveFile', name, b64, mime);
      toast(r ? `تم الحفظ في التنزيلات: ${esc(name)}` : 'تعذر حفظ الملف', r ? 'ok' : 'bad');
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
  async shareFile(name, blob, mime) {
    if (this.has()) { const b64 = await blobToB64(blob); this.call('shareFile', name, b64, mime); return; }
    try { const f = new File([blob], name, { type: mime }); if (navigator.canShare?.({ files: [f] })) return navigator.share({ files: [f] }); } catch (e) { }
    return this.saveFile(name, blob, mime);
  },
  print(title) { if (this.has()) this.call('print', title || 'تقرير فصلي'); else window.print(); },
  open(url) { if (this.has()) this.call('openExternal', url); else window.open(url, '_blank'); }
};
const blobToB64 = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });

function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null); i.click();
  });
}

/* ===== Excel: قراءة وكتابة xlsx ===== */
async function readSheetFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    let txt = await file.text();
    if (txt.includes('\uFFFD')) { // ترميز Windows-1256
      try { txt = new TextDecoder('windows-1256').decode(await file.arrayBuffer()); } catch (e) { }
    }
    return parseCSV(txt.replace(/^﻿/, ''));
  }
  if (name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (head[0] === 0xD0 && head[1] === 0xCF) throw new Error('ملف Excel قديم (xls). افتحه واحفظه بصيغة xlsx أو CSV ثم أعد المحاولة');
    const txt = await file.text(); // بعض الأنظمة تصدّر HTML بامتداد xls
    if (/<table/i.test(txt)) return parseHtmlTable(txt);
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = [];
  if (ssXml) {
    const d = new DOMParser().parseFromString(ssXml, 'application/xml');
    d.getElementsByTagName('si').length && [...d.getElementsByTagName('si')].forEach(si => shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join('')));
  }
  const sheetPath = Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort()[0];
  const d = new DOMParser().parseFromString(await zip.file(sheetPath).async('string'), 'application/xml');
  const rows = [];
  [...d.getElementsByTagName('row')].forEach(r => {
    const row = [];
    [...r.getElementsByTagName('c')].forEach(c => {
      const ref = c.getAttribute('r') || ''; const col = colIndex(ref.replace(/\d+/g, ''));
      const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let val = v;
      if (t === 's') val = shared[+v] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      row[col] = val;
    });
    rows.push([...row].map(x => x ?? ''));
  });
  return rows;
}
const colIndex = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function parseCSV(t) {
  const sep = (t.split('\n')[0].match(/\t/g) || []).length > (t.split('\n')[0].match(/[,;]/g) || []).length ? '\t' : (t.split('\n')[0].includes(';') && !t.split('\n')[0].includes(',') ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
function parseHtmlTable(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  return [...d.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td,th')].map(td => td.textContent.trim()));
}

async function buildXlsx(sheetName, header, rows, title) {
  const zip = new JSZip();
  const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const all = [];
  if (title) all.push([title]);
  all.push(header); rows.forEach(r => all.push(r));
  const hdrRow = title ? 2 : 1;
  const sheetRows = all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1);
    const style = (ri + 1 === hdrRow) ? ' s="1"' : (title && ri === 0 ? ' s="2"' : '');
    if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEsc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const widths = header.map((h, i) => Math.min(60, Math.max(10, ...all.map(r => String(r[i] ?? '').length + 3))));
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName).slice(0, 30)}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="12"/><name val="Arial"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF0F6E5C"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F6E5C"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fontId="2" applyFont="1"/></cellXfs></styleSheet>');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ===== تجزئة الرمز السري ===== */
async function sha256(str) {
  if (window.crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  // بديل بسيط في حال عدم توفر crypto.subtle
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'f' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}
