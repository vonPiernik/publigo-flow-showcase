const TYPE_META = {
  start:    { label: "start",       color: "var(--c-start)",  icon: "🚀" },
  agent:    { label: "agent",       color: "var(--c-agent)",  icon: "🤖" },
  user_input: { label: "bramka (user_input)", color: "var(--c-gate)", icon: "🧑‍⚖️" },
  action:   { label: "akcja",       color: "var(--c-action)", icon: "⚡" },
  end:      { label: "end",         color: "var(--c-end)",    icon: "🏁" },
};

const NODES = [
  {
    id: "start", type: "start", label: "Start",
    desc: "Użytkownik opisuje task własnymi słowami albo podaje istniejący klucz Jira. Źródło runa decyduje o pierwszej krawędzi.",
    output: { source: "prompt", input: "Poprawić komunikat błędu przy logowaniu na mobile — użytkownik nie wie, co wpisać źle." },
    branches: [
      { when: "context.source == 'jira'", text: "→ Jira (istniejący task): import" },
      { when: "context.source == 'prompt'", text: "→ doprecyzowanie (nowy task)" },
    ],
    alt: {
      label: "Jira (istniejący task)", action: "jira.import",
      text: "albo zamiast „doprecyzowanie + Jira”: import istniejącego taska (context.source == 'jira') → prosto do kodowania",
      output: { action: "jira.import", jira_key: "PUB-98", title: "Błąd logowania na mobile", status: "In Progress" },
    },
    details: {
      note: "Kolejność krawędzi z definicji wygrywa pierwszy pasujący warunek; ostatnia krawędź bez `when` to fallback (wsteczna zgodność).",
    },
  },
  {
    id: "clarify", type: "agent", label: "Doprecyzowanie",
    desc: "Agent zamienia luźny opis w mały, jednoznaczny task do Jiry — jedno pytanie naraz, bez narzucania rozwiązań.",
    output: {
      verdict: "needs_fix",
      question: "Na którym ekranie dokładnie pojawia się błąd — logowanie czy reset hasła?",
      confidence: "high",
      summary: "Opis zawiera rozwiązanie zamiast problemu i brakuje kontekstu technicznego (GO/BOX).",
      task: null,
    },
    branches: [
      { when: "output.verdict == 'needs_fix'", text: "→ pytanie AI", loop: "pętla max 12" },
      { when: "output.verdict == 'success'", text: "→ utwórz task w Jirze" },
    ],
    details: {
      prompt: "Doprowadź do powstania MAŁEGO taska: tytuł w formie akcji, opisuje problem (nie rozwiązanie), jednoznaczny, sprawdzalny, w jednym małym zakresie, nadaje się do CR.\n\n- zadawaj JEDNO konkretne pytanie naraz\n- ustal typ taska: feature albo hotfix (git flow)\n- środowisko jest zawsze produkcyjne\n- przy success: answer.md + .agent/task.json (task_output)",
      vars: ["{{run.input}}", "{{run.history}}", "{{run.feedback}}"],
      note: "worktree: false — dialog bez repo; przy werdykcie success zapisuje .agent/task.json.",
    },
  },
  {
    id: "clarify_q", type: "user_input", label: "Pytanie AI",
    desc: "Agent dopytuje o jeden szczegół taska — użytkownik odpowiada poniżej, odpowiedź wraca do agenta verbatim.",
    output: { decision: "answer", answer: "Błąd pojawia się po wpisaniu błędnego hasła na ekranie logowania (Android 14, Chrome)." },
    branches: [
      { when: "output.decision == 'answer'", text: "→ wróć do doprecyzowania", loop: "clarify ×12" },
    ],
    details: {
      prompt: "Agent dopytuje o jeden szczegół taska — odpowiedz poniżej.",
      options: [{ key: "answer", label: "Odpowiedz → dalej" }],
    },
  },
  {
    id: "jira_create", type: "action", label: "Jira",
    desc: "Akcja tworzy task w Jirze na podstawie doprecyzowanego opisu (klucz ląduje potem w smart commitach).",
    output: { action: "jira.create_issue", jira_key: "PUB-142", url: "https://jira.example/browse/PUB-142", status: "To Do" },
    branches: [{ text: "→ kodowanie" }],
    details: { action: "jira.create_issue" },
  },
  {
    id: "code", type: "agent", label: "Kodowanie",
    desc: "Agent realizuje task w worktree: minimalny diff, commit na branchu z kluczem Jiry (smart commit), bez pusha.",
    output: {
      branch: "feature/PUB-142",
      commits: ["a1b2c3d PUB-142: ujednolicony komunikat błędu logowania"],
      changed_files: ["src/Auth/LoginForm.php", "tests/Auth/LoginFormTest.php"],
      summary: "Minimalny diff: komunikat błędu bez podpowiedzi, który element formularza jest błędny.",
      confidence: "medium",
    },
    branches: [{ text: "→ draft PR" }],
    details: {
      prompt: "Minimalny, skupiony diff realizujący zadanie. Żadnych zmian pobocznych.\n\nCommituj na branchu (bez [skip ci]), NIE pushuj. Klucz Jiry w komunikacie commita. Pamięć między turami: .agent/notes.md",
      vars: ["{{run.jira_key}}", "{{repo.slug}}", "{{run.branch}}", "{{run.feedback}}", "{{run.summary}}", "{{run.changed_files}}"],
    },
  },
  {
    id: "pr_create", type: "action", label: "draft PR",
    desc: "Akcja otwiera draft PR w Bitbucket. Gdy branch nie ma zmian względem targetu — run leci od razu do zamknięcia taska.",
    output: { action: "pr.create", pr_url: "https://bitbucket.example/projects/PUB/repos/app/pull-requests/17", draft: true },
    branches: [
      { when: "output.no_changes == 'true'", text: "→ od razu zamknij Jirę (bez PR)" },
      { text: "→ review człowieka" },
    ],
    details: {
      action: "pr.create",
      altOutput: { action: "pr.create", no_changes: "true", reason: "Brak zmian względem brancha docelowego" },
    },
  },
  {
    id: "review", type: "user_input", label: "Review człowieka",
    desc: "Zmiany z taska są gotowe — człowiek patrzy na odpowiedź agenta i zakładkę Diff, potem decyduje.",
    output: { decision: "accept" },
    branches: [
      { when: "output.decision == 'accept'", text: "→ security review" },
      { when: "output.decision == 'comments'", text: "→ wróć do kodowania z komentarzem", loop: true },
    ],
    details: {
      prompt: "Zmiany z taska są gotowe — zobacz odpowiedź agenta i zakładkę Diff.",
      options: [
        { key: "accept", label: "Akceptuj → security review" },
        { key: "comments", label: "Wróć do kodowania z komentarzem" },
      ],
      altOutput: { decision: "comments", feedback: "Dodaj test dla przypadku pustego pola hasła." },
    },
  },
  {
    id: "sec_review", type: "agent", label: "Sec review",
    desc: "Agent security przegląda diff względem brancha bazowego i zwraca raport — bez modyfikowania kodu.",
    output: {
      verdict: "success",
      findings: [],
      confidence: "high",
      summary: "Brak istotnych ustaleń — diff nie dotyka autoryzacji ani danych wrażliwych.",
    },
    branches: [{ text: "→ bramka sec" }],
    details: {
      prompt: "Przejrzyj diff względem brancha bazowego i oceń ryzyko bezpieczeństwa. NIE modyfikuj kodu — to tylko raport. Odpowiedź w result.json: verdict, findings[], confidence, summary.",
      checks: ["SQL injection", "XSS", "CSRF", "autoryzacja", "sekrety w kodzie", "path traversal", "SSRF", "rate limiting", "CVE w zależnościach"],
      vars: ["{{run.diff_stat}}", "{{run.diff}}", "{{run.jira_key}}"],
      altOutput: {
        verdict: "needs_fix",
        findings: ["src/Auth/LoginForm.php:42 — komunikat błędu ujawnia, czy login istnieje — ujednolić komunikat"],
        confidence: "medium",
        summary: "1 ustalenie do poprawy przed merge.",
      },
    },
  },
  {
    id: "sec_gate", type: "user_input", label: "Bramka sec",
    desc: "Człowiek widzi raport security review i decyduje. Przy braku ustaleń i wysokiej pewności bramka może zostać auto-pominięta.",
    output: { decision: "accept" },
    branches: [
      { when: "output.decision == 'accept'", text: "→ scenariusze manualki" },
      { when: "output.decision == 'comments'", text: "→ wróć do security review z komentarzem", loop: true },
    ],
    details: {
      prompt: "Powyżej raport security review — zobacz ustalenia i zdecyduj.",
      options: [
        { key: "accept", label: "Scenariusze manualki →" },
        { key: "comments", label: "Wróć do security review z komentarzem" },
      ],
      skipWhen: ["output.verdict == 'success'", "output.confidence == 'high'", "empty(output.findings)"],
      note: "auto-skip TYLKO przy naprawdę pustej tablicy findings i wysokiej pewności — przy jakichkolwiek uwagach bramka zostaje.",
    },
  },
  {
    id: "manual_scenarios", type: "agent", label: "Scenariusze manualki",
    desc: "Agent przygotowuje konkretne scenariusze testów manualnych na instalce dev — bez ruszania kodu.",
    output: {
      verdict: "success",
      summary: "3 scenariusze manualne na instalce dev, w tym przypadki brzegowe.",
      scenarios: [
        {
          title: "Błędne hasło",
          steps: ["Otwórz /login", "Wpisz poprawny login i błędne hasło", "Kliknij „Zaloguj się”"],
          expected: "Komunikat „Nieprawidłowe dane logowania” bez podpowiedzi, które pole jest błędne",
        },
      ],
      answer: "# Scenariusze testów manualnych\n1. Błędne hasło → oczekiwany komunikat...",
      confidence: "high",
    },
    branches: [{ text: "→ bramka scenariuszy" }],
    details: {
      prompt: "Przygotuj konkretne scenariusze testów manualnych (tytuł, kroki w UI + dane testowe, oczekiwany wynik). Uwzględnij przypadki brzegowe i ustalenia z security review. NIE modyfikuj kodu.",
      vars: ["{{run.diff}}", "{{run.task_ac}}", "{{run.security_review}}"],
      note: "Odpowiedź: result.json {verdict, summary, scenarios[], answer} — answer (markdown) ląduje w bramce, którą widzi user.",
    },
  },
  {
    id: "scenarios_gate", type: "user_input", label: "Scenariusze manualki (bramka)",
    desc: "Użytkownik przegląda scenariusze od agenta — akceptuje albo dopisuje uwagi, które wracają do agenta.",
    output: { decision: "accept" },
    branches: [
      { when: "output.decision == 'accept'", text: "→ instalka dev" },
      { when: "output.decision == 'comments'", text: "→ popraw scenariusze", loop: true },
    ],
    details: {
      prompt: "Powyżej scenariusze testów manualnych od agenta — przejrzyj i zaakceptuj albo dopisz uwagi.",
      options: [
        { key: "accept", label: "OK → instalka dev" },
        { key: "comments", label: "Popraw scenariusze → wróć do agenta" },
      ],
    },
  },
  {
    id: "env_deploy", type: "action", label: "Instalka dev",
    desc: "Akcja wystawia zmiany na instalce dev — link „instalka” u góry runa, jeśli została wystawiona.",
    output: { action: "env.deploy", env: "dev", url: "https://dev.publigo.example", status: "deployed", build: "a1b2c3d" },
    branches: [{ text: "→ test manualny" }],
    details: { action: "env.deploy" },
  },
  {
    id: "manual_test", type: "user_input", label: "Test manualny",
    desc: "Użytkownik wykonuje scenariusze agenta na instalce dev i potwierdza wynik — albo wraca do kodowania.",
    output: { decision: "confirm", note: "Wszystkie 3 scenariusze przeszły zgodnie z oczekiwaniami." },
    branches: [
      { when: "output.decision == 'confirm'", text: "→ otwórz PR" },
      { when: "output.decision == 'comments'", text: "→ wróć do kodowania z komentarzem", loop: true },
    ],
    details: {
      prompt: "Przetestuj ręcznie wdrożenie tych zmian według scenariuszy agenta (blok „scenariusze manualki” powyżej).",
      options: [
        { key: "confirm", label: "Przetestowane OK → otwórz PR" },
        { key: "comments", label: "Coś nie działa → wróć do kodowania z komentarzem" },
      ],
    },
  },
  {
    id: "pr_open", type: "action", label: "PR open",
    desc: "Akcja otwiera PR (wychodzi z draftu) — dalej czeka na code review zespołu w Bitbucket.",
    output: { action: "pr.open", pr_url: "https://bitbucket.example/projects/PUB/repos/app/pull-requests/17", draft: false },
    branches: [{ text: "→ bramka PR (CR zespołu)" }],
    details: { action: "pr.open" },
  },
  {
    id: "pr_gate", type: "user_input", label: "Bramka PR (CR zespołu)",
    desc: "PR jest otwarty i czeka na CR zespołu w Bitbucket — człowiek śledzi status i decyduje o merge.",
    output: { decision: "accept", note: "CR zespołu: 2 approves, bez komentarzy blokujących." },
    branches: [
      { when: "output.decision == 'accept'", text: "→ merge + zamknij Jirę" },
      { when: "output.decision == 'comments'", text: "→ wróć do kodowania z komentarzem", loop: true },
    ],
    details: {
      prompt: "PR jest otwarty i czeka na CR zespołu w Bitbucket.",
      options: [
        { key: "accept", label: "Idź dalej → merge + zamknij Jirę" },
        { key: "comments", label: "Wróć do kodowania z komentarzem" },
      ],
    },
  },
  {
    id: "pr_merge", type: "action", label: "Merge",
    desc: "Akcja merguje PR do brancha docelowego i usuwa branch feature.",
    output: { action: "pr.merge", merged: true, commit: "f4e5d6c", branch_deleted: true },
    branches: [{ text: "→ zamknij Jirę" }],
    details: { action: "pr.merge" },
  },
  {
    id: "jira_done", type: "action", label: "Jira done",
    desc: "Akcja przestawia task w Jirze na Done — koniec runa.",
    output: { action: "jira.transition", jira_key: "PUB-142", status: "Done" },
    branches: [{ text: "→ koniec" }],
    details: { action: "jira.transition" },
  },
  {
    id: "done", type: "end", label: "Koniec",
    desc: "Koniec przepływu — task zamknięty, wszystkie bramki zaliczone.",
    output: { status: "finished", jira_key: "PUB-142", rounds: 3, duration_min: 42 },
    branches: [],
    details: { note: "Węzeł końcowy (end) — run się zamyka, historia zostaje w run.history." },
  },
];

const INITIAL_ORDER = NODES.map((n) => n.id);
const state = { order: [...INITIAL_ORDER], simulating: false };

const flowEl = document.getElementById("flow");
const legendEl = document.getElementById("legend");
const statsEl = document.getElementById("stats");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightJson(json) {
  const e = esc(json);
  return e.replace(
    /("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g,
    (m, key, str, num, bool, nul) => {
      if (key) return `<span class="tk-key">${key}</span>`;
      if (str) return `<span class="tk-str">${str}</span>`;
      if (num) return `<span class="tk-num">${num}</span>`;
      if (bool) return `<span class="tk-bool">${bool}</span>`;
      if (nul) return `<span class="tk-null">${nul}</span>`;
      return m;
    }
  );
}

function confChip(conf) {
  if (!conf) return "";
  return `<span class="conf-chip conf-${esc(conf)}">confidence: ${esc(conf)}</span>`;
}

function renderLegend() {
  legendEl.innerHTML = Object.values(TYPE_META)
    .map(
      (t) =>
        `<span class="legend-item"><span class="dot" style="background:${t.color}"></span>${esc(t.label)}</span>`
    )
    .join("");
}

function renderStats() {
  const counts = {};
  for (const id of state.order) {
    const t = NODES.find((n) => n.id === id).type;
    counts[t] = (counts[t] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([t, c]) => `${c}× ${TYPE_META[t].label}`);
  statsEl.textContent = `${state.order.length} kroków · ${parts.join(" · ")}`;
}

function detailsHtml(node) {
  const d = node.details || {};
  const blocks = [];
  if (d.action) blocks.push(`<div class="detail-block"><p class="detail-title">Akcja</p><div class="chip-row"><span class="chip code">${esc(d.action)}</span></div></div>`);
  if (d.prompt) blocks.push(`<div class="detail-block"><p class="detail-title">Fragment promptu</p><pre class="prompt-excerpt">${esc(d.prompt)}</pre></div>`);
  if (d.vars && d.vars.length) blocks.push(`<div class="detail-block"><p class="detail-title">Zmienne template</p><div class="chip-row">${d.vars.map((v) => `<span class="chip">${esc(v)}</span>`).join("")}</div></div>`);
  if (d.checks && d.checks.length) blocks.push(`<div class="detail-block"><p class="detail-title">Na co patrzy agent</p><div class="chip-row">${d.checks.map((c) => `<span class="chip warn">${esc(c)}</span>`).join("")}</div></div>`);
  if (d.options && d.options.length) blocks.push(`<div class="detail-block"><p class="detail-title">Opcje bramki</p>${d.options.map((o) => `<div class="option-row"><span class="option-key">${esc(o.key)}</span><span class="option-label">${esc(o.label)}</span></div>`).join("")}</div>`);
  if (d.skipWhen && d.skipWhen.length) blocks.push(`<div class="detail-block"><p class="detail-title">skip_when (auto-skip bramki)</p><div class="chip-row">${d.skipWhen.map((s) => `<span class="chip warn">${esc(s)}</span>`).join("")}</div></div>`);
  if (d.altOutput) blocks.push(`<div class="detail-block"><p class="detail-title">Wariant zwrotki</p><pre class="prompt-excerpt">${esc(JSON.stringify(d.altOutput, null, 2))}</pre></div>`);
  if (d.note) blocks.push(`<div class="detail-block"><p class="detail-text">${esc(d.note)}</p></div>`);
  return blocks.join("");
}

function branchesHtml(node) {
  if (!node.branches || !node.branches.length) return "";
  return `<div class="branches">${node.branches
    .map((b) => {
      const when = b.when ? `<span class="loop">when:</span> ${esc(b.when)} ` : "";
      const loop = b.loop ? ` <span class="loop">↩ ${esc(b.loop)}</span>` : "";
      return `<span class="branch">${when}${esc(b.text)}${loop}</span>`;
    })
    .join("")}</div>`;
}

function payloadHtml(node) {
  if (!node.output) return "";
  const json = JSON.stringify(node.output, null, 2);
  return `<div class="payload">
    <div class="payload-head"><span class="pulse"></span><span>zwrotka z węzła „${esc(node.label)}” (output / result.json)</span>${confChip(node.output.confidence)}</div>
    <pre><code>${highlightJson(json)}</code></pre>
  </div>`;
}

function altHtml(node) {
  if (!node.alt) return "";
  const a = node.alt;
  return `<div class="alt-card"><strong>albo:</strong> ${esc(a.text)} — akcja <code>${esc(a.action)}</code>, zwrotka: <code>${esc(a.output.jira_key)}</code></div>`;
}

function nodeCardHtml(node, idx, total) {
  const meta = TYPE_META[node.type];
  return `<article class="node-card" data-id="${esc(node.id)}" style="--nc:${meta.color}" draggable="false">
    <span class="grip" title="Przeciągnij, żeby zmienić kolejność">⋮⋮</span>
    <div class="node-icon">${meta.icon}</div>
    <div class="node-body">
      <div class="node-head" data-toggle="${esc(node.id)}">
        <span class="node-label">${idx + 1}. ${esc(node.label)}</span>
        <span class="type-badge">${esc(meta.label)}</span>
        <span class="node-tools">
          <button class="tool-btn" data-move="-1" data-id="${esc(node.id)}" title="W górę" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="tool-btn" data-move="1" data-id="${esc(node.id)}" title="W dół" ${idx === total - 1 ? "disabled" : ""}>↓</button>
        </span>
      </div>
      <p class="node-desc">${esc(node.desc)}</p>
      <div class="node-details">${detailsHtml(node)}</div>
    </div>
  </article>`;
}

function connectorHtml(node) {
  return `<div class="connector" data-from="${esc(node.id)}">
    <span class="arrow">▼</span>
    ${payloadHtml(node)}
    ${branchesHtml(node)}
    ${altHtml(node)}
  </div>`;
}

function render() {
  const cards = state.order.map((id, i) => NODES.find((n) => n.id === id));
  let html = "";
  cards.forEach((node, i) => {
    html += nodeCardHtml(node, i, cards.length);
    html += connectorHtml(node);
  });
  flowEl.innerHTML = html;
  renderStats();
  bindCardEvents();
}

function bindCardEvents() {
  flowEl.querySelectorAll(".node-card").forEach((card) => {
    const grip = card.querySelector(".grip");
    grip.addEventListener("mousedown", () => { card.draggable = true; });
    card.addEventListener("dragend", () => { card.draggable = false; card.classList.remove("dragging"); });
    document.addEventListener("mouseup", () => { card.draggable = false; });
    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.id);
    });
  });
}

let placeholder = null;

function ensurePlaceholder() {
  if (!placeholder) {
    placeholder = document.createElement("div");
    placeholder.className = "drop-placeholder";
  }
  return placeholder;
}

function cardAfter(y) {
  const cards = [...flowEl.querySelectorAll(".node-card:not(.dragging)")];
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    if (y < r.top + r.height / 2) return c;
  }
  return null;
}

flowEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const ph = ensurePlaceholder();
  const after = cardAfter(e.clientY);
  if (after == null) flowEl.appendChild(ph);
  else flowEl.insertBefore(ph, after);
});

flowEl.addEventListener("drop", (e) => {
  e.preventDefault();
  const card = flowEl.querySelector(".node-card.dragging");
  if (card && placeholder && placeholder.parentNode === flowEl) {
    placeholder.parentNode.insertBefore(card, placeholder);
  }
  placeholder.remove();
  state.order = [...flowEl.querySelectorAll(".node-card")].map((c) => c.dataset.id);
  render();
});

flowEl.addEventListener("dragleave", (e) => {
  if (e.target === flowEl && placeholder && placeholder.parentNode === flowEl) placeholder.remove();
});

flowEl.addEventListener("click", (e) => {
  const moveBtn = e.target.closest("[data-move]");
  if (moveBtn) {
    e.stopPropagation();
    moveNode(moveBtn.dataset.id, Number(moveBtn.dataset.move));
    return;
  }
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) toggle.closest(".node-card").classList.toggle("open");
});

function moveNode(id, dir) {
  const i = state.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.order.length) return;
  [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  render();
}

function resetOrder() {
  state.order = [...INITIAL_ORDER];
  stopSimulate();
  render();
}

let simTimer = null;

function stopSimulate() {
  state.simulating = false;
  if (simTimer) clearTimeout(simTimer);
  simTimer = null;
  flowEl.classList.remove("simulating");
  flowEl.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll("#btn-simulate, #btn-simulate-2").forEach((b) => {
    b.classList.remove("running");
    b.textContent = b.id === "btn-simulate" ? "▶ Symuluj przebieg" : "▶ Symuluj";
  });
}

function simulate() {
  if (state.simulating) { stopSimulate(); return; }
  state.simulating = true;
  flowEl.classList.add("simulating");
  document.querySelectorAll("#btn-simulate, #btn-simulate-2").forEach((b) => {
    b.classList.add("running");
    b.textContent = b.id === "btn-simulate" ? "⏹ Stop" : "⏹ Stop";
  });
  flowEl.scrollIntoView({ behavior: "smooth", block: "start" });

  const cards = [...flowEl.querySelectorAll(".node-card")];
  let i = 0;
  const step = () => {
    if (!state.simulating) return;
    flowEl.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
    if (i >= cards.length) { stopSimulate(); return; }
    const card = cards[i];
    card.classList.add("active");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    const conn = card.nextElementSibling;
    if (conn && conn.classList.contains("connector")) conn.classList.add("active");
    i += 1;
    simTimer = setTimeout(step, 1100);
  };
  step();
}

document.getElementById("btn-simulate").addEventListener("click", simulate);
document.getElementById("btn-simulate-2").addEventListener("click", simulate);
document.getElementById("btn-reset").addEventListener("click", resetOrder);
document.getElementById("btn-reset-2").addEventListener("click", resetOrder);

renderLegend();
render();
