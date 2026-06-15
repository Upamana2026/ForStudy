// backup.js — 進捗・科目データをブラウザ外のファイルへ保存して、閲覧データ削除でも残るようにする。
//
// 仕組み：
//  ・対応ブラウザ（Edge/Chrome 等）では File System Access API を使い、
//    一度選んだファイルへ「自動」で書き込み続ける。ファイルはブラウザの外にあるので
//    「閲覧データ削除」をしても消えない。再度アプリを開いてファイルを指定すれば復元できる。
//  ・ファイルハンドルは IndexedDB に保存して再読み込み後も自動同期を続ける。
//    （注：IndexedDB も閲覧データ削除で消えるため、削除後は一度だけ「復元」でファイルを選び直す）
//  ・非対応ブラウザ（iPhone/Safari 等）では、手動の「書き出し（DL）／読み込み」に自動で切替。

const Backup = (() => {
  const DB_NAME = "medaka_backup_db";
  const STORE = "handles";
  const HANDLE_KEY = "file";
  // バックアップ対象の localStorage キー（進捗・ユーザー科目・選択中科目）
  const KEYS = ["medaka_quiz_v1", "medaka_subjects_v1", "medaka_current_subject_v1"];
  const PROGRESS_KEY = "medaka_quiz_v1";

  const supported = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
  let handle = null;
  let writing = false, queued = false;

  // ---- IndexedDB でファイルハンドルを永続化 ----
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key, val) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbDel(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- データの直列化 / 復元 ----
  function collect() {
    const store = {};
    for (const k of KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) store[k] = v;
    }
    return { app: "medaka-quiz", format: 1, store };
  }
  function serialize() {
    return JSON.stringify(collect(), null, 2);
  }
  function applyData(data) {
    if (!data || typeof data !== "object" || !data.store) throw new Error("バックアップの形式が違います");
    for (const k of KEYS) {
      if (typeof data.store[k] === "string") localStorage.setItem(k, data.store[k]);
    }
  }
  function hasLocalProgress() {
    return !!localStorage.getItem(PROGRESS_KEY);
  }

  async function ensurePermission(h, write) {
    const opts = { mode: write ? "readwrite" : "read" };
    if ((await h.queryPermission(opts)) === "granted") return true;
    if ((await h.requestPermission(opts)) === "granted") return true;
    return false;
  }
  async function writeTo(h) {
    const w = await h.createWritable();
    await w.write(new Blob([serialize()], { type: "application/json" }));
    await w.close();
  }
  async function readFrom(h) {
    const file = await h.getFile();
    const text = await file.text();
    return text.trim() ? JSON.parse(text) : null;
  }

  return {
    supported,
    isLinked() { return !!handle; },
    fileName() { return handle ? handle.name : null; },

    // 起動時に呼ぶ。保存済みハンドルを復帰し、状況を返す。
    // 返り値 status: unsupported / none / needs-permission / restored / linked / error
    async init() {
      if (!supported) return { status: "unsupported" };
      try {
        const saved = await idbGet(HANDLE_KEY);
        if (!saved) return { status: "none" };
        handle = saved;
        if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
          return { status: "needs-permission" };
        }
        // localStorage が空（閲覧データ削除直後など）ならファイルから自動復元
        if (!hasLocalProgress()) {
          const data = await readFrom(handle);
          if (data) { applyData(data); return { status: "restored" }; }
        }
        return { status: "linked" };
      } catch (e) {
        return { status: "error", error: e };
      }
    },

    // ［自動モード］保存先ファイルを新規作成/選択し、現在のデータを書き出して以後自動保存する
    async setup() {
      const h = await window.showSaveFilePicker({
        suggestedName: "medaka-progress.json",
        types: [{ description: "メダカ勉強バックアップ", accept: { "application/json": [".json"] } }],
      });
      if (!(await ensurePermission(h, true))) throw new Error("書き込み許可が必要です");
      handle = h;
      await idbSet(HANDLE_KEY, h);
      await writeTo(h);
      return true;
    },

    // ［自動モード］既存のバックアップファイルを開いて復元し、以後の自動保存先にも設定する
    async restore() {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: "メダカ勉強バックアップ", accept: { "application/json": [".json"] } }],
      });
      if (!(await ensurePermission(h, true))) throw new Error("許可が必要です");
      const data = await readFrom(h);
      if (!data) throw new Error("ファイルが空です");
      applyData(data);
      handle = h;
      await idbSet(HANDLE_KEY, h);
      return true;
    },

    // 許可待ち（needs-permission）のハンドルをユーザー操作で再接続。復元したら true 内に restored を返す
    async reconnect() {
      if (!handle) return { ok: false };
      if (!(await ensurePermission(handle, true))) return { ok: false };
      if (!hasLocalProgress()) {
        const data = await readFrom(handle);
        if (data) { applyData(data); return { ok: true, restored: true }; }
      }
      return { ok: true, restored: false };
    },

    // データ変更のたびに呼ぶ。ファイルへ書き出す（多重呼び出しは直列化）。
    async sync() {
      if (!handle) return;
      if (writing) { queued = true; return; }
      writing = true;
      try {
        if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") await writeTo(handle);
      } catch (e) {
        /* 一時的な失敗は無視（次回 sync で再書き込み） */
      } finally {
        writing = false;
        if (queued) { queued = false; this.sync(); }
      }
    },

    // 自動保存先の解除（ファイル自体は消さない）
    async unlink() {
      handle = null;
      await idbDel(HANDLE_KEY);
    },

    // ---- 手動モード（非対応ブラウザ用フォールバック）----
    downloadFile() {
      const blob = new Blob([serialize()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "medaka-progress.json";
      a.click();
      URL.revokeObjectURL(url);
    },
    async importFile(file) {
      const text = await file.text();
      applyData(JSON.parse(text));
      return true;
    },
  };
})();

// localStorage 変更時に自動バックアップを走らせるためのフック。
// app.js / subjects.js から localStorage.setItem を呼ぶ箇所はこの後 Backup.sync() を呼ぶ。
