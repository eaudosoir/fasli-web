/* فصلي — قاعدة البيانات المحلية (IndexedDB) مع نظام إصدارات وترحيل */
'use strict';

const DB_NAME = 'fasli';
const DB_VERSION = 2; // ارفع الرقم وأضف خطوة في migrate() عند أي تغيير على البنية

const STORES = ['settings', 'classes', 'students', 'timetable', 'sessions', 'attendance',
  'homework', 'points', 'notes', 'contacts', 'grades', 'imports', 'remedial'];
/* الصور تُحفظ في مخزن مستقل ولا تدخل ملف النسخة الاحتياطية (حجمها كبير) — لها تصدير خاص */
const MEDIA_STORES = ['photos'];

function migrate(db, oldVersion, tx) {
  // كل خطوة تنفذ مرة واحدة فقط، ولا تحذف أي بيانات سابقة
  if (oldVersion < 1) {
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('classes', { keyPath: 'id' });
    const st = db.createObjectStore('students', { keyPath: 'id' });
    st.createIndex('classId', 'classId');
    db.createObjectStore('timetable', { keyPath: 'id' });
    const se = db.createObjectStore('sessions', { keyPath: 'id' });
    se.createIndex('date', 'date');
    const at = db.createObjectStore('attendance', { keyPath: 'id' });
    at.createIndex('date', 'date'); at.createIndex('studentId', 'studentId'); at.createIndex('classId', 'classId');
    for (const n of ['homework', 'points', 'notes', 'contacts', 'grades']) {
      const s = db.createObjectStore(n, { keyPath: 'id' });
      s.createIndex('studentId', 'studentId'); s.createIndex('date', 'date');
    }
    db.createObjectStore('imports', { keyPath: 'id' });
  }
  // الإصدار 2: صور الشواهد + الخطط العلاجية (إضافة فقط، لا يُمس أي مخزن سابق)
  if (oldVersion < 2) {
    const ph = db.createObjectStore('photos', { keyPath: 'id' });
    ph.createIndex('date', 'date'); ph.createIndex('perf', 'perf');
    const rm = db.createObjectStore('remedial', { keyPath: 'id' });
    rm.createIndex('studentId', 'studentId'); rm.createIndex('date', 'date');
  }
}

const DB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = e => migrate(r.result, e.oldVersion, r.transaction);
      r.onsuccess = () => { this._db = r.result; res(this._db); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('قاعدة البيانات مشغولة، أغلق النسخ الأخرى من التطبيق'));
    });
  },
  async _tx(stores, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      let out;
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
      out = fn(t);
    });
  },
  _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(store, id) {
    const db = await this.open();
    return this._req(db.transaction(store).objectStore(store).get(id));
  },
  async all(store) {
    const db = await this.open();
    return this._req(db.transaction(store).objectStore(store).getAll());
  },
  async byIndex(store, index, value) {
    const db = await this.open();
    return this._req(db.transaction(store).objectStore(store).index(index).getAll(value));
  },
  async range(store, index, from, to) {
    const db = await this.open();
    return this._req(db.transaction(store).objectStore(store).index(index).getAll(IDBKeyRange.bound(from, to)));
  },
  put(store, obj) { return this._tx([store], 'readwrite', t => { t.objectStore(store).put(obj); return obj; }); },
  putMany(store, arr) { return this._tx([store], 'readwrite', t => { const s = t.objectStore(store); arr.forEach(o => s.put(o)); return arr.length; }); },
  del(store, id) { return this._tx([store], 'readwrite', t => { t.objectStore(store).delete(id); }); },
  clear(store) { return this._tx([store], 'readwrite', t => { t.objectStore(store).clear(); }); },

  async getSetting(key, def) { const r = await this.get('settings', key); return r === undefined ? def : r.value; },
  setSetting(key, value) { return this.put('settings', { key, value }); },

  /* نسخة احتياطية: كل البيانات ما عدا الرمز السري وأي بيانات دخول */
  async exportAll() {
    const data = {};
    for (const s of STORES) data[s] = await this.all(s);
    data.settings = data.settings.filter(x => !SECRET_KEYS.includes(x.key));
    return { app: 'fasli', format: 1, dbVersion: DB_VERSION, exportedAt: new Date().toISOString(), data };
  },
  async importAll(backup) {
    if (!backup || backup.app !== 'fasli' || !backup.data) throw new Error('الملف ليس نسخة احتياطية من فصلي');
    if (backup.dbVersion > DB_VERSION) throw new Error('النسخة الاحتياطية من إصدار أحدث من التطبيق، حدّث فصلي أولاً');
    const keep = [];
    for (const k of SECRET_KEYS) { const v = await this.get('settings', k); if (v) keep.push(v); }
    await this._tx(STORES, 'readwrite', t => {
      for (const s of STORES) {
        const os = t.objectStore(s); os.clear();
        (backup.data[s] || []).forEach(o => { if (!(s === 'settings' && SECRET_KEYS.includes(o.key))) os.put(o); });
      }
      keep.forEach(o => t.objectStore('settings').put(o));
    });
  }
};
const SECRET_KEYS = ['pinHash', 'pinSalt', 'madrasatiCreds'];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
