const KINDS = {
  agent:     { label: "Agent",              icon: "🤖", color: "#8b5cf6", hint: "wykonuje pracę wg promptu, zwraca result.json" },
  gate:      { label: "Bramka użytkownika", icon: "🧑‍⚖️", color: "#f59e0b", hint: "człowiek wybiera: accept / comments" },
  jira:      { label: "Akcja Jira",         icon: "🎫", color: "#2684ff", hint: "create / import / transition taska" },
  bitbucket: { label: "Akcja Bitbucket",    icon: "⎇",  color: "#5e6ad2", hint: "draft PR, open, merge" },
  discord:   { label: "Akcja Discord",      icon: "💬", color: "#5865f2", hint: "powiadomienie na kanale" },
  devtrywpi: { label: "Akcja Dev Trywpi",   icon: "🧪", color: "#14b8a6", hint: "wystawienie instalki (dev / staging)" },
  aibrake:   { label: "Akcja Aibrake",      icon: "🛑", color: "#ec4899", hint: "wewnętrzna akcja Aibrake" },
  helpwise:  { label: "Akcja Helpwise",     icon: "📨", color: "#22c55e", hint: "odpowiedź lub eskalacja zgłoszenia klienta" },
};

const PALETTE_ORDER = ["agent", "gate", "jira", "bitbucket", "discord", "devtrywpi", "aibrake", "helpwise"];

const DEFAULT_STEPS = [
  { kind: "agent",     desc: "Doprecyzowanie — agent zamienia opis w mały, jednoznaczny task" },
  { kind: "gate",      desc: "Pytanie AI — agent dopytuje o jeden szczegół taska" },
  { kind: "jira",      desc: "Utwórz task w Jirze na podstawie doprecyzowania" },
  { kind: "agent",     desc: "Kodowanie — minimalny diff na branchu feature, bez pusha" },
  { kind: "bitbucket", desc: "Otwórz draft PR w Bitbucket" },
  { kind: "gate",      desc: "Review człowieka — akceptuj albo wróć z komentarzem" },
  { kind: "agent",     desc: "Security review — raport z diffu, bez zmian w kodzie" },
  { kind: "gate",      desc: "Bramka sec — auto-skip przy braku ustaleń i wysokim confidence" },
  { kind: "agent",     desc: "Scenariusze testów manualnych na podstawie diffu" },
  { kind: "gate",      desc: "Akceptacja scenariuszy przez użytkownika" },
  { kind: "devtrywpi", desc: "Instalka dev — wystaw zmiany na środowisku testowym" },
  { kind: "gate",      desc: "Test manualny według scenariuszy agenta" },
  { kind: "bitbucket", desc: "Otwórz PR (wyjdź z draftu)" },
  { kind: "gate",      desc: "Bramka PR — poczekaj na CR zespołu" },
  { kind: "bitbucket", desc: "Merge PR i usuń branch feature" },
  { kind: "jira",      desc: "Przestaw task w Jirze na Done" },
];

const IDEAS = [
  { title: "Hotfix produkcyjny", desc: "Krytyczny bug od zgłoszenia do wdrożenia w kilku krokach, z bramką security przed instalką.", steps: ["jira", "agent", "bitbucket", "agent", "gate", "devtrywpi", "discord"] },
  { title: "Triage zgłoszenia klienta", desc: "Agent czyta zgłoszenie z Helpwise i decyduje: odpowiedź bezpośrednia czy eskalacja do deweloperów.", steps: ["helpwise", "agent", "gate", "jira"] },
  { title: "Cotygodniowy release", desc: "Zebranie zmian z Jiry, merge, wystawienie na produkcję i changelog na Discordzie.", steps: ["jira", "bitbucket", "devtrywpi", "discord"] },
  { title: "Przegląd security przed releasem", desc: "Agent przegląda cały diff releasowy, Aibrake robi dodatkową kontrolę, człowiek akceptuje.", steps: ["agent", "aibrake", "gate", "bitbucket"] },
  { title: "Post-mortem incydentu", desc: "Analiza logów i przebiegu awarii z Discorda, raport plus taski follow-up w Jirze.", steps: ["discord", "agent", "gate", "jira"] },
  { title: "Aktualizacja zależności", desc: "Automatyczny PR z podbiciem wersji: agent odpala testy, człowiek patrzy na wynik i merguje.", steps: ["bitbucket", "agent", "gate"] },
  { title: "Migracja danych", desc: "Plan migracji od agenta, dry-run na instalce, akceptacja człowieka i wykonanie na produkcji.", steps: ["jira", "agent", "gate", "devtrywpi", "gate"] },
  { title: "Demo dla klienta", desc: "Instalka demo z wybranymi danymi plus notatka w Helpwise, co warto pokazać klientowi.", steps: ["jira", "devtrywpi", "helpwise", "gate"] },
  { title: "Onboarding nowego developera", desc: "Agent przygotowuje checklist środowiska i pierwszych zadań, mentor weryfikuje postęp w bramce.", steps: ["jira", "agent", "gate"] },
  { title: "Rutynowy code review", desc: "Agent robi pierwszy przegląd PR (diff + testy), człowiek dopisuje uwagi i akceptuje merge.", steps: ["bitbucket", "agent", "gate"] },
  { title: "Rotacja sekretów", desc: "Wykrycie przestarzałego sekretu, rotacja przez Aibrake i powiadomienie zespołu na Discordzie.", steps: ["agent", "aibrake", "gate", "discord"] },
  { title: "Raport tygodniowy", desc: "Agent zbiera metryki z Jiry i Bitbucketa, po akceptacji publikuje podsumowanie na Discordzie.", steps: ["jira", "bitbucket", "agent", "gate", "discord"] },
];

let uidSeq = 1;
const state = {
  steps: DEFAULT_STEPS.map((s) => ({ uid: uidSeq++, kind: s.kind, desc: s.desc })),
  simulating: false,
};

const paletteListEl = document.getElementById("palette-list");
const flowListEl = document.getElementById("flow-list");
const statsEl = document.getElementById("stats");
const ideasGridEl = document.getElementById("ideas-grid");

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

function renderPalette() {
  paletteListEl.innerHTML = PALETTE_ORDER.map((k) => {
    const meta = KINDS[k];
    return `<button class="pal" type="button" data-kind="${k}" style="--kc:${meta.color}">
      <span class="pal-icon">${meta.icon}</span>
      <span><span class="pal-name">${esc(meta.label)}</span><span class="pal-hint">${esc(meta.hint)}</span></span>
    </button>`;
  }).join("");
}

function renderStats() {
  const counts = { agent: 0, gate: 0, action: 0 };
  for (const s of state.steps) {
    if (s.kind === "agent") counts.agent++;
    else if (s.kind === "gate") counts.gate++;
    else counts.action++;
  }
  statsEl.textContent = `${state.steps.length} kroków · ${counts.agent} agentów · ${counts.gate} bramek · ${counts.action} akcji`;
}

function stepHtml(step, idx, total) {
  const meta = KINDS[step.kind];
  return `<div class="step" data-uid="${step.uid}" style="--kc:${meta.color}" draggable="false">
    <span class="grip" title="Przeciągnij, żeby zmienić kolejność">⋮⋮</span>
    <span class="step-num">${idx + 1}</span>
    <span class="step-icon">${meta.icon}</span>
    <span class="step-kind">${esc(meta.label)}</span>
    <input class="step-desc" type="text" maxlength="140" placeholder="opisz krok w jednym zdaniu…" aria-label="Opis kroku">
    <span class="step-tools">
      <button class="tool-btn" data-act="up" title="W górę" ${idx === 0 ? "disabled" : ""}>↑</button>
      <button class="tool-btn" data-act="down" title="W dół" ${idx === total - 1 ? "disabled" : ""}>↓</button>
      <button class="tool-btn del" data-act="del" title="Usuń krok">✕</button>
    </span>
  </div>`;
}

function render() {
  if (!state.steps.length) {
    flowListEl.innerHTML = `<div class="flow-empty">Flow jest pusty — kliknij klocek w panelu po lewej, żeby dodać pierwszy krok.</div>`;
  } else {
    flowListEl.innerHTML = state.steps.map((s, i) => stepHtml(s, i, state.steps.length)).join("");
    flowListEl.querySelectorAll(".step").forEach((el) => {
      const step = state.steps.find((s) => s.uid === Number(el.dataset.uid));
      el.querySelector(".step-desc").value = step.desc;
    });
  }
  renderStats();
  bindStepEvents();
}

function bindStepEvents() {
  flowListEl.querySelectorAll(".step").forEach((el) => {
    const grip = el.querySelector(".grip");
    grip.addEventListener("mousedown", () => { el.draggable = true; });
    el.addEventListener("dragend", () => { el.draggable = false; el.classList.remove("dragging"); });
    el.addEventListener("dragstart", (e) => {
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", el.dataset.uid);
    });
  });
}

function addStep(kind) {
  state.steps.push({ uid: uidSeq++, kind, desc: "" });
  render();
  const inputs = flowListEl.querySelectorAll(".step-desc");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function moveStep(uid, dir) {
  const i = state.steps.findIndex((s) => s.uid === uid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.steps.length) return;
  [state.steps[i], state.steps[j]] = [state.steps[j], state.steps[i]];
  render();
}

function deleteStep(uid) {
  state.steps = state.steps.filter((s) => s.uid !== uid);
  render();
}

paletteListEl.addEventListener("click", (e) => {
  const pal = e.target.closest("[data-kind]");
  if (pal) addStep(pal.dataset.kind);
});

flowListEl.addEventListener("input", (e) => {
  if (!e.target.classList.contains("step-desc")) return;
  const uid = Number(e.target.closest(".step").dataset.uid);
  const step = state.steps.find((s) => s.uid === uid);
  if (step) step.desc = e.target.value;
});

flowListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  e.stopPropagation();
  const uid = Number(btn.closest(".step").dataset.uid);
  if (btn.dataset.act === "up") moveStep(uid, -1);
  if (btn.dataset.act === "down") moveStep(uid, 1);
  if (btn.dataset.act === "del") deleteStep(uid);
});

let placeholder = null;

function ensurePlaceholder() {
  if (!placeholder) {
    placeholder = document.createElement("div");
    placeholder.className = "drop-placeholder";
  }
  return placeholder;
}

function stepAfter(y) {
  const steps = [...flowListEl.querySelectorAll(".step:not(.dragging)")];
  for (const el of steps) {
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2) return el;
  }
  return null;
}

flowListEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const ph = ensurePlaceholder();
  const after = stepAfter(e.clientY);
  if (after == null) flowListEl.appendChild(ph);
  else flowListEl.insertBefore(ph, after);
});

flowListEl.addEventListener("drop", (e) => {
  e.preventDefault();
  const dragged = flowListEl.querySelector(".step.dragging");
  if (dragged && placeholder && placeholder.parentNode === flowListEl) {
    placeholder.parentNode.insertBefore(dragged, placeholder);
  }
  placeholder.remove();
  state.steps = [...flowListEl.querySelectorAll(".step")].map((el) => {
    const uid = Number(el.dataset.uid);
    return state.steps.find((s) => s.uid === uid);
  }).filter(Boolean);
  render();
});

flowListEl.addEventListener("dragleave", (e) => {
  if (e.target === flowListEl && placeholder && placeholder.parentNode === flowListEl) placeholder.remove();
});

document.addEventListener("mouseup", () => {
  flowListEl.querySelectorAll(".step").forEach((el) => { el.draggable = false; });
});

let simTimer = null;

function stopSimulate() {
  state.simulating = false;
  if (simTimer) clearTimeout(simTimer);
  simTimer = null;
  flowListEl.classList.remove("simulating");
  flowListEl.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
  const btn = document.getElementById("btn-simulate");
  btn.classList.remove("running");
  btn.textContent = "▶ Symuluj";
}

function simulate() {
  if (state.simulating) { stopSimulate(); return; }
  if (!state.steps.length) return;
  state.simulating = true;
  flowListEl.classList.add("simulating");
  const btn = document.getElementById("btn-simulate");
  btn.classList.add("running");
  btn.textContent = "⏹ Stop";
  flowListEl.scrollIntoView({ behavior: "smooth", block: "start" });

  const steps = [...flowListEl.querySelectorAll(".step")];
  let i = 0;
  const step = () => {
    if (!state.simulating) return;
    flowListEl.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
    if (i >= steps.length) { stopSimulate(); return; }
    steps[i].classList.add("active");
    steps[i].scrollIntoView({ behavior: "smooth", block: "center" });
    i += 1;
    simTimer = setTimeout(step, 800);
  };
  step();
}

document.getElementById("btn-simulate").addEventListener("click", simulate);
document.getElementById("btn-reset").addEventListener("click", () => {
  stopSimulate();
  state.steps = DEFAULT_STEPS.map((s) => ({ uid: uidSeq++, kind: s.kind, desc: s.desc }));
  render();
});
document.getElementById("btn-clear").addEventListener("click", () => {
  stopSimulate();
  state.steps = [];
  render();
});

function renderIdeas() {
  ideasGridEl.innerHTML = IDEAS.map((idea, i) => {
    const chips = idea.steps.map((k) => {
      const meta = KINDS[k];
      return `<span class="chip" style="--kc:${meta.color}">${meta.icon} ${esc(meta.label.replace("Akcja ", ""))}</span>`;
    }).join("");
    return `<div class="idea-card">
      <span class="idea-num">#${String(i + 1).padStart(2, "0")}</span>
      <h3>${esc(idea.title)}</h3>
      <p>${esc(idea.desc)}</p>
      <div class="chip-row">${chips}</div>
    </div>`;
  }).join("");
}

function highlightSamples() {
  document.querySelectorAll("pre.json-sample").forEach((el) => {
    try {
      const json = JSON.stringify(JSON.parse(el.textContent), null, 2);
      el.innerHTML = highlightJson(json);
    } catch (err) { /* leave as-is */ }
  });
}

renderPalette();
render();
renderIdeas();
highlightSamples();
