// subjects.js — 科目（勉強する項目）の管理と、CSV/Excelファイルからの取り込み
// ・組み込み科目「FE試験科目B基礎」は quiz.js のコードで無限生成（procedural）
// ・ユーザーが追加した科目は localStorage に保存（bank: 問題と正解の一覧）
// ・進捗（正解数・メダカ）は科目に関係なく共通。正解すれば科目を問わず1カウント。

const SUBJECTS_KEY = "medaka_subjects_v1";
const CURRENT_KEY = "medaka_current_subject_v1";
const BUILTIN_ID = "fe-b-basic";

const BUILTIN_SUBJECTS = [
  { id: BUILTIN_ID, name: "FE試験科目B基礎", type: "procedural", builtin: true, gen: generateQuestion },
  { id: "fe-b-oop", name: "FE試験科目Bオブジェクト指向", type: "procedural", builtin: true, gen: generateOOPQuestion },
  { id: "fe-b-bit", name: "FE試験科目Bビット操作", type: "procedural", builtin: true, gen: generateBitQuestion },
  // 例外的な組み込み科目（台湾華語）: 単語＋ピンインを出題し、日本語を4択で選ぶ
  { id: "taiwan-hua", name: "台湾華語", type: "bank", builtin: true, questions: typeof TAIWAN_HUA_QUESTIONS !== "undefined" ? TAIWAN_HUA_QUESTIONS : [] },
];

function loadUserSubjects() {
  try { return JSON.parse(localStorage.getItem(SUBJECTS_KEY)) || []; }
  catch (e) { return []; }
}
function saveUserSubjects(list) {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(list));
  if (typeof Backup !== "undefined") Backup.sync();
}
function allSubjects() {
  return [...BUILTIN_SUBJECTS, ...loadUserSubjects()];
}
function getSubject(id) {
  return allSubjects().find((s) => s.id === id) || BUILTIN_SUBJECTS[0];
}
function getCurrentSubjectId() {
  const id = localStorage.getItem(CURRENT_KEY) || BUILTIN_ID;
  // 削除済みのIDが残っていたら組み込みに戻す
  return allSubjects().some((s) => s.id === id) ? id : BUILTIN_ID;
}
function setCurrentSubjectId(id) {
  localStorage.setItem(CURRENT_KEY, id);
  if (typeof Backup !== "undefined") Backup.sync();
}
function makeId() {
  return "subj-" + Math.random().toString(36).slice(2, 9);
}

// 科目作成（questions: [{question, answer}]）
function createSubject(name, questions) {
  const list = loadUserSubjects();
  const subj = { id: makeId(), name, type: "bank", builtin: false, questions };
  list.push(subj);
  saveUserSubjects(list);
  return subj;
}
function deleteSubject(id) {
  saveUserSubjects(loadUserSubjects().filter((s) => s.id !== id));
  if (localStorage.getItem(CURRENT_KEY) === id) setCurrentSubjectId(BUILTIN_ID);
}

// 1問取得（科目の種類で振り分け）
function getQuestionFor(subject) {
  if (subject.type === "procedural") return (subject.gen || generateQuestion)();
  return buildBankQuestion(subject.questions);
}

// 問題集型: ランダムに1問選んで4択化
// 誤答は「その問題に指定された誤答（CSV 3〜5列目）」を優先し、
// 足りない分だけ他の問題の答えから補充する（よくある誤答と正解を並べるため）。
function buildBankQuestion(pool) {
  const item = pool[Math.floor(Math.random() * pool.length)];
  const answer = String(item.answer);
  const seen = new Set([answer]);
  const wrong = [];

  // 1) この問題に指定された誤答を優先
  for (const d of (item.distractors || [])) {
    const v = String(d).trim();
    if (v && !seen.has(v)) { seen.add(v); wrong.push(v); }
  }

  // 2) 3つに満たなければ、他の問題の答えから補充
  if (wrong.length < 3) {
    const others = [];
    for (const q of pool) {
      const a = String(q.answer);
      if (!seen.has(a)) { seen.add(a); others.push(a); }
    }
    shuffle(others);
    for (const a of others) {
      if (wrong.length >= 3) break;
      wrong.push(a);
    }
  }

  const choices = shuffle([answer, ...wrong.slice(0, 3)]);
  return { question: String(item.question), answer, choices };
}

// ---- ファイル解析 ----

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM除去
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function isHeaderRow(row) {
  return /問題|問い|質問|question/i.test(row[0] || "") ||
         /回答|正解|答え|answer/i.test(row[1] || "");
}

// 2次元配列 → [{question, answer, distractors?}]
// 1列目=問題, 2列目=正解, 3〜5列目=指定の誤答選択肢（任意・空欄可）
function rowsToQuestions(rows) {
  const out = [];
  let start = rows.length && isHeaderRow(rows[0]) ? 1 : 0;
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    const q = String(row[0] ?? "").trim();
    const a = String(row[1] ?? "").trim();
    if (!q || !a) continue;
    const distractors = [];
    for (let c = 2; c <= 4; c++) {
      const d = String(row[c] ?? "").trim();
      if (d) distractors.push(d);
    }
    out.push(distractors.length ? { question: q, answer: a, distractors } : { question: q, answer: a });
  }
  return out;
}

function parseExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return rows.map((r) => r.map((c) => String(c)));
}

// File → [{question, answer}]
async function importFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return rowsToQuestions(parseCSV(await file.text()));
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return rowsToQuestions(parseExcel(await file.arrayBuffer()));
  }
  throw new Error("対応していない形式です。CSV か Excel(.xlsx) を選んでください。");
}

// CSVテンプレートを生成してダウンロード
function downloadTemplate() {
  const sample =
    "問題,正解,誤答1,誤答2,誤答3\n" +
    "日本の首都は？,東京,大阪,京都,\n" +
    "1+1=？,2,3,,\n" +
    "\"複数行や,カンマを含む場合は\nダブルクォートで囲みます\",サンプル,,,\n";
  const blob = new Blob(["﻿" + sample], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "問題テンプレート.csv";
  a.click();
  URL.revokeObjectURL(url);
}
