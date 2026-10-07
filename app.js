/* Panic Button — everything lives in this browser's storage on the phone. Nothing is sent anywhere. */
"use strict";

/* ===================== DEFAULTS ===================== */
const TRACKS = {
  dopamine: { label: "Dopamine spiral", short: "Dopamine" },
  tension:  { label: "Sexual tension",  short: "Tension" },
};
const TIER_NAMES = ["Quick and easy", "A little more", "Bigger moves"];
// "(N min)" at the end of an item gives it a timer.
const DEFAULT_LADDERS = {
  dopamine: [
    ["Splash cold water on your face", "10 pushups", "Box breathing (1 min)"],
    ["Change rooms", "Timer on one task (25 min)"],
    ["Walk outside", "Shower"],
  ],
  tension: [
    ["Leave the room or the stimulus", "Splash cold water on your face", "A few long, slow exhales"],
    ["Hard exercise set", "Urge surfing (5 min)", "Cold shower"],
    ["Walk outside", "Prayer"],
  ],
};
const DEFAULT_SETTINGS = {
  theme: "midnight", riName: "Ri", riPhone: "", contacts: [],
  ladders: DEFAULT_LADDERS, napMinutes: 20,
};
const OUTCOMES = {
  safe:  { label: "Safe (ladder)", pill: "safe" },
  reset: { label: "Safe (after reset)", pill: "reset" },
  slip:  { label: "Didn't hold this time", pill: "slip" },
};

/* ===================== STORAGE ===================== */
const K = { settings: "pb.settings", events: "pb.events", active: "pb.active" };
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { toast("Couldn't save, storage is full or blocked"); }
}
let settings = Object.assign({}, DEFAULT_SETTINGS, load(K.settings, {}));
let events = load(K.events, []);
let active = load(K.active, null);   // the session in progress, so closing the app doesn't lose it
const saveSettings = () => save(K.settings, settings);
const saveEvents = () => save(K.events, events);
const saveActive = () => active ? save(K.active, active) : localStorage.removeItem(K.active);

/* ===================== HELPERS ===================== */
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const minutesOf = name => { const m = /\((\d+(?:\.\d+)?)\s*min\)\s*$/i.exec(name); return m ? parseFloat(m[1]) : 0; };
const ladderFor = t => settings.ladders[t] || DEFAULT_LADDERS[t];
const allItems = t => ladderFor(t).flat();
function resetsList() {
  return [`Call ${settings.riName || "Ri"}`, "Call a friend or family member", "Nap", "Talk it out with Claude"];
}
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
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach(off => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(.2, ctx.currentTime + off); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + off + .3);
      o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + .3);
    });
  } catch {}
}

/* ===================== THEMES ===================== */
const THEMES = {
  midnight:  { label: "Dark",      swatch: "#0f0f13" },
  paper:     { label: "Light",     swatch: "#f6f3ec" },
  sepia:     { label: "Sepia",     swatch: "#2a211a" },
  chameleon: { label: "Chameleon", swatch: "conic-gradient(#f87171,#fbbf24,#34d399,#38bdf8,#a78bfa,#f87171)" },
};
const CHAM_VARS = ["bg", "surface", "surface2", "border", "text", "dim", "muted", "accent", "ok", "bad", "star", "shadow"];
function makeChameleon() {
  const h = Math.floor(Math.random() * 360);
  const acc = (h + 120 + Math.floor(Math.random() * 110)) % 360;
  const H = (x, s, l) => `hsl(${x} ${s}% ${l}%)`;
  if (Math.random() < 0.28) return {
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
  const t = THEMES[settings.theme] ? settings.theme : "midnight";
  const root = document.documentElement;
  root.setAttribute("data-theme", t);
  if (t === "chameleon") {
    const pal = makeChameleon();
    CHAM_VARS.forEach(v => root.style.setProperty("--" + v, pal[v]));
  } else {
    CHAM_VARS.forEach(v => root.style.removeProperty("--" + v));
  }
  requestAnimationFrame(() => $("#themeColorMeta").setAttribute("content", getComputedStyle(document.body).backgroundColor));
}
function renderThemePop() {
  const pop = $("#themePop");
  pop.innerHTML = Object.entries(THEMES).map(([k, t]) =>
    `<button class="sw ${settings.theme === k ? "on" : ""}" data-theme="${k}"><i style="background:${t.swatch}"></i>${t.label}</button>`).join("");
}
$("#themeBtn").onclick = e => { e.stopPropagation(); renderThemePop(); $("#themePop").hidden = !$("#themePop").hidden; };
$("#themePop").onclick = e => {
  const b = e.target.closest("[data-theme]"); if (!b) return;
  settings.theme = b.dataset.theme; saveSettings(); applyTheme(); renderThemePop(); // tapping chameleon again re-rolls
};
document.addEventListener("click", e => { if (!e.target.closest("#themePop") && e.target.id !== "themeBtn") $("#themePop").hidden = true; });

/* ===================== ROUTER ===================== */
let view = "home", viewArg = null;
function go(v, arg = null) {
  view = v; viewArg = arg;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.go === v));
  ({ home, start, ladder, reset, resolve, history, detail, insights, settingsView }[v] || home)(arg);
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go === "settings" ? "settingsView" : b.dataset.go));

/* ===================== HOME ===================== */
function home() {
  app.innerHTML = `
  <div class="home">
    <h1>Hit the button</h1>
    <p class="sub">Name it, work the list, get back to steady.</p>
    <div class="bigwrap"><button class="big" id="bigBtn" aria-label="Start"></button></div>
    ${active ? `<div class="card resume" style="width:100%">
        <p style="margin:0 0 10px">You have one in progress from ${fmtDate(active.start)}.</p>
        <button class="btn primary" id="resumeBtn">Pick it back up</button>
        <button class="btn" id="dropBtn">Discard it</button></div>` : ""}
    <p class="muted">${events.length ? `${events.length} logged so far.` : "Nothing logged yet."}</p>
  </div>`;
  $("#bigBtn").onclick = () => {
    if (navigator.vibrate) navigator.vibrate(30);
    active = { id: uid(), start: new Date().toISOString(), track: null, feeling: "", urgeStart: 6, done: [], resets: [], stage: "start" };
    saveActive(); go("start");
  };
  if (active) {
    $("#resumeBtn").onclick = () => go(active.stage || "start");
    $("#dropBtn").onclick = () => { if (confirm("Discard this one without saving?")) { active = null; saveActive(); home(); } };
  }
}

/* ===================== START ===================== */
function start() {
  if (!active) return go("home");
  app.innerHTML = `
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
  app.querySelectorAll("[data-track]").forEach(b => b.onclick = () => {
    active.track = b.dataset.track; saveActive();
    app.querySelectorAll("[data-track]").forEach(x => x.classList.toggle("on", x === b));
    $("#goBtn").disabled = false;
  });
  $("#feel").oninput = e => { active.feeling = e.target.value; saveActive(); };
  $("#urge").oninput = e => { active.urgeStart = +e.target.value; $("#urgeVal").textContent = e.target.value; saveActive(); };
  $("#goBtn").onclick = () => { active.stage = "ladder"; saveActive(); go("ladder"); };
}

/* ===================== LADDER ===================== */
function ladder() {
  if (!active || !active.track) return go("home");
  const tiers = ladderFor(active.track);
  const total = tiers.flat().length;
  const need = Math.ceil(total * 0.75);
  const n = active.done.length;
  app.innerHTML = `
  <h1>${TRACKS[active.track].label}</h1>
  <p class="sub">${active.feeling ? `"${esc(active.feeling)}"` : "Start at the top. Check things off as you go."}</p>
  ${tiers.map((items, i) => `
    <div class="tier"><h3>${TIER_NAMES[i] || "Tier " + (i + 1)}</h3>
    ${items.map(name => {
      const done = active.done.includes(name), min = minutesOf(name);
      return `<div class="item ${done ? "done" : ""}">
        <button class="check" data-item="${esc(name)}" aria-label="Done">${done ? "✓" : ""}</button>
        <span class="name">${esc(name)}</span>
        ${min ? `<button class="timer" data-timer="${esc(name)}">Start</button>` : ""}
      </div>`;
    }).join("")}
    </div>`).join("")}
  <div class="sticky-foot">
    <div class="row">
      <button class="btn ok" id="safeBtn" ${n >= 1 ? "" : "disabled"}>I feel safe</button>
      <button class="btn bad" id="noHelpBtn" ${n >= need ? "" : "disabled"}>Didn't really help</button>
    </div>
    <div class="hint">${n >= need ? "Both options open." : `"Didn't really help" opens after ${need} of ${total}. You're at ${n}.`}</div>
  </div>`;
  app.querySelectorAll("[data-item]").forEach(b => b.onclick = () => toggleDone(b.dataset.item));
  app.querySelectorAll("[data-timer]").forEach(b => b.onclick = () => openTimer(b.dataset.timer, minutesOf(b.dataset.timer), () => {
    if (!active.done.includes(b.dataset.timer)) toggleDone(b.dataset.timer);
  }));
  $("#safeBtn").onclick = () => { active.outcome = "safe"; active.stage = "resolve"; saveActive(); go("resolve"); };
  $("#noHelpBtn").onclick = () => { active.stage = "reset"; saveActive(); go("reset"); };
}
function toggleDone(name) {
  const i = active.done.indexOf(name);
  if (i >= 0) active.done.splice(i, 1); else active.done.push(name);
  saveActive(); ladder();
}

/* ===================== TIMER MODAL ===================== */
let timerTick = null;
function openTimer(name, minutes, onDone) {
  const m = $("#modal"); m.hidden = false;
  const isBox = /box breath/i.test(name), isSurf = /urge surf/i.test(name), isNap = /^nap$/i.test(name);
  const end = Date.now() + minutes * 60000;
  const SURF = [
    "Notice where you feel it in your body. Just notice.",
    "Rate it in your head. You don't have to act on it.",
    "Picture it as a wave. It's building, that's fine.",
    "Breathe into the spot where it's strongest.",
    "Waves peak and then fall. Watch for the peak.",
    "Is it a little lower than a minute ago? Just check.",
  ];
  m.innerHTML = `<div class="box">
    <h2 style="margin-top:0">${esc(name.replace(/\s*\(.*\)\s*$/, ""))}</h2>
    ${isBox ? `<div class="breath"><div class="dot" id="dot"></div></div><div class="phase" id="phase">Breathe in</div>` : ""}
    ${isSurf ? `<div class="guide" id="guide">${SURF[0]}</div>` : ""}
    ${isNap ? `<div class="guide">Phone face down. The alarm will beep if the app is open.</div>` : ""}
    <div class="clock" id="clock"></div>
    <div class="row"><button class="btn" id="tCancel">Stop</button><button class="btn primary" id="tDone">Done</button></div>
  </div>`;
  // box breathing: 4s in, 4s hold, 4s out, 4s hold, dot travels around the square
  const corners = [["0", "100%"], ["0", "0"], ["100%", "0"], ["100%", "100%"]];
  const phases = ["Breathe in", "Hold", "Breathe out", "Hold"];
  let lastPhase = -1;
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    const s = Math.ceil(left / 1000);
    $("#clock").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const elapsed = minutes * 60000 - left;
    if (isBox) {
      const p = Math.floor(elapsed / 4000) % 4;
      if (p !== lastPhase) {
        lastPhase = p;
        const [x, y] = corners[(p + 1) % 4];
        // short delay so the very first move animates instead of jumping
        setTimeout(() => { const d = $("#dot"); if (d) { d.style.left = x; d.style.top = y; } }, 30);
        $("#phase").textContent = phases[p];
      }
    }
    if (isSurf) $("#guide").textContent = SURF[Math.floor(elapsed / 30000) % SURF.length];
    if (left <= 0) { clearInterval(timerTick); beep(); $("#clock").textContent = "Done"; }
  };
  tick(); timerTick = setInterval(tick, 250);
  const close = () => { clearInterval(timerTick); m.hidden = true; m.innerHTML = ""; };
  $("#tCancel").onclick = close;
  $("#tDone").onclick = () => { close(); onDone && onDone(); };
}

/* ===================== RESET ===================== */
function reset() {
  if (!active) return go("home");
  const ri = settings.riName || "Ri";
  const used = r => active.resets.includes(r) ? " ✓" : "";
  app.innerHTML = `
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
  <button class="btn" id="napBtn">Nap (${settings.napMinutes} min)${used("Nap")}</button>
  <a class="btn" id="claudeBtn" href="https://claude.ai/new" target="_blank" rel="noopener">Talk it out with Claude${used("Talk it out with Claude")}</a>
  <h2>After the reset</h2>
  <button class="btn ok" id="nowSafe">I feel safe now</button>
  <button class="btn bad" id="slipBtn">It didn't hold this time</button>
  <p class="hint">Either way it gets logged. Honest data is the useful kind.</p>`;
  const mark = r => { if (!active.resets.includes(r)) { active.resets.push(r); saveActive(); } };
  if (settings.riPhone) $("#callRi").onclick = () => { mark("Call " + ri); setTimeout(reset, 400); };
  else $("#setRi").onclick = () => go("settingsView");
  app.querySelectorAll("[data-contact]").forEach(a => a.onclick = () => { mark("Call a friend or family member"); setTimeout(reset, 400); });
  if ($("#addPeople")) $("#addPeople").onclick = () => go("settingsView");
  $("#napBtn").onclick = () => { mark("Nap"); openTimer("Nap", settings.napMinutes, null); };
  $("#claudeBtn").onclick = () => { mark("Talk it out with Claude"); setTimeout(reset, 400); };
  $("#nowSafe").onclick = () => { active.outcome = "reset"; active.stage = "resolve"; saveActive(); go("resolve"); };
  $("#slipBtn").onclick = () => { active.outcome = "slip"; active.stage = "resolve"; saveActive(); go("resolve"); };
}

/* ===================== RESOLVE ===================== */
function resolve() {
  if (!active) return go("home");
  if (active.urgeEnd == null) active.urgeEnd = Math.min(active.urgeStart, 2);
  app.innerHTML = `
  <h1>${active.outcome === "slip" ? "Log it and move on" : "Nice work"}</h1>
  <p class="sub">${active.outcome === "slip" ? "One rough moment doesn't erase the trend. Write down what happened so next time is easier." : "Quick wrap-up, then you're done."}</p>
  <label class="lbl">Urge now</label>
  <div class="urge"><span class="muted">0</span><input type="range" id="urgeEnd" min="0" max="10" value="${active.urgeEnd}"><b id="ueVal">${active.urgeEnd}</b></div>
  <p class="muted">Started at ${active.urgeStart}.</p>
  <label class="lbl" for="notes">Notes</label>
  <textarea id="notes" placeholder="What set it off? What actually helped?">${esc(active.notes || "")}</textarea>
  <div style="margin-top:20px"><button class="btn primary" id="saveBtn">Save to log</button></div>`;
  $("#urgeEnd").oninput = e => { active.urgeEnd = +e.target.value; $("#ueVal").textContent = e.target.value; saveActive(); };
  $("#notes").oninput = e => { active.notes = e.target.value; saveActive(); };
  $("#saveBtn").onclick = () => {
    const ev = {
      id: active.id, start: active.start, end: new Date().toISOString(), track: active.track,
      feeling: active.feeling, urgeStart: active.urgeStart, urgeEnd: active.urgeEnd,
      done: active.done, resets: active.resets, outcome: active.outcome, notes: active.notes || "", manual: false,
    };
    events.unshift(ev); saveEvents(); active = null; saveActive();
    afterSave(ev);
  };
}
function afterSave(ev) {
  const ri = settings.riName || "Ri";
  app.innerHTML = `
  <div class="home">
    <h1>Saved</h1>
    <p class="sub">${ev.outcome === "slip" ? "Logged. Go easy on yourself." : "That's a win. It's in the log."}</p>
    <div style="width:100%">
      ${settings.riPhone ? `<a class="btn primary" href="${smsLink(settings.riPhone, summaryText(ev))}">Text ${esc(ri)} a summary</a>` : ""}
      <button class="btn" id="toLog">See the log</button>
      <button class="btn" id="toHome">Done</button>
    </div>
  </div>`;
  $("#toLog").onclick = () => go("history");
  $("#toHome").onclick = () => go("home");
}
function smsLink(phone, body) { return `sms:${encodeURIComponent(phone)}&body=${encodeURIComponent(body)}`; }
function summaryText(ev) {
  const helped = [...ev.done, ...ev.resets];
  return [
    `${TRACKS[ev.track]?.short || ""} moment, ${fmtDate(ev.start)}.`,
    `Urge ${ev.urgeStart} to ${ev.urgeEnd ?? "?"}. ${OUTCOMES[ev.outcome]?.label || ""}.`,
    helped.length ? `Did: ${helped.map(h => h.replace(/\s*\(.*\)\s*$/, "")).join(", ")}.` : "",
    ev.notes ? `Notes: ${ev.notes}` : "",
  ].filter(Boolean).join("\n");
}

/* ===================== HISTORY ===================== */
function history() {
  app.innerHTML = `
  <h1>Log</h1>
  <div class="row" style="margin:12px 0">
    <button class="btn" id="addManual">+ Add one manually</button>
    <button class="btn" id="shareLog">Share log</button>
  </div>
  ${events.length ? events.map(ev => `
    <button class="card ev" data-ev="${ev.id}">
      <div class="top-line"><b>${TRACKS[ev.track]?.short || "?"}</b><span class="pill ${OUTCOMES[ev.outcome]?.pill || ""}">${OUTCOMES[ev.outcome]?.label || "?"}</span></div>
      <div class="muted">${fmtDate(ev.start)}${ev.manual ? " · added by hand" : ""} · urge ${ev.urgeStart ?? "?"} → ${ev.urgeEnd ?? "?"}</div>
      ${ev.feeling ? `<div style="margin-top:4px">${esc(ev.feeling)}</div>` : ""}
    </button>`).join("") : `<p class="muted">Nothing here yet. Hit the button when you need it, or add a past one by hand.</p>`}`;
  $("#addManual").onclick = () => go("detail", null);
  $("#shareLog").onclick = shareLog;
  app.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => go("detail", b.dataset.ev));
}
async function shareLog() {
  if (!events.length) return toast("Nothing to share yet");
  const text = events.map(summaryText).join("\n\n");
  if (navigator.share) { try { await navigator.share({ title: "My log", text }); } catch {} }
  else { try { await navigator.clipboard.writeText(text); toast("Copied the log"); } catch { toast("Couldn't copy"); } }
}

/* ===================== DETAIL / MANUAL ADD ===================== */
function detail(id) {
  const existing = id ? events.find(e => e.id === id) : null;
  const ev = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(), start: new Date().toISOString(), end: null, track: "dopamine", feeling: "", urgeStart: 6, urgeEnd: 2,
    done: [], resets: [], outcome: "safe", notes: "", manual: true,
  };
  const draw = () => {
    const tools = [...new Set([...allItems(ev.track), ...ev.done])];
    app.innerHTML = `
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
      ${existing && settings.riPhone ? `<a class="btn" href="${smsLink(settings.riPhone, summaryText(existing))}">Text ${esc(settings.riName || "Ri")} this one</a>` : ""}
      ${existing ? `<button class="btn bad" id="dDel">Delete</button>` : ""}
      <button class="btn" id="dBack">Back</button>
    </div>`;
    app.querySelectorAll("[data-track]").forEach(b => b.onclick = () => { grab(); ev.track = b.dataset.track; draw(); });
    $("#dU1").oninput = e => $("#dU1v").textContent = e.target.value;
    $("#dU2").oninput = e => $("#dU2v").textContent = e.target.value;
    $("#dSave").onclick = () => {
      grab();
      if (existing) Object.assign(existing, ev); else events.push(ev);
      events.sort((a, b) => b.start.localeCompare(a.start));
      saveEvents(); toast("Saved"); go("history");
    };
    if (existing) $("#dDel").onclick = () => {
      if (confirm("Delete this entry for good?")) { events = events.filter(e => e.id !== existing.id); saveEvents(); go("history"); }
    };
    $("#dBack").onclick = () => go("history");
  };
  const grab = () => {
    const w = $("#dWhen").value; if (w) ev.start = new Date(w).toISOString();
    ev.feeling = $("#dFeel").value; ev.urgeStart = +$("#dU1").value; ev.urgeEnd = +$("#dU2").value;
    ev.done = [...app.querySelectorAll("[data-tool]:checked")].map(c => c.dataset.tool);
    ev.resets = [...app.querySelectorAll("[data-reset]:checked")].map(c => c.dataset.reset);
    ev.outcome = $("#dOut").value; ev.notes = $("#dNotes").value;
  };
  draw();
}

/* ===================== INSIGHTS ===================== */
function insights() {
  if (!events.length) {
    app.innerHTML = `<h1>Insights</h1><p class="muted">This fills in once you've logged a few. Each entry adds data on which tools actually bring the urge down.</p>`;
    return;
  }
  const held = events.filter(e => e.outcome !== "slip").length;
  const drops = events.filter(e => e.urgeStart != null && e.urgeEnd != null).map(e => e.urgeStart - e.urgeEnd);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const last30 = events.filter(e => Date.now() - new Date(e.start) < 30 * 864e5).length;

  // per tool: how often used, average urge drop when used, how often you held
  const tools = {};
  events.forEach(e => [...e.done, ...e.resets].forEach(t => {
    const k = t.replace(/\s*\(.*\)\s*$/, "");
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
}

/* ===================== SETTINGS ===================== */
function settingsView() {
  const ladderText = t => ladderFor(t).map(items => items.join("\n")).join("\n---\n");
  app.innerHTML = `
  <h1>Settings</h1>
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

  <label class="lbl" for="sNap">Nap length (minutes)</label>
  <input type="text" inputmode="numeric" id="sNap" value="${settings.napMinutes}">

  <h2>Your lists</h2>
  <p class="muted">One item per line. Put a line with just <b>---</b> between tiers. End an item with something like <b>(5 min)</b> to give it a timer.</p>
  ${Object.entries(TRACKS).map(([k, t]) => `
    <label class="lbl" for="lad-${k}">${t.label}</label>
    <textarea id="lad-${k}" style="min-height:220px">${esc(ladderText(k))}</textarea>`).join("")}
  <button class="btn" id="resetLadders" style="margin-top:10px">Put the lists back to default</button>

  <div style="margin-top:20px"><button class="btn primary" id="sSave">Save settings</button></div>

  <h2>Backup</h2>
  <p class="muted">Your log only lives on this device. Export a backup now and then so you don't lose it.</p>
  <div class="row"><button class="btn" id="exp">Export backup</button><button class="btn" id="imp">Import backup</button></div>
  <input type="file" id="impFile" accept="application/json,.json" hidden>`;

  const pull = () => {
    settings.riName = $("#sRiName").value.trim() || "Ri";
    settings.riPhone = $("#sRiPhone").value.trim();
    settings.contacts = settings.contacts.map((c, i) => ({
      name: $(`[data-cname="${i}"]`).value.trim(), phone: $(`[data-cphone="${i}"]`).value.trim(),
    }));
    settings.napMinutes = Math.max(1, parseInt($("#sNap").value, 10) || 20);
    const ladders = {};
    Object.keys(TRACKS).forEach(k => {
      ladders[k] = $("#lad-" + k).value.split(/^\s*---\s*$/m)
        .map(block => block.split("\n").map(s => s.trim()).filter(Boolean)).filter(t => t.length);
      if (!ladders[k].length) ladders[k] = DEFAULT_LADDERS[k];
    });
    settings.ladders = ladders;
  };
  $("#addPerson").onclick = () => { pull(); settings.contacts.push({ name: "", phone: "" }); settingsView(); };
  app.querySelectorAll("[data-cdel]").forEach(b => b.onclick = () => { pull(); settings.contacts.splice(+b.dataset.cdel, 1); settingsView(); });
  $("#resetLadders").onclick = () => {
    Object.keys(TRACKS).forEach(k => $("#lad-" + k).value = DEFAULT_LADDERS[k].map(i => i.join("\n")).join("\n---\n"));
  };
  $("#sSave").onclick = () => {
    pull(); settings.contacts = settings.contacts.filter(c => c.name || c.phone);
    saveSettings(); toast("Saved"); settingsView();
  };
  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify({ settings, events, exported: new Date().toISOString() }, null, 2)], { type: "application/json" });
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
      const have = new Set(events.map(x => x.id));
      data.events.forEach(x => { if (!have.has(x.id)) events.push(x); });
      events.sort((a, b) => b.start.localeCompare(a.start));
      if (data.settings) settings = Object.assign({}, DEFAULT_SETTINGS, data.settings, { theme: settings.theme });
      saveEvents(); saveSettings(); toast("Backup loaded"); settingsView();
    } catch { toast("That file isn't a backup from this app"); }
  };
}

/* ===================== BOOT ===================== */
applyTheme();
go("home");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
