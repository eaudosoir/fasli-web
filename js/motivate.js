/* فصلي — نجوم الأسبوع، شهادات التميّز، الأوسمة */
'use strict';

const weekRange = (d = new Date()) => { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const s = addDays(t, -t.getDay()); return [ymd(s), ymd(addDays(s, 4))]; };

/* ===== الأوسمة: تُحسب تلقائيًا من سجلات الطالب ===== */
const BADGES = [
  { k: 'part', name: 'المشارك المتميز', icon: '🌟', desc: '10 مشاركات فأكثر' },
  { k: 'disc', name: 'المنضبط', icon: '🛡️', desc: 'بلا غياب أو تأخر أو هروب خلال 30 يومًا' },
  { k: 'hw', name: 'بطل الواجبات', icon: '📘', desc: 'بلا تقصير في الواجبات خلال 30 يومًا' },
  { k: 'star', name: 'نجم الأسبوع', icon: '🏆', desc: 'من أفضل 3 في فصله هذا الأسبوع' },
  { k: 'beh', name: 'القدوة', icon: '💎', desc: '5 نقاط سلوك إيجابي فأكثر' },
  { k: 'quiz', name: 'فارس المسابقة', icon: '⚡', desc: '5 إجابات صحيحة في مسابقة الحصة' }
];
function studentBadges(sid, D) {
  const s = App.stu[sid]; if (!s) return [];
  const since = ymd(addDays(new Date(), -30));
  const pts = D.pts.filter(x => x.studentId === sid);
  const att = D.att.filter(x => x.studentId === sid && x.date >= since);
  const hw = D.hw.filter(x => x.studentId === sid && x.date >= since);
  const out = [];
  if (pts.filter(x => x.type === 'participation').length >= 10) out.push('part');
  if (att.length >= 6 && !att.some(a => ['absent', 'late', 'escaped'].includes(a.status))) out.push('disc');
  if (att.length >= 6 && !hw.length) out.push('hw');
  if (weekStars(s.classId, D).slice(0, 3).some(x => x.sid === sid && x.score > 0)) out.push('star');
  if (pts.filter(x => x.type === 'positive').reduce((a, b) => a + (b.value || 1), 0) >= 5) out.push('beh');
  if (pts.filter(x => x.quiz).length >= 5) out.push('quiz');
  return BADGES.filter(b => out.includes(b.k));
}
function badgesHtml(list) { return list.length ? `<div class="badges-row">${list.map(b => `<span class="bdg" title="${esc(b.desc)}">${b.icon} ${esc(b.name)}</span>`).join('')}</div>` : ''; }

/* نقاط الأسبوع لكل طالب في الفصل */
function weekStars(classId, D, ref = new Date()) {
  const [from, to] = weekRange(ref);
  const studs = App.classStudents(classId);
  const ids = new Set(studs.map(s => s.id));
  const sc = {};
  D.pts.filter(x => ids.has(x.studentId) && x.date >= from && x.date <= to).forEach(x => sc[x.studentId] = (sc[x.studentId] || 0) + (x.value || 1));
  const hwBad = {}; D.hw.filter(x => ids.has(x.studentId) && x.date >= from && x.date <= to).forEach(x => hwBad[x.studentId] = (hwBad[x.studentId] || 0) + 1);
  return studs.map(s => ({ sid: s.id, score: (sc[s.id] || 0) - (hwBad[s.id] || 0) * 0.5, pts: sc[s.id] || 0 })).sort((a, b) => b.score - a.score || App.stu[a.sid].name.localeCompare(App.stu[b.sid].name, 'ar'));
}

Screens.stars = async (v, p) => {
  const D = await Follow.load();
  const off = p.off || 0;
  const ref = addDays(new Date(), -7 * off);
  const [from, to] = weekRange(ref);
  const cls = App.classes.filter(c => App.classStudents(c.id).length);
  const medal = ['🥇', '🥈', '🥉'];
  v.innerHTML = topbar('نجوم الأسبوع') + `<div class="page">
    <div class="stars-hero">${ic('trophy')}<div><b>نجوم الأسبوع</b><small>${shortDate(from)} — ${shortDate(to)} · أعلى 3 طلاب في كل فصل حسب نقاط المشاركة والسلوك</small></div></div>
    <div class="seg small"><button data-off="1" class="${off === 1 ? 'on' : ''}">الأسبوع الماضي</button><button data-off="0" class="${off === 0 ? 'on' : ''}">هذا الأسبوع</button></div>
    ${(() => { const empty = cls.filter(c => !weekStars(c.id, D, ref).some(x => x.pts > 0)); return empty.length ? `<p class="muted small">فصول بلا نقاط هذا الأسبوع: ${empty.map(c => esc(c.name)).join('، ')}</p>` : ''; })()}
    ${cls.filter(c => weekStars(c.id, D, ref).some(x => x.pts > 0)).length ? '' : `<div class="empty">${ic('trophy')}<h3>لا نجوم بعد</h3><p>سجّل مشاركات الطلاب ونقاطهم الإيجابية في الحصص، وتظهر هنا أفضل 3 في كل فصل.</p></div>`}
    ${cls.filter(c => weekStars(c.id, D, ref).some(x => x.pts > 0)).map(c => { const top = weekStars(c.id, D, ref).filter(x => x.pts > 0).slice(0, 3); return `<section class="card star-card"><div class="card-h"><h3>${esc(c.name)}</h3><small class="muted">${top.length ? '' : 'لا نقاط بعد'}</small></div>
      ${top.length ? top.map((x, i) => `<div class="star-row"><span class="md">${medal[i]}</span><span class="grow"><b>${esc(App.stu[x.sid].name)}</b><small>${x.pts} نقطة</small></span>
        <button class="btn xs gold" data-cert="${x.sid}|${i}">${ic('medal')} شهادة</button></div>`).join('') : '<p class="muted small pad">سجّل مشاركات الطلاب في الحصص لتظهر النجوم هنا</p>'}</section>`; }).join('')}
  </div>`;
  bindBack(v);
  $$('[data-off]', v).forEach(b => b.onclick = () => { App.stack[App.stack.length - 1].params = { off: +b.dataset.off }; App.render(); });
  $$('[data-cert]', v).forEach(b => b.onclick = () => { const [sid, rank] = b.dataset.cert.split('|'); certificateSheet(sid, +rank, from); });
};

/* ===== شهادة التميّز (صورة جاهزة للمشاركة والطباعة) ===== */
async function drawCertificate({ name, cls, reason, date }) {
  try { await document.fonts.ready; } catch (e) { }
  const W = 1600, H = 1131, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.direction = 'rtl'; x.textAlign = 'center';
  const F = (w, s) => `${w} ${s}px FasliNaskh, 'Noto Naskh Arabic', 'Amiri', serif`;
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#FFFDF7'); g.addColorStop(1, '#F6EFDD'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#16316E'; x.lineWidth = 26; x.strokeRect(30, 30, W - 60, H - 60);
  x.strokeStyle = '#D9A33A'; x.lineWidth = 5; x.strokeRect(62, 62, W - 124, H - 124);
  x.lineWidth = 2; x.strokeRect(76, 76, W - 152, H - 152);
  // زوايا ذهبية
  x.fillStyle = '#D9A33A';
  [[76, 76], [W - 76, 76], [76, H - 76], [W - 76, H - 76]].forEach(([a, b]) => { x.save(); x.translate(a, b); x.rotate(Math.PI / 4); x.fillRect(-16, -16, 32, 32); x.restore(); });
  try { const img = new Image(); img.src = 'img/brand-navy.png'; await img.decode(); const bw = 300, bh = bw * img.naturalHeight / img.naturalWidth; x.drawImage(img, W / 2 - bw / 2, 110, bw, bh); } catch (e) { }
  x.fillStyle = '#7A6A4A'; x.font = F(600, 30); x.fillText('المملكة العربية السعودية · وزارة التعليم · ' + (App.S.school || ''), W / 2, 305);
  x.fillStyle = '#16316E'; x.font = F(700, 96); x.fillText('شهادة تميّز', W / 2, 425);
  x.fillStyle = '#3A4A52'; x.font = F(600, 38); x.fillText(`يسرّ معلم ${App.S.subject || ''} أن يمنح الطالب`, W / 2, 515);
  x.fillStyle = '#B0801C'; x.font = F(700, 78); x.fillText(name, W / 2, 625);
  x.strokeStyle = '#D9A33A'; x.lineWidth = 3; x.beginPath(); x.moveTo(W / 2 - 380, 660); x.lineTo(W / 2 + 380, 660); x.stroke();
  x.fillStyle = '#3A4A52'; x.font = F(600, 38); x.fillText(`من ${cls}`, W / 2, 730);
  x.fillText(reason, W / 2, 795);
  x.font = F(600, 34); x.fillText('متمنين له دوام التميّز والتفوق', W / 2, 860);
  x.textAlign = 'right'; x.fillStyle = '#16316E'; x.font = F(700, 32); x.fillText('المعلم', W - 230, 960); x.font = F(600, 32); x.fillText(App.S.teacherName || '', W - 170, 1010);
  x.textAlign = 'left'; x.font = F(700, 32); x.fillText('التاريخ', 230, 960); x.font = F(600, 30); x.fillText(date, 170, 1010);
  x.textAlign = 'center'; x.fillStyle = '#D9A33A'; x.font = F(700, 64); x.fillText('★ ★ ★', W / 2, 1000);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

async function certificateSheet(sid, rank = 0, weekFrom) {
  const s = App.stu[sid];
  const reasons = ['لتميّزه في المشاركة والتفاعل خلال الأسبوع', 'لحصوله على المركز الأول في نجوم الأسبوع', 'لانضباطه وحسن سلوكه داخل الفصل', 'لتميّزه في أداء الواجبات', 'لتفوقه في مسابقة الحصة'];
  const def = rank === 0 ? reasons[1] : reasons[0];
  const r = await sheet(`<div class="who">${ic('medal')} <b>${esc(s.name)}</b><small>${esc(App.cls[s.classId]?.full || '')}</small></div>
    <span class="lbl">سبب التميّز</span><select name="reason">${reasons.map(x => `<option ${x === def ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <label class="fld"><span>أو اكتب سببًا آخر</span><input name="other" placeholder="لـ..."></label>
    <div class="cert-prev"><img alt="معاينة الشهادة"></div>
    <div class="row gap"><button class="btn wa grow" data-share>${ic('share')} مشاركة (واتساب)</button><button class="btn soft" data-save>${ic('download')} حفظ</button></div>
    <button class="btn ghost block" data-msg>${ic('wa')} رسالة تهنئة لولي الأمر</button>`, {
    title: 'شهادة تميّز', onMount: async (el) => {
      let blob;
      const reason = () => el.querySelector('[name=other]').value.trim() || el.querySelector('[name=reason]').value;
      const render = async () => { blob = await drawCertificate({ name: s.name, cls: App.cls[s.classId]?.full || '', reason: reason(), date: hijri(new Date()) }); el.querySelector('.cert-prev img').src = URL.createObjectURL(blob); };
      await render();
      el.querySelector('[name=reason]').onchange = render; el.querySelector('[name=other]').onchange = render;
      const fname = `شهادة-${shortName(s.name)}.png`;
      el.querySelector('[data-share]').onclick = async () => { await Native.shareFile(fname, blob, 'image/png'); await logCert(); };
      el.querySelector('[data-save]').onclick = async () => { await Native.saveFile(fname, blob, 'image/png'); await logCert(); };
      el.querySelector('[data-msg]').onclick = () => messageSheet(sid, { kind: 'pos', behavior: reason().replace(/^ل/, '') });
      async function logCert() { await DB.put('contacts', { id: uid(), studentId: sid, classId: s.classId, date: ymd(), with: 'ولي الأمر', channel: 'شهادة', reason: 'شهادة تميّز: ' + reason(), result: 'أُرسلت', at: new Date().toISOString() }); logUse('cert'); }
    }
  });
  return r;
}
