/* فصلي — المزامنة بين أجهزة المعلم عبر Firebase (واجهة REST مباشرة، بلا مكتبات)
 * كل كتابة في قاعدة البيانات المحلية تُرصد تلقائيًا وتُرفع، وتغييرات الأجهزة الأخرى تُسحب كل نصف دقيقة.
 * البيانات في السحابة: users/{uid}/recs/{store~key} = { s: المخزن, k: المفتاح, d: السجل (JSON), x: محذوف؟, t: وقت الخادم }
 * يعمل التطبيق كما هو بدون إنترنت؛ التغييرات تنتظر في الطابور حتى يعود الاتصال. */
'use strict';

const Sync = (() => {
  const C = Object.assign({
    apiKey: '', projectId: '',
    authBase: 'https://identitytoolkit.googleapis.com', tokenBase: 'https://securetoken.googleapis.com', fsBase: 'https://firestore.googleapis.com'
  }, window.FASLI_SYNC || {});
  const LS_AUTH = 'fasli-sync-auth', LS_Q = 'fasli-sync-q', LS_ST = 'fasli-sync-state';
  const PAGE = 1000, BATCH = 300, POLL = 30000;
  // إعدادات خاصة بكل جهاز لا تُزامن (الرمز السري، حالة التهيئة، النسخ التلقائي…)
  const SKIP_SETTINGS = new Set([...SECRET_KEYS, 'seeded', 'seedVersion', 'lastSnapshot', 'lastAutoBackup', 'snapshotOffered', 'lockEnabled', 'lockAfterMin']);
  const SYNCED = STORES; // الصور (MEDIA_STORES) لا تُزامن لحجمها
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  const qk = (s, k) => s + '\u0001' + k;
  let auth = ls.get(LS_AUTH, null);        // { uid, email, refresh }
  let queue = ls.get(LS_Q, {});            // مفتاح السجل ← رقم التعديل
  let idTok = null, idExp = 0, lastCommit = null, busy = false, again = false, timer = null, lastErr = '';
  const quiet = new WeakSet();             // معاملات نكتبها نحن من السحابة فلا تُعاد للرفع
  const configured = () => !!(C.apiKey && C.projectId);

  /* ===== رصد كل الكتابات في IndexedDB (put/add/delete/clear) مهما كان مصدرها ===== */
  const P = IDBObjectStore.prototype, put0 = P.put, add0 = P.add, del0 = P.delete, clr0 = P.clear;
  function track(os, fn) {
    if (!auth) return;
    const tx = os.transaction;
    if (quiet.has(tx) || tx.db.name !== DB_NAME || !SYNCED.includes(os.name)) return;
    let ops = tx.__fasliOps;
    if (!ops) {
      ops = tx.__fasliOps = [];
      tx.addEventListener('complete', () => { if (!ops.length) return; ops.forEach(k => queue[k] = (queue[k] || 0) + 1); ls.set(LS_Q, queue); schedule(); });
    }
    fn(ops);
  }
  const keyOf = (os, v, k) => k !== undefined ? k : (os.keyPath && v ? v[os.keyPath] : undefined);
  P.put = function (v, k) { const r = put0.apply(this, arguments); track(this, ops => { const key = keyOf(this, v, k); if (key !== undefined) ops.push(qk(this.name, key)); }); return r; };
  P.add = function (v, k) { const r = add0.apply(this, arguments); track(this, ops => { const key = keyOf(this, v, k); if (key !== undefined) ops.push(qk(this.name, key)); }); return r; };
  P.delete = function (k) { const r = del0.apply(this, arguments); if (!(k instanceof IDBKeyRange)) track(this, ops => ops.push(qk(this.name, k))); return r; };
  P.clear = function () {
    const os = this;
    track(os, ops => { const rq = os.getAllKeys(); rq.onsuccess = () => rq.result.forEach(k => ops.push(qk(os.name, k))); });
    return clr0.apply(this, arguments);
  };

  /* ===== الاتصال بـ Firebase ===== */
  const AUTH_ERR = {
    EMAIL_NOT_FOUND: 'البريد أو كلمة المرور غير صحيحة', INVALID_PASSWORD: 'البريد أو كلمة المرور غير صحيحة', INVALID_LOGIN_CREDENTIALS: 'البريد أو كلمة المرور غير صحيحة',
    INVALID_EMAIL: 'صيغة البريد غير صحيحة', MISSING_PASSWORD: 'اكتب كلمة المرور', USER_DISABLED: 'هذا الحساب موقوف',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'محاولات كثيرة، انتظر قليلًا ثم أعد المحاولة',
    TOKEN_EXPIRED: 'انتهت جلسة الدخول، سجّل دخولك مرة أخرى', INVALID_REFRESH_TOKEN: 'انتهت جلسة الدخول، سجّل دخولك مرة أخرى', USER_NOT_FOUND: 'الحساب غير موجود'
  };
  class AuthError extends Error { }
  const authMsg = j => { const c = String(j?.error?.message || '').split(' ')[0]; return AUTH_ERR[c] || ('تعذر تسجيل الدخول' + (c ? ` (${c})` : '')); };
  async function post(url, body, headers = {}) {
    let r;
    try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }); }
    catch (e) { throw new Error('لا يوجد اتصال بالإنترنت'); }
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  }
  async function token() {
    if (idTok && Date.now() < idExp - 60000) return idTok;
    const { ok, j } = await post(`${C.tokenBase}/v1/token?key=${C.apiKey}`, `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refresh)}`, { 'Content-Type': 'application/x-www-form-urlencoded' });
    if (!ok) throw new AuthError(authMsg(j));
    idTok = j.id_token; idExp = Date.now() + (+j.expires_in || 3600) * 1000;
    if (j.refresh_token && j.refresh_token !== auth.refresh) { auth.refresh = j.refresh_token; ls.set(LS_AUTH, auth); }
    return idTok;
  }
  async function fs(path, body) {
    const t = await token();
    const { ok, status, j } = await post(`${C.fsBase}/v1/projects/${C.projectId}/databases/(default)/documents${path}?key=${C.apiKey}`, body, { Authorization: 'Bearer ' + t });
    if (ok) return j;
    if (status === 401) { idTok = null; throw new AuthError('انتهت جلسة الدخول، سجّل دخولك مرة أخرى'); }
    const e = (Array.isArray(j) ? j[0] : j)?.error || {};
    if (status === 403 || e.status === 'PERMISSION_DENIED') throw new Error('رفض الخادم الوصول — تأكد من قواعد Firestore');
    if (status === 404 || e.status === 'NOT_FOUND') throw new Error('قاعدة بيانات Firestore غير موجودة في المشروع');
    if (status === 429 || e.status === 'RESOURCE_EXHAUSTED') throw new Error('تجاوزت الحد اليومي المجاني، تُستأنف المزامنة غدًا');
    throw new Error(e.message || `خطأ في الخادم (${status})`);
  }
  const root = () => `projects/${C.projectId}/databases/(default)/documents/users/${auth.uid}`;
  const query = (since, limit, op = 'GREATER_THAN_OR_EQUAL') => fs(`/users/${auth.uid}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: 'recs' }],
      ...(since ? { where: { fieldFilter: { field: { fieldPath: 't' }, op, value: { timestampValue: since } } }, orderBy: [{ field: { fieldPath: 't' }, direction: 'ASCENDING' }] } : {}),
      limit
    }
  }).then(r => (Array.isArray(r) ? r : []).filter(x => x.document).map(x => x.document));

  /* ===== الرفع: كل سجل في الطابور يُقرأ من الجهاز ويُرسل كما هو الآن (أو كحذف إن لم يعد موجودًا) ===== */
  async function push() {
    let n = 0;
    while (true) {
      const keys = Object.keys(queue).slice(0, BATCH);
      if (!keys.length) return n;
      const snap = {}, writes = [];
      for (const q of keys) {
        snap[q] = queue[q];
        const [s, k] = q.split('\u0001');
        if (!SYNCED.includes(s) || (s === 'settings' && SKIP_SETTINGS.has(k))) continue;
        const v = await DB.get(s, k);
        writes.push({
          update: { name: `${root()}/recs/${encodeURIComponent(s + '~' + k)}`, fields: { s: { stringValue: s }, k: { stringValue: String(k) }, d: { stringValue: v === undefined ? '' : JSON.stringify(v) }, x: { booleanValue: v === undefined } } },
          updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }]
        });
      }
      if (writes.length) { const r = await fs(':commit', { writes }); lastCommit = r.commitTime || lastCommit; }
      keys.forEach(q => { if (queue[q] === snap[q]) delete queue[q]; }); // لا نحذف ما عُدّل أثناء الرفع
      ls.set(LS_Q, queue); n += writes.length;
    }
  }

  /* ===== السحب: ما تغيّر بعد آخر سجل استلمناه (التوقيت من الخادم لا من الأجهزة، فلا تؤثر فروق الساعات) ===== */
  async function apply(docs) {
    const items = [];
    for (const d of docs) {
      const f = d.fields || {}, s = f.s?.stringValue, k = f.k?.stringValue;
      if (!s || k === undefined || !SYNCED.includes(s) || (s === 'settings' && SKIP_SETTINGS.has(k))) continue;
      if (queue[qk(s, k)]) continue; // تعديل محلي أحدث ينتظر الرفع
      items.push({ s, k, del: !!f.x?.booleanValue, d: f.d?.stringValue || '' });
    }
    if (!items.length) return 0;
    const db = await DB.open(), stores = [...new Set(items.map(i => i.s))];
    return new Promise((res, rej) => {
      const tx = db.transaction(stores, 'readwrite'); quiet.add(tx);
      let n = 0;
      items.forEach(it => {
        const os = tx.objectStore(it.s), g = os.get(it.k);
        g.onsuccess = () => {
          const cur = g.result;
          if (it.del) { if (cur !== undefined) { os.delete(it.k); n++; } }
          else if (cur === undefined || JSON.stringify(cur) !== it.d) { try { os.put(JSON.parse(it.d)); n++; } catch (e) { console.warn('sync: سجل تالف', it.s, it.k); } }
        };
      });
      tx.oncomplete = () => res(n); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  async function pull(full = false) {
    const st = ls.get(LS_ST, {});
    const fresh = full || !st.lastT;
    let since = fresh ? '1970-01-01T00:00:00Z' : st.lastT, op = fresh ? 'GREATER_THAN_OR_EQUAL' : 'GREATER_THAN';
    let changed = 0, lastT = fresh ? null : st.lastT;
    for (let guard = 0; guard < 500; guard++) {
      const docs = await query(since, PAGE, op);
      op = 'GREATER_THAN_OR_EQUAL'; // الصفحات التالية تبدأ من آخر وقت (قد يتكرر بعضها ولا يضر)
      changed += await apply(docs);
      if (docs.length) lastT = docs[docs.length - 1].fields?.t?.timestampValue || lastT;
      if (docs.length < PAGE || !lastT || lastT === since) break;
      since = lastT;
    }
    ls.set(LS_ST, { ...ls.get(LS_ST, {}), lastT, lastOk: new Date().toISOString() });
    return changed;
  }

  /* ===== دورة المزامنة ===== */
  function schedule(ms = 1500) { clearTimeout(timer); timer = setTimeout(run, ms); }
  async function run() {
    if (!auth?.linkedAt || auth.expired || !configured()) return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) { lastErr = 'لا يوجد اتصال بالإنترنت — ستُرفع التغييرات عند عودته'; badge(); return; }
    busy = true; badge();
    try {
      await push();
      const n = await pull();
      lastErr = '';
      if (n) await onRemote(n);
    } catch (e) {
      lastErr = e.message || String(e);
      if (e instanceof AuthError) { auth.expired = true; ls.set(LS_AUTH, auth); }
      console.warn('sync:', e);
    } finally {
      busy = false; badge();
      if (again) { again = false; schedule(300); }
    }
  }
  async function onRemote(n) {
    if (typeof App === 'undefined' || !App.stack?.length) return;
    await App.load();
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (!document.querySelector('.sheet-wrap') && !typing && document.body.dataset.screen !== 'session') {
      const y = window.scrollY; await App.render(); window.scrollTo(0, y);
    }
    toast(`${ic('sync')} وصلت ${n} ${n === 1 ? 'تحديث' : 'تحديثات'} من أجهزتك الأخرى`, 'ok');
  }
  function badge() {
    const b = document.getElementById('sync-dot'); if (!b) return;
    b.className = !auth ? '' : busy ? 'busy' : lastErr ? 'err' : Object.keys(queue).length ? 'wait' : 'ok';
    b.title = !auth ? '' : busy ? 'تجري المزامنة…' : lastErr || (Object.keys(queue).length ? 'تغييرات تنتظر الرفع' : 'متزامن');
  }

  /* ===== الدخول وأول ربط للجهاز ===== */
  async function signIn(email, password) {
    if (!configured()) throw new Error('المزامنة غير مفعّلة في هذه النسخة');
    const { ok, j } = await post(`${C.authBase}/v1/accounts:signInWithPassword?key=${C.apiKey}`, { email, password, returnSecureToken: true });
    if (!ok) throw new Error(authMsg(j));
    const was = auth?.uid, linkedAt = was === j.localId ? auth.linkedAt : undefined;
    auth = { uid: j.localId, email: j.email || email, refresh: j.refreshToken, linkedAt };
    idTok = j.idToken; idExp = Date.now() + (+j.expiresIn || 3600) * 1000;
    if (was && was !== auth.uid) { queue = {}; ls.set(LS_ST, null); }
    ls.set(LS_AUTH, auth);
    return auth;
  }
  async function resetPassword(email) {
    const { ok, j } = await post(`${C.authBase}/v1/accounts:sendOobCode?key=${C.apiKey}`, { requestType: 'PASSWORD_RESET', email });
    if (!ok) throw new Error(authMsg(j));
  }
  async function queueAll() {
    const db = await DB.open();
    for (const s of SYNCED) {
      const keys = await new Promise(r => { const q = db.transaction(s).objectStore(s).getAllKeys(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); });
      keys.forEach(k => queue[qk(s, k)] = (queue[qk(s, k)] || 0) + 1);
    }
    ls.set(LS_Q, queue);
  }
  async function clearLocal() {
    const db = await DB.open();
    await new Promise((res, rej) => {
      const tx = db.transaction(SYNCED, 'readwrite'); quiet.add(tx);
      SYNCED.forEach(s => {
        const os = tx.objectStore(s);
        if (s !== 'settings') return os.clear();
        const q = os.getAllKeys(); q.onsuccess = () => q.result.forEach(k => { if (!SKIP_SETTINGS.has(k)) os.delete(k); });
      });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  /* mode: 'up' بيانات الجهاز إلى الحساب، 'down' بيانات الحساب إلى الجهاز، 'merge' الاثنان معًا */
  async function link(mode) {
    busy = true; badge();
    try {
      queue = {}; ls.set(LS_Q, queue); ls.set(LS_ST, null);
      if (mode === 'up' || mode === 'merge') await queueAll();
      if (mode === 'down') await clearLocal();
      const up = await push();
      let down = 0;
      if (mode === 'up') ls.set(LS_ST, { lastT: lastCommit, lastOk: new Date().toISOString() }); // الحساب كان فارغًا: لا داعي لقراءة ما رفعناه للتو
      else down = await pull(true);
      auth.linkedAt = new Date().toISOString(); delete auth.expired; ls.set(LS_AUTH, auth);
      lastErr = '';
      return { up, down };
    } finally { busy = false; badge(); }
  }
  async function cloudState() {
    const any = await query(null, 1);
    const [st, se, at] = await Promise.all([DB.all('students'), DB.all('sessions'), DB.all('attendance')]);
    return { cloud: any.length > 0, local: st.some(s => s.active !== false) || se.length > 0 || at.length > 0 };
  }
  function signOut() {
    auth = null; idTok = null; queue = {}; lastErr = '';
    ls.set(LS_AUTH, null); ls.set(LS_Q, null); ls.set(LS_ST, null); badge();
  }

  /* ===== التشغيل ===== */
  function start() {
    if (!configured()) return;
    setInterval(() => { if (document.visibilityState === 'visible') run(); }, POLL);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(200); });
    window.addEventListener('online', () => schedule(200));
    if (auth?.linkedAt) schedule(800);
  }

  return {
    configured, start, run, signIn, signOut, resetPassword, link, cloudState, badge,
    on: () => !!auth?.linkedAt,
    status: () => ({ email: auth?.email || '', linked: !!auth?.linkedAt, expired: !!auth?.expired, pending: Object.keys(queue).length, lastOk: ls.get(LS_ST, {})?.lastOk || null, busy, err: lastErr })
  };
})();

/* ===== شاشة «الحساب والمزامنة» ===== */
NAV_ROOT.sync = 'home';
Screens.sync = async (v) => {
  const st = Sync.status();
  const when = st.lastOk ? `${shortDate(st.lastOk.slice(0, 10))} ${new Date(st.lastOk).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}` : '—';
  const how = `<section class="card"><div class="card-h"><h3>${ic('info')} كيف تعمل</h3></div><ul class="sync-how">
      <li>سجّل الدخول بنفس الحساب في جوالك وتابلتك وأي جهاز آخر.</li>
      <li>كل ما تسجّله يُرفع تلقائيًا خلال ثوانٍ، والأجهزة الأخرى تستلمه عند فتح التطبيق وكل نصف دقيقة.</li>
      <li>بدون إنترنت يعمل التطبيق كالمعتاد، وتُرفع التغييرات عند عودة الاتصال.</li>
      <li>بياناتك في حسابك فقط ولا يستطيع أحد غيرك قراءتها. صور الشواهد تبقى في الجهاز الذي التُقطت فيه.</li></ul></section>`;
  if (!Sync.configured()) {
    v.innerHTML = topbar('الحساب والمزامنة') + `<div class="page"><div class="empty">${ic('cloud')}<h3>المزامنة لم تُفعّل بعد</h3><p>ستُفعّل في تحديث قادم.</p></div></div>`;
    return bindBack(v);
  }
  if (!st.linked || st.expired) {
    v.innerHTML = topbar('الحساب والمزامنة') + `<div class="page">
      ${st.expired ? `<div class="rs-warn">${ic('lock')}<div>انتهت جلسة الدخول في هذا الجهاز. سجّل دخولك مرة أخرى، ولن تُفقد التغييرات التي تنتظر الرفع (${st.pending}).</div></div>` : `<section class="card sync-hero"><div class="sync-hero-ic">${ic('sync')}</div><div><b>بياناتك على كل أجهزتك</b><small>سجّل الدخول بحساب فصلي ليتزامن جوالك وتابلتك تلقائيًا</small></div></section>`}
      <section class="card"><form class="sync-form" autocomplete="on">
        <label class="fld"><span>البريد الإلكتروني</span><input name="email" type="email" inputmode="email" autocomplete="username" dir="ltr" value="${esc(st.email)}" required></label>
        <label class="fld"><span>كلمة المرور</span><input name="pw" type="password" autocomplete="current-password" dir="ltr" required></label>
        <button class="btn primary block" type="submit" data-in>${ic('lock')} تسجيل الدخول</button>
        <button class="btn ghost block mt" type="button" data-forgot>نسيت كلمة المرور؟</button>
      </form></section>${how}</div>`;
    bindBack(v);
    const f = v.querySelector('.sync-form');
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('[data-in]'); btn.disabled = true; btn.innerHTML = 'جارٍ الدخول…';
      try {
        await Sync.signIn(f.email.value.trim(), f.pw.value); f.pw.value = '';
        if (Sync.on()) { await Sync.run(); toast(`${ic('check')} عادت المزامنة للعمل`, 'ok'); } else await syncLinkFlow();
      }
      catch (err) { toast(esc(err.message), 'bad'); }
      btn.disabled = false; App.render();
    };
    v.querySelector('[data-forgot]').onclick = async () => {
      const em = f.email.value.trim(); if (!em) return toast('اكتب بريدك أولًا', 'bad');
      try { await Sync.resetPassword(em); toast('أرسلنا رابط تغيير كلمة المرور إلى بريدك', 'ok'); } catch (err) { toast(esc(err.message), 'bad'); }
    };
    return;
  }
  v.innerHTML = topbar('الحساب والمزامنة') + `<div class="page">
    <section class="card sync-hero ${st.err ? 'err' : 'ok'}"><div class="sync-hero-ic">${ic(st.err ? 'alert' : 'check')}</div><div><b>${st.err ? 'المزامنة متوقفة مؤقتًا' : 'المزامنة تعمل'}</b><small dir="ltr">${esc(st.email)}</small></div></section>
    ${st.err ? `<div class="rs-warn">${ic('alert')}<div>${esc(st.err)}</div></div>` : ''}
    <div class="rep-tiles"><div><b>${st.pending}</b><small>تنتظر الرفع</small></div><div><b class="small">${when}</b><small>آخر مزامنة</small></div></div>
    <button class="btn primary block" data-now>${ic('sync')} مزامنة الآن</button>
    ${how}
    <button class="btn ghost block" data-out>تسجيل الخروج من هذا الجهاز</button>
    <p class="muted small center">الخروج يوقف المزامنة في هذا الجهاز فقط، وتبقى بياناته كما هي.</p></div>`;
  bindBack(v);
  v.querySelector('[data-now]').onclick = async e => { e.target.disabled = true; await Sync.run(); App.render(); };
  v.querySelector('[data-out]').onclick = async () => {
    if (!await confirmBox('تسجيل الخروج من هذا الجهاز؟<br><small>تبقى بياناتك في الجهاز وفي حسابك، وتتوقف المزامنة هنا فقط.</small>', { ok: 'خروج' })) return;
    Sync.signOut(); App.render();
  };
};

/* أول دخول في جهاز: نقرر اتجاه البيانات */
async function syncLinkFlow() {
  const { cloud, local } = await Sync.cloudState();
  let mode = !cloud ? 'up' : !local ? 'down' : null;
  if (!mode) mode = await choose('هذا الجهاز وحسابك فيهما بيانات', [
    { value: 'down', label: 'استخدم بيانات حسابي', sub: 'تُستبدل بيانات هذا الجهاز ببيانات أجهزتك الأخرى (أنصح بها)', icon: ic('cloud') },
    { value: 'merge', label: 'ادمج بيانات هذا الجهاز مع حسابي', sub: 'إذا استوردت الطلاب في الجهازين منفصلين قد يتكرر بعضهم', icon: ic('merge') }
  ]);
  if (!mode) { Sync.signOut(); return; }
  toast(mode === 'down' ? 'جارٍ تنزيل بياناتك…' : 'جارٍ رفع بياناتك…');
  const r = await Sync.link(mode);
  await App.load();
  toast(`${ic('check')} تم الربط — ${mode === 'down' ? `نُزّل ${r.down} سجلًا` : `رُفع ${r.up} سجلًا`}`, 'ok');
}

/* مدخل الشاشة: أعلى قائمة «المزيد» + نقطة حالة صغيرة */
const _moreScreen = Screens.more;
Screens.more = async v => {
  await _moreScreen(v);
  if (!Sync.configured()) return;
  const st = Sync.status();
  const list = v.querySelector('.menu-list');
  list?.insertAdjacentHTML('afterbegin', menuItem('sync', 'cloud', 'الحساب والمزامنة', st.linked ? `متزامن · ${st.email}` : 'بياناتك على جوالك وتابلتك معًا'));
  list?.querySelector('[data-go="sync"]')?.addEventListener('click', () => App.go('sync'));
};
document.addEventListener('DOMContentLoaded', () => {
  if (!Sync.configured()) return;
  const d = document.createElement('span'); d.id = 'sync-dot'; d.onclick = () => App.go('sync'); document.body.appendChild(d);
  Sync.badge(); Sync.start();
});
