/* Panic Button
   Data lives on the device. If sync is set up, it is also copied to a private GitHub repo
   so other devices can see it after entering the sync password. */
"use strict";

/* ===================== DEFAULTS ===================== */
const TRACKS = {
  dopamine: { label: "Dopamine spiral", short: "Dopamine" },
  pressure: { label: "Pressure build-up", short: "Pressure" },
};
const TIER_NAMES = ["Quick and easy", "A little more", "Bigger moves"];
// One ladder for both. "(N min)" at the end of an item gives it a timer.
const DEFAULT_LADDER = [
  ["Prayer", "Splash cold water on your face", "20 pushups", "Box breathing (1 min)",
   "Turn off music and all devices (10 min)", "Leave the room"],
  ["Timer on one task (3 min)", "Breathing glass body imagery (5 min)", "Urge surfing (5 min)",
   "Bodyweight burnout: 3 rounds of 15 squats, 20 pushups, 20 sec sprint", "Cold shower"],
  ["Walk outside (15 min)", "Shower", "Nap (20 min)"],
];
const UNLOCK_AFTER = 3;   // "Didn't really help" opens after this many checked items
const DEFAULT_SETTINGS = { riName: "Ri", riPhone: "", contacts: [], ladder: DEFAULT_LADDER, updated: 0 };
const OUTCOMES = {
  safe:  { label: "Safe (ladder)", pill: "safe" },
  reset: { label: "Safe (after reset)", pill: "reset" },
  slip:  { label: "Didn't hold this time", pill: "slip" },
};

/* ===================== STORAGE ===================== */
const K = { settings: "pb.settings", events: "pb.events", active: "pb.active", theme: "pb.theme",
            deleted: "pb.deleted", sync: "pb.sync" };
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { toast("Couldn't save, storage is full or blocked"); }
}
// old versions kept the theme inside settings and had two ladders; clean that up
const rawSettings = load(K.settings, {});
let theme = load(K.theme, rawSettings.theme || "midnight");
let settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings);
delete settings.theme; delete settings.napMinutes;
if (!Array.isArray(settings.ladder) || rawSettings.ladders) { settings.ladder = DEFAULT_LADDER; delete settings.ladders; }
let events = load(K.events, []).map(migrate);
let deleted = load(K.deleted, {});        // id -> when it was deleted, so deletes sync too
let active = load(K.active, null);        // the session in progress, so closing the app doesn't lose it
let sync = load(K.sync, null);            // { token, last, error }
if (active && active.track === "tension") active.track = "pressure";

function migrate(e) {
  if (e.track === "tension") e.track = "pressure";
  if (!e.updated) e.updated = Date.parse(e.end || e.start) || 0;
  return e;
}
function saveSettings() { settings.updated = Date.now(); save(K.settings, settings); queueSync(); }
function saveEvents() { save(K.events, events); save(K.deleted, deleted); queueSync(); }
const saveActive = () => active ? save(K.active, active) : localStorage.removeItem(K.active);
const saveSync = () => sync ? save(K.sync, sync) : localStorage.removeItem(K.sync);

/* ===================== HELPERS ===================== */
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const minutesOf = name => { const m = /\((\d+(?:\.\d+)?)\s*min\)\s*$/i.exec(name); return m ? parseFloat(m[1]) : 0; };
const cleanName = name => name.replace(/\s*\(\d+(?:\.\d+)?\s*min\)\s*$/i, "");
const ladder = () => settings.ladder;
const allItems = () => ladder().flat();
const resetsList = () => [`Call ${settings.riName || "Ri"}`, "Call a friend or family member", "Nap", "Talk it out with Claude"];
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + ", " +
         d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function toLocalInput(iso) {
  const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
}
let snd = load("pb.sound", { on: true, vol: 1 });
function beep() {
  if (!snd.on || snd.vol <= 0) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach(off => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(.2 * snd.vol, ctx.currentTime + off); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + off + .3);
      o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + .3);
    });
  } catch {}
}
const backBtn = () => `<button class="back" id="backBtn">‹ Back</button>`;

/* ===================== THEMES ===================== */
const THEMES = {
  midnight:  { label: "Dark",      swatch: "#0f0f13" },
  paper:     { label: "Light",     swatch: "#f6f3ec" },
  sepia:     { label: "Sepia",     swatch: "#2a211a" },
  chameleon: { label: "Chameleon", swatch: "conic-gradient(#f87171,#fbbf24,#34d399,#38bdf8,#a78bfa,#f87171)" },
};
const CHAM_VARS = ["bg", "surface", "surface2", "border", "text", "dim", "muted", "accent", "ok", "bad", "star", "shadow"];
let cham = load("pb.cham", { tone: "any", lock: null });
let chamNow = null;
function makeChameleon(tone = cham.tone) {
  const h = Math.floor(Math.random() * 360);
  const acc = (h + 120 + Math.floor(Math.random() * 110)) % 360;
  const H = (x, s, l) => `hsl(${x} ${s}% ${l}%)`;
  const light = tone === "light" ? true : tone === "dark" ? false : Math.random() < 0.28;
  if (light) return {
    bg: H(h, 32, 95), surface: H(h, 42, 99), surface2: H(h, 26, 91), border: H(h, 22, 83),
    text: H(h, 38, 11), dim: H(h, 18, 33), muted: H(h, 14, 50), accent: H(acc, 66, 37),
    ok: "hsl(158 72% 29%)", bad: "hsl(0 72% 44%)", star: "hsl(32 88% 34%)", shadow: "rgba(40,35,20,.16)",
  };
  return {
    bg: H(h, 26, 7), surface: H(h, 22, 12), surface2: H(h, 26, 9), border: H(h, 18, 21),
    text: H(h, 26, 95), dim: H(h, 14, 74), muted: H(h, 12, 50), accent: H(acc, 74, 63),
    ok: "hsl(158 66% 56%)", bad: "hsl(0 82% 73%)", star: "hsl(38 92% 55%)", shadow: "rgba(0,0,0,.5)",
  };
}
function applyTheme() {
  const t = THEMES[theme] ? theme : "midnight";
  const root = document.documentElement;
  root.setAttribute("data-theme", t);
  if (t === "chameleon") {
    paintCham(cham.lock || makeChameleon());
  } else {
    CHAM_VARS.forEach(v => root.style.removeProperty("--" + v));
  }
  requestAnimationFrame(() => $("#themeColorMeta").setAttribute("content", getComputedStyle(document.body).backgroundColor));
}
function paintCham(pal) {
  chamNow = pal;
  CHAM_VARS.forEach(v => document.documentElement.style.setProperty("--" + v, pal[v]));
  requestAnimationFrame(() => $("#themeColorMeta").setAttribute("content", getComputedStyle(document.body).backgroundColor));
}
function renderThemePop() {
  $("#themePop").innerHTML = Object.entries(THEMES).map(([k, t]) =>
    `<button class="sw ${theme === k ? "on" : ""}" data-theme="${k}"><i style="background:${t.swatch}"></i>${t.label}</button>`).join("");
}
$("#themeBtn").onclick = e => { if (window.Kit) return; e.stopPropagation(); renderThemePop(); $("#themePop").hidden = !$("#themePop").hidden; };
$("#themePop").onclick = e => {
  const b = e.target.closest("[data-theme]"); if (!b) return;
  theme = b.dataset.theme; save(K.theme, theme); applyTheme(); renderThemePop(); // tapping chameleon again re-rolls
};
document.addEventListener("click", e => { if (!e.target.closest("#themePop") && e.target.id !== "themeBtn") $("#themePop").hidden = true; });

/* ===================== ROUTER ===================== */
let view = "home";
const VIEWS = {};
function go(v, arg = null) {
  view = v;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.go === v));
  (VIEWS[v] || VIEWS.home)(arg);
  app.classList.remove("leave");
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));

/* ===================== HOME ===================== */
VIEWS.home = () => {
  app.innerHTML = `
  <div class="home">
    <h1>Hit the button</h1>
    <p class="sub">Name it, work the list, get back to steady.</p>
    <div class="bigwrap" id="bigWrap"><button class="big" id="bigBtn" aria-label="Start"></button></div>
    ${active ? `<div class="card resume" style="width:100%">
        <p style="margin:0 0 10px">You have one in progress from ${fmtDate(active.start)}.</p>
        <button class="btn primary" id="resumeBtn">Pick it back up</button>
        <button class="btn" id="dropBtn">Discard it</button></div>` : ""}
    <p class="muted">${events.length ? `${events.length} logged so far.` : "Nothing logged yet."}</p>
  </div>`;
  let pressed = false;
  $("#bigBtn").onclick = () => {
    if (pressed) return; pressed = true;
    if (navigator.vibrate) navigator.vibrate([20, 60, 30]);
    $("#bigBtn").classList.add("press"); $("#bigWrap").classList.add("flash");
    active = { id: uid(), start: new Date().toISOString(), track: null, feeling: "", urgeStart: 6, done: [], resets: [], stage: "start" };
    saveActive();
    setTimeout(() => app.classList.add("leave"), 380);
    setTimeout(() => go("start"), 560);
  };
  if (active) {
    $("#resumeBtn").onclick = () => go(active.stage || "start");
    $("#dropBtn").onclick = () => { if (confirm("Discard this one without saving?")) { active = null; saveActive(); VIEWS.home(); } };
  }
};

/* ===================== START ===================== */
VIEWS.start = () => {
  if (!active) return go("home");
  app.innerHTML = `
  ${backBtn()}
  <h1>What's going on?</h1>
  <label class="lbl">Which one is it?</label>
  <div class="choice">
    ${Object.entries(TRACKS).map(([k, t]) => `<button data-track="${k}" class="${active.track === k ? "on" : ""}">${t.label}</button>`).join("")}
  </div>
  <label class="lbl" for="feel">One line about it</label>
  <input type="text" id="feel" maxlength="140" placeholder="Stressed about the exam, scrolling nonstop..." value="${esc(active.feeling)}">
  <label class="lbl">How strong is the urge right now?</label>
  <div class="urge"><span class="muted">0</span><input type="range" id="urge" min="0" max="10" value="${active.urgeStart}"><b id="urgeVal">${active.urgeStart}</b></div>
  <div style="margin-top:24px"><button class="btn primary" id="goBtn" ${active.track ? "" : "disabled"}>Start the list</button></div>`;
  $("#backBtn").onclick = () => {
    // nothing entered yet means it was probably a mis-tap, so just drop it
    if (!active.track && !active.feeling) { active = null; saveActive(); }
    go("home");
  };
  app.querySelectorAll("[data-track]").forEach(b => b.onclick = () => {
    active.track = b.dataset.track; saveActive();
    app.querySelectorAll("[data-track]").forEach(x => x.classList.toggle("on", x === b));
    $("#goBtn").disabled = false;
  });
  $("#feel").oninput = e => { active.feeling = e.target.value; saveActive(); };
  $("#urge").oninput = e => { active.urgeStart = +e.target.value; $("#urgeVal").textContent = e.target.value; saveActive(); };
  $("#goBtn").onclick = () => { active.stage = "ladder"; saveActive(); go("ladder"); };
};

/* ===================== LADDER ===================== */
VIEWS.ladder = () => {
  if (!active || !active.track) return go("home");
  const tiers = ladder();
  const need = Math.min(UNLOCK_AFTER, allItems().length);
  const n = active.done.length;
  app.innerHTML = `
  ${backBtn()}
  <h1>${TRACKS[active.track].label}</h1>
  <p class="sub">${active.feeling ? `"${esc(active.feeling)}"` : "Start at the top. Check things off as you go."}</p>
  ${tiers.map((items, i) => `
    <div class="tier"><h3>${TIER_NAMES[i] || "Tier " + (i + 1)}</h3>
    ${items.map(name => {
      const done = active.done.includes(name), min = minutesOf(name);
      return `<div class="item ${done ? "done" : ""}">
        <button class="check" data-item="${esc(name)}" aria-label="Done">${done ? "✓" : ""}</button>
        <span class="name">${esc(cleanName(name))}</span>
        ${min ? `<button class="timer" data-timer="${esc(name)}">${min} min ▸</button>` : ""}
      </div>`;
    }).join("")}
    </div>`).join("")}
  <div class="sticky-foot">
    <div class="row">
      <button class="btn ok" id="safeBtn" ${n >= 1 ? "" : "disabled"}>I feel safe</button>
      <button class="btn bad" id="noHelpBtn" ${n >= need ? "" : "disabled"}>Didn't really help</button>
    </div>
    <div class="hint">${n >= need ? "Both options open." : `"Didn't really help" opens after ${need}. You're at ${n}.`}</div>
  </div>`;
  $("#backBtn").onclick = () => { active.stage = "start"; saveActive(); go("start"); };
  app.querySelectorAll("[data-item]").forEach(b => b.onclick = () => toggleDone(b.dataset.item));
  app.querySelectorAll("[data-timer]").forEach(b => b.onclick = () => openTimer(b.dataset.timer, minutesOf(b.dataset.timer), () => {
    if (active && !active.done.includes(b.dataset.timer)) toggleDone(b.dataset.timer);
  }));
  $("#safeBtn").onclick = () => { active.outcome = "safe"; active.stage = "resolve"; saveActive(); go("resolve"); };
  $("#noHelpBtn").onclick = () => { active.stage = "reset"; saveActive(); go("reset"); };
};
function toggleDone(name) {
  const i = active.done.indexOf(name);
  if (i >= 0) active.done.splice(i, 1); else active.done.push(name);
  saveActive(); VIEWS.ladder();
}

/* ===================== TIMER MODAL ===================== */
let timerTick = null;
function parseTime(str) {
  // "5" = 5 minutes, "2:30" = 2 min 30 sec
  const s = String(str).trim();
  let m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return (+m[1] * 60 + +m[2]) * 1000;
  m = /^(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return parseFloat(m[1]) * 60000;
  return 0;
}
function openTimer(name, minutes, onDone) {
  const m = $("#modal"); m.hidden = false;
  const isBox = /box breath/i.test(name), isSurf = /urge surf/i.test(name), isNap = /^nap/i.test(name);
  let total = minutes * 60000, startAt = Date.now(), pausedLeft = null, finished = false;
  const left = () => pausedLeft ?? Math.max(0, startAt + total - Date.now());
  const SURF = [
    "Notice where you feel it in your body. Just notice.",
    "Rate it in your head. You don't have to act on it.",
    "Picture it as a wave. It's building, that's fine.",
    "Breathe into the spot where it's strongest.",
    "Waves peak and then fall. Watch for the peak.",
    "Is it a little lower than a minute ago? Just check.",
  ];
  m.innerHTML = `<div class="box">
    <h2 style="margin-top:0">${esc(cleanName(name))}</h2>
    ${isBox ? `<div class="breath" id="breath"><div class="fill" id="fill"></div><div class="dot" id="dot"></div>
      <div class="breath-label"><div class="phase" id="phase">Breathe in</div><div class="count" id="count">4</div></div></div>` : ""}
    ${isSurf ? `<div class="guide" id="guide">${SURF[0]}</div>` : ""}
    ${isNap ? `<div class="guide">Phone face down. It beeps when time's up if the app is still open.</div>` : ""}
    <div class="${isBox ? "clockwrap small" : "clockwrap ring"}">
      ${isBox ? "" : `<svg class="ringsvg" viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"/><circle class="prog" id="prog" cx="60" cy="60" r="54"/></svg>`}
      <input class="clock" id="clock" inputmode="decimal" autocomplete="off" aria-label="Time left, tap to change">
    </div>
    <div class="hint" style="margin:-4px 0 14px">Tap the time to change it</div>
    <div class="row"><button class="btn" id="tCancel">Stop</button><button class="btn primary" id="tDone">Done</button></div>
  </div>`;
  const clock = $("#clock");
  const fmt = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  // box breathing: 4s in, 4s hold, 4s out, 4s hold, the dot travels around the square
  const corners = [["0", "100%"], ["0", "0"], ["100%", "0"], ["100%", "100%"]];
  const phases = ["Breathe in", "Hold", "Breathe out", "Hold"];
  // the square fills as you breathe in, stays full on the hold, empties as you breathe out
  const fills = [1, 1, .42, .42];
  const C = 2 * Math.PI * 54, prog = $("#prog");
  if (prog) prog.style.strokeDasharray = C;
  let lastPhase = -1;
  const tick = () => {
    const l = left();
    if (document.activeElement !== clock) clock.value = finished ? "Done" : fmt(l);
    const elapsed = total - l;
    if (prog) prog.style.strokeDashoffset = finished ? C : C * (1 - l / total);
    m.querySelector(".box").classList.toggle("finished", finished);
    if (isBox && pausedLeft == null && !finished) {
      const p = Math.floor(elapsed / 4000) % 4;
      $("#count").textContent = 4 - Math.floor((elapsed % 4000) / 1000);
      if (p !== lastPhase) {
        lastPhase = p;
        const [x, y] = corners[(p + 1) % 4];
        setTimeout(() => {
          const d = $("#dot"), f = $("#fill");
          if (d) { d.style.left = x; d.style.top = y; }
          if (f) f.style.transform = `scale(${fills[p]})`;
        }, 30);
        $("#phase").textContent = phases[p];
      }
    }
    if (isBox && finished) { $("#phase").textContent = "Nice"; $("#count").textContent = ""; $("#fill").style.transform = "scale(.42)"; }
    if (isSurf) $("#guide").textContent = SURF[Math.floor(elapsed / 30000) % SURF.length];
    if (l <= 0 && !finished && pausedLeft == null) { finished = true; beep(); clock.value = "Done"; }
  };
  clock.onfocus = () => { pausedLeft = left(); clock.value = ""; clock.placeholder = "min or m:ss"; };
  clock.onkeydown = e => { if (e.key === "Enter") clock.blur(); };
  clock.onblur = () => {
    const ms = parseTime(clock.value);
    if (ms > 0) { total = ms; startAt = Date.now(); finished = false; lastPhase = -1; }
    else if (pausedLeft != null) startAt = Date.now() - (total - pausedLeft);
    pausedLeft = null; clock.placeholder = ""; tick();
  };
  tick(); timerTick = setInterval(tick, 250);
  const close = () => {
    clearInterval(timerTick); m.classList.add("closing");
    setTimeout(() => { m.hidden = true; m.innerHTML = ""; m.classList.remove("closing"); }, 180);
  };
  $("#tCancel").onclick = close;
  $("#tDone").onclick = () => { close(); onDone && onDone(); };
}

/* ===================== RESET ===================== */
VIEWS.reset = () => {
  if (!active) return go("home");
  const ri = settings.riName || "Ri";
  const used = r => active.resets.includes(r) ? " ✓" : "";
  app.innerHTML = `
  ${backBtn()}
  <h1>Big reset</h1>
  <p class="sub">The list didn't cut it. That's okay. Pick one of these.</p>
  ${settings.riPhone
    ? `<a class="btn primary" id="callRi" href="tel:${esc(settings.riPhone)}">Call ${esc(ri)}${used("Call " + ri)}</a>`
    : `<button class="btn primary" id="setRi">Add ${esc(ri)}'s number first</button>`}
  <div class="card">
    <b>Call a friend or family member${used("Call a friend or family member")}</b>
    ${settings.contacts.length
      ? settings.contacts.map(c => `<a class="btn" style="margin-top:8px" data-contact href="tel:${esc(c.phone)}">${esc(c.name)}</a>`).join("")
      : `<p class="muted" style="margin:6px 0 0">No one saved yet. <button class="linkbtn" id="addPeople">Add people in Settings</button></p>`}
  </div>
  <button class="btn" id="napBtn">Nap${used("Nap")}</button>
  <a class="btn" id="claudeBtn" href="https://claude.ai/new" target="_blank" rel="noopener">Talk it out with Claude${used("Talk it out with Claude")}</a>
  <h2>After the reset</h2>
  <button class="btn ok" id="nowSafe">I feel safe now</button>
  <button class="btn bad" id="slipBtn">It didn't hold this time</button>
  <p class="hint">Either way it gets logged. Honest data is the useful kind.</p>`;
  const mark = r => { if (!active.resets.includes(r)) { active.resets.push(r); saveActive(); } };
  $("#backBtn").onclick = () => { active.stage = "ladder"; saveActive(); go("ladder"); };
  if (settings.riPhone) $("#callRi").onclick = () => { mark("Call " + ri); setTimeout(VIEWS.reset, 400); };
  else $("#setRi").onclick = () => go("settings");
  app.querySelectorAll("[data-contact]").forEach(a => a.onclick = () => { mark("Call a friend or family member"); setTimeout(VIEWS.reset, 400); });
  if ($("#addPeople")) $("#addPeople").onclick = () => go("settings");
  $("#napBtn").onclick = () => { mark("Nap"); openTimer("Nap", minutesOf(allItems().find(i => /^nap/i.test(i)) || "") || 20, null); };
  $("#claudeBtn").onclick = () => { mark("Talk it out with Claude"); setTimeout(VIEWS.reset, 400); };
  $("#nowSafe").onclick = () => { active.outcome = "reset"; active.stage = "resolve"; saveActive(); go("resolve"); };
  $("#slipBtn").onclick = () => { active.outcome = "slip"; active.stage = "resolve"; saveActive(); go("resolve"); };
};

/* ===================== RESOLVE ===================== */
VIEWS.resolve = () => {
  if (!active) return go("home");
  if (active.urgeEnd == null) active.urgeEnd = Math.min(active.urgeStart, 2);
  app.innerHTML = `
  ${backBtn()}
  <h1>${active.outcome === "slip" ? "Log it and move on" : "Nice work"}</h1>
  <p class="sub">${active.outcome === "slip" ? "One rough moment doesn't erase the trend. Write down what happened so next time is easier." : "Quick wrap-up, then you're done."}</p>
  <label class="lbl">Urge now</label>
  <div class="urge"><span class="muted">0</span><input type="range" id="urgeEnd" min="0" max="10" value="${active.urgeEnd}"><b id="ueVal">${active.urgeEnd}</b></div>
  <p class="muted">Started at ${active.urgeStart}.</p>
  <label class="lbl" for="notes">Notes</label>
  <textarea id="notes" placeholder="What set it off? What actually helped?">${esc(active.notes || "")}</textarea>
  <div style="margin-top:20px"><button class="btn primary" id="saveBtn">Save to log</button></div>`;
  $("#backBtn").onclick = () => {
    const to = active.outcome === "safe" ? "ladder" : "reset";
    active.stage = to; saveActive(); go(to);
  };
  $("#urgeEnd").oninput = e => { active.urgeEnd = +e.target.value; $("#ueVal").textContent = e.target.value; saveActive(); };
  $("#notes").oninput = e => { active.notes = e.target.value; saveActive(); };
  $("#saveBtn").onclick = () => {
    const ev = {
      id: active.id, start: active.start, end: new Date().toISOString(), track: active.track,
      feeling: active.feeling, urgeStart: active.urgeStart, urgeEnd: active.urgeEnd,
      done: active.done, resets: active.resets, outcome: active.outcome, notes: active.notes || "",
      manual: false, updated: Date.now(),
    };
    events.unshift(ev); saveEvents(); active = null; saveActive();
    app.innerHTML = `
    <div class="home">
      <h1>Saved</h1>
      <p class="sub">${ev.outcome === "slip" ? "Logged. Go easy on yourself." : "That's a win. It's in the log."}</p>
      <div style="width:100%"><button class="btn" id="toLog">See the log</button><button class="btn primary" id="toHome">Done</button></div>
    </div>`;
    $("#toLog").onclick = () => go("history");
    $("#toHome").onclick = () => go("home");
  };
};

/* ===================== HISTORY ===================== */
VIEWS.history = () => {
  app.innerHTML = `
  <h1>Log</h1>
  <div style="margin:12px 0"><button class="btn" id="addManual">+ Add one manually</button></div>
  ${events.length ? events.map(ev => `
    <button class="card ev" data-ev="${ev.id}">
      <div class="top-line"><b>${TRACKS[ev.track]?.short || "?"}</b><span class="pill ${OUTCOMES[ev.outcome]?.pill || ""}">${OUTCOMES[ev.outcome]?.label || "?"}</span></div>
      <div class="muted">${fmtDate(ev.start)}${ev.manual ? " · added by hand" : ""} · urge ${ev.urgeStart ?? "?"} → ${ev.urgeEnd ?? "?"}</div>
      ${ev.feeling ? `<div style="margin-top:4px">${esc(ev.feeling)}</div>` : ""}
    </button>`).join("") : `<p class="muted">Nothing here yet. Hit the button when you need it, or add a past one by hand.</p>`}`;
  $("#addManual").onclick = () => go("detail", null);
  app.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => go("detail", b.dataset.ev));
};

/* ===================== DETAIL / MANUAL ADD ===================== */
VIEWS.detail = id => {
  const existing = id ? events.find(e => e.id === id) : null;
  const ev = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(), start: new Date().toISOString(), end: null, track: "dopamine", feeling: "", urgeStart: 6, urgeEnd: 2,
    done: [], resets: [], outcome: "safe", notes: "", manual: true,
  };
  const grab = () => {
    const w = $("#dWhen").value; if (w) ev.start = new Date(w).toISOString();
    ev.feeling = $("#dFeel").value; ev.urgeStart = +$("#dU1").value; ev.urgeEnd = +$("#dU2").value;
    ev.done = [...app.querySelectorAll("[data-tool]:checked")].map(c => c.dataset.tool);
    ev.resets = [...app.querySelectorAll("[data-reset]:checked")].map(c => c.dataset.reset);
    ev.outcome = $("#dOut").value; ev.notes = $("#dNotes").value;
  };
  const draw = () => {
    const tools = [...new Set([...allItems(), ...ev.done])];
    app.innerHTML = `
    ${backBtn()}
    <h1>${existing ? "Edit entry" : "Add an entry"}</h1>
    <label class="lbl">When</label>
    <input type="datetime-local" id="dWhen" value="${toLocalInput(ev.start)}">
    <label class="lbl">Which one</label>
    <div class="choice">${Object.entries(TRACKS).map(([k, t]) => `<button data-track="${k}" class="${ev.track === k ? "on" : ""}">${t.label}</button>`).join("")}</div>
    <label class="lbl">One line</label>
    <input type="text" id="dFeel" value="${esc(ev.feeling)}">
    <label class="lbl">Urge at the start</label>
    <div class="urge"><input type="range" id="dU1" min="0" max="10" value="${ev.urgeStart ?? 5}"><b id="dU1v">${ev.urgeStart ?? 5}</b></div>
    <label class="lbl">Urge at the end</label>
    <div class="urge"><input type="range" id="dU2" min="0" max="10" value="${ev.urgeEnd ?? 2}"><b id="dU2v">${ev.urgeEnd ?? 2}</b></div>
    <label class="lbl">What you did</label>
    <div class="card checks">${tools.map(t => `<label><input type="checkbox" data-tool="${esc(t)}" ${ev.done.includes(t) ? "checked" : ""}>${esc(t)}</label>`).join("")}</div>
    <label class="lbl">Resets</label>
    <div class="card checks">${[...new Set([...resetsList(), ...ev.resets])].map(r => `<label><input type="checkbox" data-reset="${esc(r)}" ${ev.resets.includes(r) ? "checked" : ""}>${esc(r)}</label>`).join("")}</div>
    <label class="lbl">How it ended</label>
    <select id="dOut">${Object.entries(OUTCOMES).map(([k, o]) => `<option value="${k}" ${ev.outcome === k ? "selected" : ""}>${o.label}</option>`).join("")}</select>
    <label class="lbl">Notes</label>
    <textarea id="dNotes">${esc(ev.notes)}</textarea>
    <div style="margin-top:20px">
      <button class="btn primary" id="dSave">Save</button>
      ${existing ? `<button class="btn bad" id="dDel">Delete</button>` : ""}
    </div>`;
    $("#backBtn").onclick = () => go("history");
    app.querySelectorAll("[data-track]").forEach(b => b.onclick = () => { grab(); ev.track = b.dataset.track; draw(); });
    $("#dU1").oninput = e => $("#dU1v").textContent = e.target.value;
    $("#dU2").oninput = e => $("#dU2v").textContent = e.target.value;
    $("#dSave").onclick = () => {
      grab(); ev.updated = Date.now();
      if (existing) Object.assign(existing, ev); else events.push(ev);
      events.sort((a, b) => b.start.localeCompare(a.start));
      saveEvents(); toast("Saved"); go("history");
    };
    if (existing) $("#dDel").onclick = () => {
      if (!confirm("Delete this entry for good?")) return;
      events = events.filter(e => e.id !== existing.id); deleted[existing.id] = Date.now();
      saveEvents(); go("history");
    };
  };
  draw();
};

/* ===================== INSIGHTS ===================== */
VIEWS.insights = () => {
  if (!events.length) {
    app.innerHTML = `<h1>Insights</h1><p class="muted">This fills in once you've logged a few. Each entry adds data on which tools actually bring the urge down.</p>`;
    return;
  }
  const held = events.filter(e => e.outcome !== "slip").length;
  const drops = events.filter(e => e.urgeStart != null && e.urgeEnd != null).map(e => e.urgeStart - e.urgeEnd);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const last30 = events.filter(e => Date.now() - new Date(e.start) < 30 * 864e5).length;
  const tools = {};
  events.forEach(e => [...e.done, ...e.resets].forEach(t => {
    const k = cleanName(t);
    tools[k] = tools[k] || { uses: 0, drops: [], held: 0 };
    tools[k].uses++; if (e.outcome !== "slip") tools[k].held++;
    if (e.urgeStart != null && e.urgeEnd != null) tools[k].drops.push(e.urgeStart - e.urgeEnd);
  }));
  const toolRows = Object.entries(tools).map(([k, v]) => ({ k, ...v, avg: avg(v.drops) }))
    .sort((a, b) => b.avg - a.avg || b.uses - a.uses);
  const maxDrop = Math.max(1, ...toolRows.map(r => r.avg));
  const byTrack = Object.keys(TRACKS).map(t => ({ t, n: events.filter(e => e.track === t).length }));
  const buckets = [["Morning", 5, 12], ["Afternoon", 12, 17], ["Evening", 17, 22], ["Late night", 22, 29]];
  const byTime = buckets.map(([name, a, b]) => ({
    name, n: events.filter(e => { let h = new Date(e.start).getHours(); if (h < 5) h += 24; return h >= a && h < b; }).length,
  }));
  const maxTime = Math.max(1, ...byTime.map(x => x.n));
  app.innerHTML = `
  <h1>Insights</h1>
  <div class="card stats3">
    <div><b>${events.length}</b><span class="muted">logged</span></div>
    <div><b>${Math.round(held / events.length * 100)}%</b><span class="muted">held</span></div>
    <div><b>${avg(drops).toFixed(1)}</b><span class="muted">avg urge drop</span></div>
  </div>
  <p class="muted">${last30} in the last 30 days. ${byTrack.map(x => `${TRACKS[x.t].short}: ${x.n}`).join(" · ")}</p>
  <h2>What brings it down most</h2>
  <p class="muted">Average urge drop in sessions where you used it. More uses means more trustworthy.</p>
  ${toolRows.map(r => `<div class="card">
    <div class="stat"><b>${esc(r.k)}</b><span>${r.avg.toFixed(1)}</span></div>
    <div class="bar"><i style="width:${Math.max(0, r.avg) / maxDrop * 100}%"></i></div>
    <div class="muted" style="margin-top:4px">Used ${r.uses}× · held ${r.held} of ${r.uses}</div>
  </div>`).join("")}
  <h2>When it hits</h2>
  <div class="card">${byTime.map(x => `<div style="margin:6px 0"><div class="stat"><span>${x.name}</span><span>${x.n}</span></div>
    <div class="bar"><i style="width:${x.n / maxTime * 100}%"></i></div></div>`).join("")}</div>`;
};

/* ===================== SETTINGS ===================== */
VIEWS.settings = () => {
  const ladderText = ladder().map(items => items.join("\n")).join("\n---\n");
  app.innerHTML = `
  <h1>Settings</h1>
  <h2>Sync across devices</h2>
  <div class="card" id="syncCard"><p class="muted" style="margin:0">Checking...</p></div>

  <h2>${esc(settings.riName || "Ri")}</h2>
  <label class="lbl" for="sRiName">Name</label>
  <input type="text" id="sRiName" value="${esc(settings.riName)}">
  <label class="lbl" for="sRiPhone">Phone number</label>
  <input type="tel" id="sRiPhone" placeholder="801-555-1234" value="${esc(settings.riPhone)}">

  <h2>Friends and family to call</h2>
  <div id="people">${settings.contacts.map((c, i) => `
    <div class="row" style="margin-bottom:8px">
      <input type="text" data-cname="${i}" placeholder="Name" value="${esc(c.name)}">
      <input type="tel" data-cphone="${i}" placeholder="Number" value="${esc(c.phone)}">
      <button class="btn bad" style="flex:0 0 52px;padding:10px" data-cdel="${i}">✕</button>
    </div>`).join("")}</div>
  <button class="btn" id="addPerson">+ Add person</button>

  <h2>Your list</h2>
  <p class="muted">One item per line. Put a line with just <b>---</b> between tiers. End an item with something like <b>(5 min)</b> to give it a timer.</p>
  <textarea id="ladderBox" style="min-height:320px">${esc(ladderText)}</textarea>
  <button class="btn" id="resetLadder" style="margin-top:10px">Put the list back to default</button>

  <div style="margin-top:20px"><button class="btn primary" id="sSave">Save settings</button></div>

  <h2>Backup</h2>
  <p class="muted">Export a copy of everything now and then, just in case.</p>
  <div class="row"><button class="btn" id="exp">Export backup</button><button class="btn" id="imp">Import backup</button></div>
  <input type="file" id="impFile" accept="application/json,.json" hidden>`;

  const pull = () => {
    settings.riName = $("#sRiName").value.trim() || "Ri";
    settings.riPhone = $("#sRiPhone").value.trim();
    settings.contacts = settings.contacts.map((c, i) => ({
      name: $(`[data-cname="${i}"]`).value.trim(), phone: $(`[data-cphone="${i}"]`).value.trim(),
    }));
    const tiers = $("#ladderBox").value.split(/^\s*---\s*$/m)
      .map(block => block.split("\n").map(s => s.trim()).filter(Boolean)).filter(t => t.length);
    settings.ladder = tiers.length ? tiers : DEFAULT_LADDER;
  };
  $("#addPerson").onclick = () => { pull(); settings.contacts.push({ name: "", phone: "" }); VIEWS.settings(); };
  app.querySelectorAll("[data-cdel]").forEach(b => b.onclick = () => { pull(); settings.contacts.splice(+b.dataset.cdel, 1); VIEWS.settings(); });
  $("#resetLadder").onclick = () => { $("#ladderBox").value = DEFAULT_LADDER.map(i => i.join("\n")).join("\n---\n"); };
  $("#sSave").onclick = () => {
    pull(); settings.contacts = settings.contacts.filter(c => c.name || c.phone);
    saveSettings(); toast("Saved"); VIEWS.settings();
  };
  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify({ settings, events, deleted, exported: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("#imp").onclick = () => $("#impFile").click();
  $("#impFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.events)) throw 0;
      if (!confirm(`Load ${data.events.length} entries from this backup? Entries already here stay, duplicates are skipped.`)) return;
      mergeRemote({ events: data.events, deleted: data.deleted || {}, settings: data.settings || null });
      saveEvents(); save(K.settings, settings); toast("Backup loaded"); VIEWS.settings();
    } catch { toast("That file isn't a backup from this app"); }
  };
  renderSyncCard();
};

/* ===================== SYNC =====================
   Your log is stored in a PRIVATE repo (panicbutton-data/data.json).
   Reaching it needs a GitHub token. The token is locked with your sync password
   and that locked copy (vault.json) sits in this public repo, so a new device only
   needs the password. Without the password the locked copy is useless. */
const GH = { owner: "Feirzen", appRepo: "panicbutton", dataRepo: "panicbutton-data", file: "data.json", vault: "vault.json" };
const ITER = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();
const u8ToB64 = u8 => { let s = ""; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
const b64ToU8 = b64 => Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0));
const textToB64 = str => u8ToB64(enc.encode(str));
const b64ToText = b64 => dec.decode(b64ToU8(b64));

async function deriveKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function lockToken(token, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt, ITER);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(token)));
  return { v: 1, iter: ITER, salt: u8ToB64(salt), iv: u8ToB64(iv), ct: u8ToB64(ct) };
}
async function unlockToken(vault, pw) {
  const key = await deriveKey(pw, b64ToU8(vault.salt), vault.iter || ITER);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToU8(vault.iv) }, key, b64ToU8(vault.ct));
  return dec.decode(pt);
}
function gh(path, opts = {}, token = sync?.token) {
  return fetch("https://api.github.com" + path, {
    cache: "no-store", ...opts,
    headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(opts.headers || {}) },
  });
}
async function fetchVault() {
  try {
    const r = await gh(`/repos/${GH.owner}/${GH.appRepo}/contents/${GH.vault}`, {}, null);
    if (r.status === 200) return JSON.parse(b64ToText((await r.json()).content));
  } catch {}
  try { const r = await fetch(GH.vault, { cache: "no-store" }); if (r.ok) return await r.json(); } catch {}
  return null;
}

function syncedSettings() {
  const { riName, riPhone, contacts, ladder, updated } = settings;
  return { riName, riPhone, contacts, ladder, updated: updated || 0 };
}
function payload() { return { events, deleted, settings: syncedSettings() }; }
function mergeRemote(remote) {
  for (const [id, t] of Object.entries(remote.deleted || {})) if (!deleted[id] || deleted[id] < t) deleted[id] = t;
  const map = new Map(events.map(e => [e.id, e]));
  for (const re of remote.events || []) {
    migrate(re);
    const le = map.get(re.id);
    if (!le || (re.updated || 0) > (le.updated || 0)) map.set(re.id, re);
  }
  for (const [id, t] of Object.entries(deleted)) { const e = map.get(id); if (e && (e.updated || 0) <= t) map.delete(id); }
  events = [...map.values()].sort((a, b) => b.start.localeCompare(a.start));
  if (remote.settings && (remote.settings.updated || 0) > (settings.updated || 0)) {
    settings = Object.assign({}, DEFAULT_SETTINGS, settings, remote.settings);
  }
}

let syncTimer = null, syncing = null, syncAgain = false;
function queueSync() { if (!sync?.token) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 800); }
async function syncNow() {
  if (!sync?.token) return;
  if (syncing) { syncAgain = true; return syncing; }
  const before = JSON.stringify(payload());
  syncing = (async () => {
    try {
      const path = `/repos/${GH.owner}/${GH.dataRepo}/contents/${GH.file}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await gh(path);
        let sha, remoteText = "";
        if (r.status === 200) { const j = await r.json(); sha = j.sha; remoteText = b64ToText(j.content); }
        else if (r.status === 401 || r.status === 403) throw new Error("auth");
        else if (r.status !== 404) throw new Error("GitHub said " + r.status);
        if (remoteText) mergeRemote(JSON.parse(remoteText));
        save(K.events, events); save(K.deleted, deleted); save(K.settings, settings);
        const out = JSON.stringify(payload(), null, 1);
        if (remoteText && JSON.stringify(JSON.parse(remoteText)) === JSON.stringify(JSON.parse(out))) break;
        const put = await gh(path, { method: "PUT", body: JSON.stringify({ message: "sync", content: textToB64(out), ...(sha ? { sha } : {}) }) });
        if (put.ok) break;
        if (put.status === 401 || put.status === 403) throw new Error("auth");
        if (put.status !== 409 && put.status !== 422) throw new Error("GitHub said " + put.status);
        // someone else saved at the same moment, loop and merge again
      }
      sync.last = Date.now(); sync.error = null;
    } catch (err) {
      sync.error = err.message === "auth" ? "The sync token stopped working. Set sync up again." :
                   (navigator.onLine === false ? "Offline. It'll catch up next time." : String(err.message || err));
    }
    saveSync();
  })();
  await syncing; syncing = null;
  if (JSON.stringify(payload()) !== before && ["home", "history", "insights"].includes(view)) go(view);
  if (view === "settings") renderSyncCard();
  if (syncAgain) { syncAgain = false; syncNow(); }
}

async function renderSyncCard() {
  const card = $("#syncCard"); if (!card) return;
  if (sync?.token) {
    card.innerHTML = `
      <p style="margin:0 0 4px"><b>On.</b> This device is synced.</p>
      <p class="muted" style="margin:0 0 10px">${sync.error ? esc(sync.error) : sync.last ? "Last synced " + fmtDate(new Date(sync.last).toISOString()) : "Syncing..."}</p>
      <div class="row"><button class="btn" id="syncGo">Sync now</button><button class="btn bad" id="syncOff">Turn off here</button></div>`;
    $("#syncGo").onclick = () => { card.querySelector(".muted").textContent = "Syncing..."; syncNow(); };
    $("#syncOff").onclick = () => {
      if (!confirm("Turn off sync on this device? Your log stays here and in the private repo.")) return;
      sync = null; saveSync(); renderSyncCard();
    };
    return;
  }
  const vault = await fetchVault();
  if (vault && !card.dataset.setup) {
    card.innerHTML = `
      <p class="muted" style="margin:0 0 10px">Enter your sync password to see and save the shared log on this device.</p>
      <input type="password" id="pw" placeholder="Sync password" autocomplete="current-password">
      <button class="btn primary" id="unlock" style="margin-top:10px">Unlock</button>
      <button class="linkbtn" id="redo" style="margin-top:8px">Set sync up from scratch instead</button>`;
    $("#unlock").onclick = async () => {
      const b = $("#unlock"); b.disabled = true; b.textContent = "Checking...";
      try {
        const token = await unlockToken(vault, $("#pw").value);
        sync = { token, last: null, error: null }; saveSync();
        toast("Unlocked"); renderSyncCard(); syncNow();
      } catch { toast("Wrong password"); b.disabled = false; b.textContent = "Unlock"; }
    };
    $("#pw").onkeydown = e => { if (e.key === "Enter") $("#unlock").click(); };
    $("#redo").onclick = () => { card.dataset.setup = "1"; renderSyncCard(); };
    return;
  }
  card.innerHTML = `
    <p class="muted" style="margin:0 0 6px">First-time setup. Do this once, then other devices just need the password.</p>
    <label class="lbl" for="tok">GitHub token</label>
    <input type="password" id="tok" placeholder="github_pat_..." autocomplete="off">
    <label class="lbl" for="pw1">Make a sync password</label>
    <input type="password" id="pw1" autocomplete="new-password" placeholder="Something long you'll remember">
    <input type="password" id="pw2" autocomplete="new-password" placeholder="Type it again" style="margin-top:8px">
    <button class="btn primary" id="setup" style="margin-top:12px">Turn on sync</button>`;
  $("#setup").onclick = async () => {
    const token = $("#tok").value.trim(), pw = $("#pw1").value;
    if (!token) return toast("Paste the token first");
    if (pw.length < 8) return toast("Use at least 8 characters");
    if (pw !== $("#pw2").value) return toast("Passwords don't match");
    const b = $("#setup"); b.disabled = true; b.textContent = "Setting up...";
    try {
      const d = await gh(`/repos/${GH.owner}/${GH.dataRepo}`, {}, token);
      if (!d.ok) throw new Error(`Can't reach ${GH.dataRepo}. Check the token has access to it.`);
      const vault = await lockToken(token, pw);
      const vpath = `/repos/${GH.owner}/${GH.appRepo}/contents/${GH.vault}`;
      const cur = await gh(vpath, {}, token);
      const sha = cur.status === 200 ? (await cur.json()).sha : undefined;
      const put = await gh(vpath, { method: "PUT", body: JSON.stringify({ message: "Update sync vault", content: textToB64(JSON.stringify(vault, null, 1)), ...(sha ? { sha } : {}) }) }, token);
      if (!put.ok) throw new Error(`Can't save to ${GH.appRepo}. Check the token has access to it with Contents: Read and write.`);
      sync = { token, last: null, error: null }; saveSync();
      // this device's settings become the starting point for every other device
      if (!settings.updated) { settings.updated = Date.now(); save(K.settings, settings); }
      delete card.dataset.setup; toast("Sync is on"); renderSyncCard(); syncNow();
    } catch (err) { toast(err.message || "Setup failed"); b.disabled = false; b.textContent = "Turn on sync"; }
  };
}

/* ===================== BOOT ===================== */
applyTheme();
go("home");
syncNow();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

/* Shared kit (Feirzen/flag-hub): the top-right button becomes the settings gear with
   Look, Flag, Sound, and a shortcut to the Settings page. Panic Button paints its own looks.
   Keep the kit <script> tag at the bottom of index.html. */
const PB_GEAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const PB_SPEAKER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
const PB_NAMES = { midnight: "dark", paper: "light", sepia: "sepia", chameleon: "chameleon" };
window.KitConfig = {
  gear: "#themeBtn",
  look: {
    get: () => ({ theme: PB_NAMES[theme] || "dark", tone: cham.tone, locked: !!cham.lock }),
    set: t => { theme = Object.keys(PB_NAMES).find(k => PB_NAMES[k] === t) || "midnight"; save(K.theme, theme); cham.lock = null; save("pb.cham", cham); applyTheme(); },
    tone: t => { const was = !!cham.lock; cham.tone = t; paintCham(makeChameleon()); cham.lock = was ? chamNow : null; save("pb.cham", cham); },
    lock: on => { cham.lock = on ? chamNow : null; save("pb.cham", cham); },
    reroll: () => paintCham(makeChameleon()),
  },
  tray: [{
    id: "sound", label: "Alert sound", icon: PB_SPEAKER,
    slider: { min: 0, max: 1, step: 0.05, get: () => snd.vol, set: v => { snd.vol = v; save("pb.sound", snd); } },
    toggle: { label: "Timer beep", get: () => snd.on, set: on => { snd.on = on; save("pb.sound", snd); if (on) beep(); } },
  }],
  more: () => go("settings"),
};
$("#themeBtn").innerHTML = PB_GEAR;
