// LLM Agent Visualizer — animates the ReAct loop (Reason -> Act -> Observe).
// The traces below are *recorded*: the same loop structure that real tool-using
// agents follow, replayed step-by-step so you can see how an agent "thinks".

const REPO_URL = "https://github.com/tongchen2010/llm-agent-visualizer";

const TOOLS = {
  web_search: { icon: "🔎", label: "web_search" },
  calculator: { icon: "🧮", label: "calculator" },
  wikipedia: { icon: "📚", label: "wikipedia" },
  code: { icon: "💻", label: "code" },
};

const SCENARIOS = [
  {
    title: "Multi-hop trivia (search + calculator)",
    question: "How many years passed between the first Moon landing and the launch of the first reusable spacecraft?",
    steps: [
      { type: "thought", text: "I need two facts: the year of the first Moon landing, and the year the first reusable spacecraft launched. I'll look up each, then subtract." },
      { type: "action", tool: "web_search", input: "first Moon landing year" },
      { type: "observation", text: "Apollo 11 landed humans on the Moon on July 20, 1969." },
      { type: "thought", text: "1969. The first reusable spacecraft was the Space Shuttle — let me find its first launch." },
      { type: "action", tool: "web_search", input: "first Space Shuttle launch year" },
      { type: "observation", text: "Space Shuttle Columbia (mission STS-1) launched on April 12, 1981." },
      { type: "thought", text: "Now I subtract 1969 from 1981. I'll use the calculator to be exact." },
      { type: "action", tool: "calculator", input: "1981 - 1969" },
      { type: "observation", text: "12" },
      { type: "answer", text: "12 years — from the first Moon landing (1969) to the first reusable spacecraft, the Space Shuttle (1981)." },
    ],
  },
  {
    title: "Math word problem (calculator)",
    question: "A train travels 90 km in 75 minutes. What is its average speed in km/h?",
    steps: [
      { type: "thought", text: "Speed = distance ÷ time, but time must be in hours. 75 minutes = 75/60 hours, then divide 90 by that." },
      { type: "action", tool: "calculator", input: "90 / (75 / 60)" },
      { type: "observation", text: "72" },
      { type: "answer", text: "The train's average speed is 72 km/h." },
    ],
  },
  {
    title: "Coding question (code tool)",
    question: "What is the 15th Fibonacci number (starting 1, 1, 2, 3, …)?",
    steps: [
      { type: "thought", text: "Rather than add by hand and risk a slip, I'll compute it directly with a tiny script." },
      { type: "action", tool: "code", input: "def fib(n):\n    a, b = 1, 1\n    for _ in range(n - 1):\n        a, b = b, a + b\n    return a\n\nprint(fib(15))" },
      { type: "observation", text: "610" },
      { type: "answer", text: "The 15th Fibonacci number is 610." },
    ],
  },
  {
    title: "Multi-hop lookup (wikipedia)",
    question: "Which author wrote the novel that the movie Blade Runner is based on?",
    steps: [
      { type: "thought", text: "Blade Runner is adapted from a novel. First I'll find which novel it's based on." },
      { type: "action", tool: "wikipedia", input: "Blade Runner film source novel" },
      { type: "observation", text: "Blade Runner (1982) is based on the 1968 novel “Do Androids Dream of Electric Sheep?”." },
      { type: "thought", text: "Now I need the author of that novel." },
      { type: "action", tool: "wikipedia", input: "Do Androids Dream of Electric Sheep? author" },
      { type: "observation", text: "The novel was written by Philip K. Dick." },
      { type: "answer", text: "Blade Runner is based on Philip K. Dick's 1968 novel “Do Androids Dream of Electric Sheep?”." },
    ],
  },
];

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const elScenario = $("scenario"), elTimeline = $("timeline"), elQ = $("question-bar"),
  elIter = $("iter"), runBtn = $("run-btn"), stepBtn = $("step-btn"), resetBtn = $("reset-btn"), speed = $("speed");
$("repo-link").href = REPO_URL;

let sc = SCENARIOS[0], i = 0, iter = 0, playing = false, busy = false, started = false;

const spd = () => parseFloat(speed.value) || 1.5;
const delay = (ms) => new Promise((r) => setTimeout(r, ms / spd()));

function fillSelect() {
  SCENARIOS.forEach((s, idx) => {
    const o = document.createElement("option");
    o.value = idx; o.textContent = s.title;
    elScenario.appendChild(o);
  });
}

function showQuestion() {
  elQ.classList.add("show");
  elQ.innerHTML = `<span class="q-label">Task</span>${escapeHtml(sc.question)}`;
  elIter.textContent = "iteration 0";
}

function reset() {
  playing = false; busy = false; started = false; i = 0; iter = 0;
  runBtn.textContent = "▶ Run"; runBtn.disabled = false; stepBtn.disabled = false;
  elTimeline.innerHTML = "";
  showQuestion();
  setLoop(null);
}

function ensureStarted() {
  if (!started) { elTimeline.innerHTML = ""; started = true; }
}

function setLoop(phase) {
  document.querySelectorAll(".loop-node").forEach((n) =>
    n.classList.toggle("active", n.dataset.phase === phase));
}

async function typewriter(el, text) {
  el.classList.add("caret");
  const cps = 60;
  for (let k = 0; k < text.length; k++) {
    el.textContent = text.slice(0, k + 1);
    await new Promise((r) => setTimeout(r, (1000 / cps) / spd()));
  }
  el.classList.remove("caret");
}

function card(type, iconChar) {
  const step = document.createElement("div");
  step.className = `step ${type}`;
  const icon = document.createElement("div");
  icon.className = "icon"; icon.textContent = iconChar;
  const body = document.createElement("div");
  body.className = "body";
  step.append(icon, body);
  elTimeline.appendChild(step);
  step.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return body;
}

async function renderStep(step) {
  if (step.type === "thought") {
    iter++; elIter.textContent = `iteration ${iter}`;
    setLoop("reason");
    const b = card("thought", "🧠");
    b.innerHTML = `<div class="kind">Thought</div><div class="text"></div>`;
    await typewriter(b.querySelector(".text"), step.text);
  } else if (step.type === "action") {
    setLoop("act");
    const t = TOOLS[step.tool] || { icon: "🔧", label: step.tool };
    const b = card("action", "🔧");
    b.innerHTML = `<div class="kind">Action · call tool</div>
      <div><span class="tool-badge">${t.icon} ${t.label}</span></div>
      <div class="tool-input"></div>`;
    b.querySelector(".tool-input").textContent = step.input;
  } else if (step.type === "observation") {
    setLoop("observe");
    const b = card("observation", "👁");
    b.innerHTML = `<div class="kind">Observation</div><div class="text"><span class="spinner"></span> running tool…</div>`;
    await delay(850);
    const txt = b.querySelector(".text");
    txt.classList.add("obs-data"); txt.textContent = "";
    await typewriter(txt, step.text);
  } else if (step.type === "answer") {
    setLoop(null);
    const b = card("answer", "✅");
    b.innerHTML = `<div class="kind">Final Answer</div><div class="text"></div>`;
    await typewriter(b.querySelector(".text"), step.text);
  }
}

async function advanceOne() {
  if (i >= sc.steps.length) return false;
  ensureStarted();
  busy = true; stepBtn.disabled = true;
  const step = sc.steps[i]; i++;
  await renderStep(step);
  busy = false;
  const done = i >= sc.steps.length;
  stepBtn.disabled = playing || done;
  return true;
}

async function play() {
  if (playing) { playing = false; runBtn.textContent = "▶ Resume"; return; }
  if (i >= sc.steps.length) reset();
  playing = true; runBtn.textContent = "⏸ Pause"; stepBtn.disabled = true;
  while (playing && i < sc.steps.length) {
    await advanceOne();
    if (!playing) break;
    if (i < sc.steps.length) await delay(700);
  }
  playing = false;
  const done = i >= sc.steps.length;
  runBtn.textContent = done ? "▶ Run again" : "▶ Resume";
  stepBtn.disabled = done;
  if (done) setLoop(null);
}

async function manualStep() {
  if (busy || playing || i >= sc.steps.length) return;
  await advanceOne();
  if (i >= sc.steps.length) runBtn.textContent = "▶ Run again";
}

elScenario.addEventListener("change", () => { sc = SCENARIOS[+elScenario.value]; reset(); });
runBtn.addEventListener("click", play);
stepBtn.addEventListener("click", manualStep);
resetBtn.addEventListener("click", reset);

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- boot ----------
fillSelect();
showQuestion();
