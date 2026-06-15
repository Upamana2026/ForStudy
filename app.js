// app.js — 進捗管理・出題フロー・科目管理・水槽との連携

const KEY = "medaka_quiz_v1";
let state = { correct: 0, answered: 0, streak: 0, best: 0, bornCount: 1, fishSeq: 0, fish: null };
let current = null;
let locked = false;
let pendingQuestions = null; // 追加待ちの取り込み結果

const MAX_FISH = 15;
const GOLDFISH = ["demekin", "comet", "panda", "pingpong", "ranchu"];
const SPECIES_NAME = {
  medaka: "メダカ",
  demekin: "出目金",
  comet: "コメット",
  panda: "パンダ出目金",
  pingpong: "ピンポンパール",
  ranchu: "ランチュウ",
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) state = { ...state, ...s };
  } catch (e) { /* 初回はそのまま */ }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// --- メダカの増殖・成長ルール（科目に関係なく共通の正解数で決まる） ---
// k匹目が生まれる累積正解数: 10 * (k-1)*k/2  → 1匹:0, 2匹:10, 3匹:30, 4匹:60, ...
function fishBornAt(k) { return 10 * ((k - 1) * k / 2); }
function fishCount(correct) {
  let k = 1;
  while (fishBornAt(k + 1) <= correct) k++;
  return k;
}
function nextFishAt(correct) { return fishBornAt(fishCount(correct) + 1); }
function ageToStage(age) {
  if (age >= 24) return 3;
  if (age >= 12) return 2;
  if (age >= 5) return 1;
  return 0;
}
// --- 魚の実体管理（種類・15匹上限・卒業） ---
function nextFishId() {
  state.fishSeq = (state.fishSeq || 0) + 1;
  return state.fishSeq;
}
function rollSpecies() {
  return Math.random() < 0.30 ? pick(GOLDFISH) : "medaka";
}

// 保存データに魚の名簿が無い場合の初期化／移行
function ensureRoster() {
  if (Array.isArray(state.fish)) return;
  const total = fishCount(state.correct);
  state.bornCount = total;
  state.fishSeq = 0;
  state.fish = [];
  const keep = Math.min(MAX_FISH, total);
  for (let k = total - keep + 1; k <= total; k++) {
    state.fish.push({ id: nextFishId(), species: "medaka", bornAt: fishBornAt(k) });
  }
  if (state.fish.length === 0) {
    state.fish.push({ id: nextFishId(), species: "medaka", bornAt: 0 });
    state.bornCount = 1;
  }
}

// 1匹誕生。上限超過なら成魚を1匹卒業させる。{born, graduated} を返す
function spawnFish(correct) {
  state.bornCount++;
  const baby = { id: nextFishId(), species: rollSpecies(), bornAt: correct };
  state.fish.push(baby);
  let graduated = null;
  if (state.fish.length > MAX_FISH) {
    const grown = state.fish.filter((x) => x.id !== baby.id && ageToStage(correct - x.bornAt) >= 3);
    let victim;
    if (grown.length) victim = pick(grown);
    else victim = state.fish.filter((x) => x.id !== baby.id).sort((a, b) => a.bornAt - b.bornAt)[0];
    state.fish = state.fish.filter((x) => x.id !== victim.id);
    graduated = victim.species;
  }
  return { born: baby.species, graduated };
}

// 現在の名簿を水槽用のspecsに変換
function rosterSpecs() {
  return state.fish.map((f) => ({ stage: ageToStage(state.correct - f.bornAt), species: f.species }));
}

function specsFor(correct) {
  const n = fishCount(correct);
  const arr = [];
  for (let k = 1; k <= n; k++) arr.push({ stage: ageToStage(correct - fishBornAt(k)) });
  return arr;
}

function updateStats() {
  document.getElementById("stat-correct").textContent = state.correct;
  document.getElementById("stat-answered").textContent = state.answered;
  document.getElementById("stat-fish").textContent = state.fish ? state.fish.length : fishCount(state.correct);
  document.getElementById("stat-next").textContent = nextFishAt(state.correct) - state.correct;
  document.getElementById("stat-streak").textContent = state.streak;
}

function currentSubject() {
  return getSubject(getCurrentSubjectId());
}
function refreshSubjectName() {
  document.getElementById("current-subject-name").textContent = currentSubject().name;
}

function newQuestion() {
  locked = false;
  current = getQuestionFor(currentSubject());
  document.getElementById("question").textContent = current.question;
  const box = document.getElementById("choices");
  box.innerHTML = "";
  const fb = document.getElementById("feedback");
  fb.textContent = "";
  fb.className = "feedback";
  current.choices.forEach((c) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = c;
    b.onclick = () => answer(c, b);
    box.appendChild(b);
  });
  document.getElementById("next").style.visibility = "hidden";
}

function answer(choice, btn) {
  if (locked) return;
  locked = true;
  const correct = String(choice) === String(current.answer);
  const fb = document.getElementById("feedback");

  document.querySelectorAll(".choice").forEach((b) => {
    b.disabled = true;
    if (String(b.textContent) === String(current.answer)) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });

  state.answered++;
  if (correct) {
    state.correct++;
    state.streak++;
    state.best = Math.max(state.best, state.streak);

    // 累積正解数に応じて必要なだけ誕生させる
    const target = fishCount(state.correct);
    let born = null, graduated = null;
    while (state.bornCount < target) {
      const r = spawnFish(state.correct);
      born = r.born;
      if (r.graduated) graduated = r.graduated;
    }

    Aquarium.feed(2);
    Aquarium.setPopulation(rosterSpecs());

    if (graduated) {
      fb.textContent = `正解！🎓 ${SPECIES_NAME[graduated]}が旅に出ました！代わりに新しい仲間が誕生`;
    } else if (born) {
      fb.textContent = born === "medaka"
        ? "正解！🎉 新しいメダカが仲間入り！"
        : `正解！🎉✨ ${SPECIES_NAME[born]}が現れた！`;
    } else {
      fb.textContent = "正解！🐟 餌をあげました";
    }
    fb.className = "feedback ok";
  } else {
    state.streak = 0;
    fb.textContent = "不正解… 正解は " + current.answer;
    fb.className = "feedback ng";
  }
  save();
  updateStats();
  document.getElementById("next").style.visibility = "visible";
}

// --- 科目モーダル ---
function renderSubjectList() {
  const ul = document.getElementById("subject-list");
  ul.innerHTML = "";
  const curId = getCurrentSubjectId();
  allSubjects().forEach((s) => {
    const li = document.createElement("li");
    const count = s.type === "bank" ? `（${s.questions.length}問）` : "（自動生成）";
    const isCur = s.id === curId;

    const label = document.createElement("span");
    label.className = "subj-name";
    label.textContent = s.name + " " + count + (isCur ? "  ✓選択中" : "");

    const selBtn = document.createElement("button");
    selBtn.textContent = isCur ? "選択中" : "選択";
    selBtn.disabled = isCur;
    selBtn.onclick = () => {
      setCurrentSubjectId(s.id);
      refreshSubjectName();
      newQuestion();
      renderSubjectList();
    };

    li.appendChild(label);
    li.appendChild(selBtn);

    if (!s.builtin) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.className = "del";
      delBtn.onclick = () => {
        if (confirm(`科目「${s.name}」を削除しますか？`)) {
          deleteSubject(s.id);
          refreshSubjectName();
          newQuestion();
          renderSubjectList();
        }
      };
      li.appendChild(delBtn);
    }
    ul.appendChild(li);
  });
}

function openModal() {
  document.getElementById("import-msg").textContent = "";
  document.getElementById("new-subject-name").value = "";
  document.getElementById("new-subject-file").value = "";
  pendingQuestions = null;
  renderSubjectList();
  document.getElementById("subject-modal").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("subject-modal").classList.add("hidden");
}

async function onFileChosen(e) {
  const msg = document.getElementById("import-msg");
  const file = e.target.files[0];
  pendingQuestions = null;
  if (!file) return;
  try {
    const qs = await importFile(file);
    if (qs.length === 0) {
      msg.textContent = "⚠ 問題を読み取れませんでした。1列目=問題、2列目=正解になっているか確認してください。";
      msg.className = "import-msg ng";
      return;
    }
    pendingQuestions = qs;
    msg.textContent = `✓ ${qs.length}問 読み取りました。科目名を入れて「追加」を押してください。`;
    msg.className = "import-msg ok";
    // 科目名が空ならファイル名を初期値に
    const nameInput = document.getElementById("new-subject-name");
    if (!nameInput.value.trim()) nameInput.value = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
  } catch (err) {
    msg.textContent = "⚠ " + err.message;
    msg.className = "import-msg ng";
  }
}

function onAddSubject() {
  const msg = document.getElementById("import-msg");
  const name = document.getElementById("new-subject-name").value.trim();
  if (!name) { msg.textContent = "⚠ 科目名を入力してください。"; msg.className = "import-msg ng"; return; }
  if (!pendingQuestions || pendingQuestions.length === 0) {
    msg.textContent = "⚠ 先にCSV/Excelファイルを選んでください。";
    msg.className = "import-msg ng";
    return;
  }
  const subj = createSubject(name, pendingQuestions);
  setCurrentSubjectId(subj.id);
  refreshSubjectName();
  newQuestion();
  pendingQuestions = null;
  document.getElementById("new-subject-name").value = "";
  document.getElementById("new-subject-file").value = "";
  msg.textContent = `✓ 科目「${name}」を追加して選択しました。`;
  msg.className = "import-msg ok";
  renderSubjectList();
}

window.addEventListener("DOMContentLoaded", () => {
  load();
  ensureRoster();
  Aquarium.init(document.getElementById("tank"));
  Aquarium.setPopulation(rosterSpecs());
  updateStats();
  refreshSubjectName();
  newQuestion();

  document.getElementById("next").onclick = newQuestion;
  document.getElementById("reset").onclick = () => {
    if (confirm("進捗をリセットしますか？（メダカは1匹に戻ります。科目は消えません）")) {
      state = { correct: 0, answered: 0, streak: 0, best: 0, bornCount: 1, fishSeq: 0, fish: null };
      ensureRoster();
      save();
      Aquarium.setPopulation(rosterSpecs());
      updateStats();
      newQuestion();
    }
  };

  document.getElementById("open-subjects").onclick = openModal;
  document.getElementById("close-subjects").onclick = closeModal;
  document.getElementById("subject-modal").onclick = (e) => {
    if (e.target.id === "subject-modal") closeModal();
  };
  document.getElementById("new-subject-file").onchange = onFileChosen;
  document.getElementById("add-subject").onclick = onAddSubject;
  document.getElementById("download-template").onclick = (e) => {
    e.preventDefault();
    downloadTemplate();
  };
});
