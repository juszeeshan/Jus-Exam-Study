/* ============================================================================
 * Jus Exam Study — FEATURES  (the ONE file for every future feature update)
 *
 * You never need to edit app.js, pdf-engine.js or index.html again:
 * pdf-engine.js loads this file by itself, and this file plugs into the app
 * through three hooks:
 *
 *   JusFeatures.onCard((card, q, index) => { ... })   runs for every question card after each render
 *   JusFeatures.onRender(() => { ... })               runs once after the whole list is rendered
 *   JusFeatures.onInit(() => { ... })                 runs once when the page is ready
 *   JusFeatures.css`...`                              adds CSS
 *
 * To add a feature: scroll to "ADD NEW FEATURES BELOW", write it with the hooks above.
 *
 * Features in this version
 *   1. Compact, Google-Forms-style cards; the ✏ opens the editor (tick the correct answer)
 *   2. Required questions · duplicate · move up/down · clear selection
 *   3. Progress bar + question navigator + section filter + "evaluate this section"
 *   4. "Next question without an answer key" jump
 *   5. Themes: Light · Dark · Paper (sepia) · Paper white · Auto, plus text size
 *   6. Accounts: sign in / create account / Google sign-in, per-account history and drafts,
 *      export / import, optional sign-in lock
 * ========================================================================== */
(function () {
  "use strict";
  if (window.JusFeatures) return;                       // never load twice

  /* ---------------------------------------------------------------- core */
  const cardHooks = [], renderHooks = [], initHooks = [];
  const JusFeatures = {
    onCard: fn => cardHooks.push(fn),
    onRender: fn => renderHooks.push(fn),
    onInit: fn => initHooks.push(fn),
    css(strings, ...vals) {
      const text = strings.reduce((a, s, i) => a + s + (vals[i] ?? ""), "");
      let el = document.getElementById("jus-features-css");
      if (!el) { el = document.createElement("style"); el.id = "jus-features-css"; document.head.appendChild(el); }
      el.textContent += "\n" + text;
    }
  };
  window.JusFeatures = JusFeatures;
  const ready = fn => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn();

  /* ============ PHASE 1 — runs immediately (before the app starts): storage, themes ============ */
  const lateLoad = typeof window.renderQuestions === "function";   // true if app.js already ran
  const LS = window.localStorage;
  const P = Storage.prototype, _get = P.getItem, _set = P.setItem, _del = P.removeItem;
  const raw = {                                          // un-namespaced access for our own settings
    get: k => { try { return _get.call(LS, k); } catch (e) { return null; } },
    set: (k, v) => { try { _set.call(LS, k, v); } catch (e) {} },
    del: k => { try { _del.call(LS, k); } catch (e) {} }
  };
  const readJSON = (k, fb) => { try { const v = JSON.parse(raw.get(k) || "null"); return v == null ? fb : v; } catch (e) { return fb; } };

  /* ---- accounts: every account gets its own history / draft / backend URL ---- */
  const NS_KEYS = new Set(["jusExamStudyHistoryV1", "jusExamStudyDraftV1", "jusExamStudyEndpoint"]);
  const ACC_KEY = "jusAccounts", SES_KEY = "jusSession", LOCK_KEY = "jusLock", GCID_KEY = "jusGoogleClientId";
  const getAccounts = () => readJSON(ACC_KEY, { users: [] });
  const putAccounts = a => raw.set(ACC_KEY, JSON.stringify(a));
  function readSession() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(SES_KEY) || "null"); } catch (e) {}
    if (!s) s = readJSON(SES_KEY, null);
    return s && getAccounts().users.some(u => u.id === s.id) ? s : null;
  }
  let uid = (readSession() || {}).id || null;
  const nsKey = k => (uid && NS_KEYS.has(k)) ? `acct:${uid}:${k}` : k;
  try {
    P.getItem = function (k) { return _get.call(this, this === LS ? nsKey(k) : k); };
    P.setItem = function (k, v) { return _set.call(this, this === LS ? nsKey(k) : k, v); };
    P.removeItem = function (k) { return _del.call(this, this === LS ? nsKey(k) : k); };
  } catch (e) { console.warn("Account storage unavailable", e); }
  const currentUser = () => uid ? getAccounts().users.find(u => u.id === uid) || null : null;

  /* ---- themes ---- */
  const THEMES = [
    ["auto", "Auto", "#f5f7fb", "#172033", "#3157d5", "Follows your device"],
    ["light", "Light", "#f5f7fb", "#172033", "#3157d5", "The original look"],
    ["dark", "Dark", "#0e1320", "#e7ebf4", "#86a3ff", "Easy on the eyes at night"],
    ["paper", "Paper", "#f1e7d0", "#433422", "#8c5a2b", "Warm sepia, like a Kindle"],
    ["paperwhite", "Paper white", "#f4f4ef", "#1f1f1c", "#333333", "Soft e-ink grey"]
  ];
  const THEME_ICON = { auto: "◐", light: "☀", dark: "☾", paper: "📖", paperwhite: "📄" };
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const SCALES = [["0.92", "Small"], ["1", "Default"], ["1.12", "Large"], ["1.26", "Extra large"]];
  function themeChoice() { const t = raw.get("jusTheme") || "light"; return THEMES.some(x => x[0] === t) ? t : "light"; }
  function applyTheme(choice) {
    const eff = choice === "auto" ? (mq && mq.matches ? "dark" : "light") : choice, root = document.documentElement;
    root.setAttribute("data-theme", eff); root.classList.toggle("fx-themed", eff !== "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", { light: "#172554", dark: "#0e1320", paper: "#f1e7d0", paperwhite: "#f4f4ef" }[eff]);
    raw.set("jusTheme", choice);
    const b = document.getElementById("fxThemeBtn"); if (b) { b.textContent = THEME_ICON[choice]; b.title = "Theme: " + THEMES.find(t => t[0] === choice)[1] + " (click to change)"; }
    document.querySelectorAll(".fx-theme-card").forEach(c => c.classList.toggle("on", c.dataset.themeId === choice));
  }
  function applyScale(v) { document.documentElement.style.setProperty("--fx-scale", v); raw.set("jusScale", v); document.querySelectorAll(".fx-size").forEach(c => c.classList.toggle("on", c.dataset.scale === v)); }
  if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (themeChoice() === "auto") applyTheme("auto"); });

  JusFeatures.css`
    :root{--surface:#fff;--soft:#edf1ff;--soft2:#f2f4f8;--okbg:#e8f6ef;--okfg:#16845b;--badbg:#fff1f2;--badfg:#c23b4b;--btn:#3157d5;--btn-fg:#fff}
    html[data-theme=dark]{color-scheme:dark;--bg:#0e1320;--surface:#161d2e;--soft:#212c47;--soft2:#1b2338;--ink:#e7ebf4;--muted:#99a5bc;--line:#2a3550;--blue:#86a3ff;--navy:#2a3a6b;--green:#4cc38a;--red:#ff8090;--okbg:#12302a;--okfg:#5fd3a0;--badbg:#3a1b22;--badfg:#ff93a1;--btn:#4a68e0;--btn-fg:#fff}
    html[data-theme=paper]{--bg:#f1e7d0;--surface:#f9f1de;--soft:#eadfc4;--soft2:#f3e9d2;--ink:#433422;--muted:#85755a;--line:#dccfae;--blue:#8c5a2b;--navy:#5b4630;--green:#3f7d4e;--red:#a8453a;--okbg:#e3ebcf;--okfg:#3f6b2a;--badbg:#f1d9cf;--badfg:#99392c;--btn:#7a5230;--btn-fg:#fbf3e0;--read-font:Georgia,'Iowan Old Style','Palatino Linotype','Book Antiqua',serif}
    html[data-theme=paperwhite]{--bg:#f4f4ef;--surface:#fbfbf7;--soft:#e9e9e1;--soft2:#f0f0e9;--ink:#1f1f1c;--muted:#6b6b63;--line:#dcdcd2;--blue:#333;--navy:#2b2b28;--green:#2f6f4f;--red:#9c3b3b;--okbg:#e4eee6;--okfg:#2f6f4f;--badbg:#f2e1e1;--badfg:#8f3333;--btn:#2b2b28;--btn-fg:#fff;--read-font:Georgia,'Iowan Old Style','Palatino Linotype','Book Antiqua',serif}
    html.fx-themed body{background:var(--bg);color:var(--ink)}
    html.fx-themed .topbar,html.fx-themed .mode-switch,html.fx-themed select,html.fx-themed .text-input,html.fx-themed .upload-card,html.fx-themed .toolbar,html.fx-themed .panel,html.fx-themed .question-card,html.fx-themed .empty-card,html.fx-themed .history-item,html.fx-themed .modal-card,html.fx-themed .option,html.fx-themed .answer-input,html.fx-themed .question-edit,html.fx-themed textarea,html.fx-themed input[type=text],html.fx-themed input[type=url],html.fx-themed input[type=number],html.fx-themed input[type=email],html.fx-themed input[type=password]{background:var(--surface);color:var(--ink);border-color:var(--line)}
    html.fx-themed .topbar{border-color:var(--line)}
    html.fx-themed .upload-card:hover{background:var(--soft2);border-color:var(--blue)}
    html.fx-themed .upload-card{border-color:var(--line)}
    html.fx-themed .nav-btn.active,html.fx-themed .q-number,html.fx-themed .pill,html.fx-themed .upload-icon,html.fx-themed .secondary{background:var(--soft);color:var(--blue)}
    html.fx-themed .secondary{color:var(--ink)}
    html.fx-themed .q-type{background:var(--soft2);color:var(--muted)}
    html.fx-themed .primary{background:var(--btn);color:var(--btn-fg)}
    html.fx-themed .danger{background:var(--badbg);color:var(--badfg)}
    html.fx-themed .notice{background:var(--soft)!important;border-color:var(--line);color:var(--muted)!important}
    html.fx-themed #notice[style*="255, 241, 242"]{background:var(--badbg)!important;color:var(--badfg)!important;border-color:var(--badfg)}
    html.fx-themed .modal{background:rgba(0,0,0,.62)}
    html.fx-themed footer,html.fx-themed .empty-state,html.fx-themed .empty-card p{color:var(--muted)}
    html.fx-themed .brand-mark{background:var(--navy);color:#fff}
    html.fx-themed [style*="background:#e8f6ef"]{background:var(--okbg)!important;color:var(--okfg)!important}
    html.fx-themed [style*="background:#fff1f2"]{background:var(--badbg)!important;color:var(--badfg)!important}
    html.fx-themed [style*="background:#f4f7fc"],html.fx-themed [style*="background:#edf0f5"]{background:var(--soft)!important}
    html.fx-themed [style*="color:#3157d5"]{color:var(--blue)!important}
    html.fx-themed .marks-edit{background:var(--surface);color:var(--ink)}
    html.fx-themed .modal-close{color:var(--ink)}
    html.fx-themed hr,html.fx-themed .result-row{border-color:var(--line)}
    html.fx-themed .result-row p{color:var(--muted)}
    html[data-theme=paper] .q-text,html[data-theme=paper] .option,html[data-theme=paper] .answer-input,html[data-theme=paper] .question-edit,html[data-theme=paper] .notice,html[data-theme=paper] .paper-preview,html[data-theme=paper] .muted,
    html[data-theme=paperwhite] .q-text,html[data-theme=paperwhite] .option,html[data-theme=paperwhite] .answer-input,html[data-theme=paperwhite] .question-edit,html[data-theme=paperwhite] .notice,html[data-theme=paperwhite] .paper-preview,html[data-theme=paperwhite] .muted{font-family:var(--read-font);line-height:1.7}
    html[data-theme=paper] .question-card,html[data-theme=paperwhite] .question-card{box-shadow:none}

    .fx-iconbtn{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:16px;cursor:pointer;display:grid;place-items:center;flex:none;padding:0}
    .fx-iconbtn:hover{border-color:var(--blue);color:var(--blue)}
    .fx-avatar{width:36px;height:36px;border-radius:50%;background:var(--soft);color:var(--blue);display:grid;place-items:center;font:800 14px Manrope,sans-serif;overflow:hidden;flex:none;border:0;cursor:pointer;padding:0}
    .fx-avatar img{width:100%;height:100%;object-fit:cover}
    .fx-avatar.big{width:52px;height:52px;font-size:20px;cursor:default}
    nav{align-items:center}
    .fx-set{margin-bottom:16px;max-width:700px}
    .fx-themes{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px;margin-top:14px}
    .fx-theme-card{border:2px solid var(--line);border-radius:12px;background:transparent;padding:8px;cursor:pointer;text-align:left;color:var(--ink);font:600 12px 'DM Sans',sans-serif}
    .fx-theme-card small{display:block;color:var(--muted);font-weight:400;font-size:10px;margin-top:2px}
    .fx-theme-card.on{border-color:var(--blue);box-shadow:0 0 0 3px rgba(120,146,237,.18)}
    .fx-swatch{display:flex;align-items:center;justify-content:space-between;height:44px;border-radius:8px;padding:0 10px;border:1px solid rgba(0,0,0,.12);margin-bottom:8px;font:700 16px Georgia,serif}
    .fx-swatch i{width:20px;height:6px;border-radius:4px}
    .fx-sizes,.fx-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .fx-size,.fx-tab{border:1px solid var(--line);background:var(--surface);color:var(--muted);padding:8px 13px;border-radius:9px;cursor:pointer;font:700 12px 'DM Sans',sans-serif}
    .fx-size.on,.fx-tab.on{background:var(--soft);color:var(--blue);border-color:var(--blue)}
    .fx-acc-card{display:flex;align-items:center;gap:14px;margin:14px 0}
    .fx-acc-card b{display:block;font-size:15px}
    .fx-acc-card small{display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.5}
    .fx-form{display:grid;gap:4px;margin-top:6px;max-width:420px}
    .fx-form .field-label{margin:10px 0 5px}
    .fx-form .text-input{margin-bottom:4px}
    .fx-form .fx-switch{margin:8px 0;font-size:12px;color:var(--muted);display:flex;gap:8px;align-items:center}
    .fx-btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .fx-msg{font-size:12px;margin:8px 0 0;min-height:16px}
    .fx-msg.bad{color:var(--badfg)}.fx-msg.ok{color:var(--okfg)}
    .fx-lock{position:fixed;inset:0;z-index:60;background:var(--bg);display:grid;place-items:center;padding:20px;overflow:auto}
    .fx-lock-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:26px;max-width:400px;width:100%;color:var(--ink)}
    .fx-lock-card h2{font:800 22px Manrope,sans-serif;margin:0 0 6px}
    .fx-small{font-size:11px;color:var(--muted);line-height:1.6;margin-top:12px}
  `;
  applyTheme(themeChoice());
  applyScale(raw.get("jusScale") || "1");

  /* ============ PHASE 2 — once the page and app.js are ready ============ */
  ready(boot);

  function boot() {
  const $f = id => document.getElementById(id);
  const letter = i => String.fromCharCode(65 + i);
  const isAnswered = id => { const a = state.answers[id]; return Array.isArray(a) ? a.length > 0 : String(a ?? "").trim() !== ""; };
  const nextId = () => Math.max(0, ...state.questions.map(q => Number(q.id) || 0)) + 1;
  const cardOf = id => document.querySelector(`#questionList .question-card[data-id="${id}"]`);
  let refreshTimer = null;
  const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { updateCounts(); renderPreview(); updateProgress(); }, 250); };

  // wrap the app's renderQuestions so every render is decorated
  const originalRender = renderQuestions;
  renderQuestions = function () {
    originalRender.apply(this, arguments);
    document.querySelectorAll("#questionList .question-card").forEach((card, i) => {
      const q = state.questions[i]; if (!q) return;
      cardHooks.forEach(h => { try { h(card, q, i); } catch (e) { console.error("Feature hook failed:", e); } });
    });
    renderHooks.forEach(h => { try { h(); } catch (e) { console.error("Feature hook failed:", e); } });
  };

  /* ------------------------------------------------------------- styles */
  JusFeatures.css`
    .question-card{position:relative;transition:box-shadow .15s,border-color .15s}
    .question-card.fx-editing{border-color:var(--blue);box-shadow:0 6px 22px rgba(49,87,213,.12)}
    .question-card.fx-editing::before{content:"";position:absolute;left:-1px;top:14px;bottom:14px;width:4px;border-radius:4px;background:var(--blue)}
    .fx-right{display:flex;align-items:center;gap:8px;margin-left:auto}
    .fx-points{font-size:11px;color:var(--muted);white-space:nowrap}
    .fx-req{font-size:11px;color:var(--red);font-weight:700;white-space:nowrap}
    .fx-pencil{width:34px;height:34px;border-radius:50%;border:0;background:transparent;color:var(--muted);display:grid;place-items:center;cursor:pointer;flex:none}
    .fx-pencil:hover{background:var(--soft);color:var(--blue)}
    .fx-editing .fx-pencil{background:var(--soft);color:var(--blue)}
    .fx-pencil svg{width:17px;height:17px}
    .question-card:not(.fx-editing) .fx-type,.question-card:not(.fx-editing) .fx-badge.fx-ok{display:none}
    .question-card.fx-editing .q-text{display:none}
    .fx-editor{display:none;margin-top:4px}
    .fx-editing .answer-area,.fx-editing .fx-clear,.fx-editing .reveal-reference,.fx-editing .reference-reveal{display:none!important}
    .fx-editing .fx-editor{display:block}
    .fx-editor .question-edit{font-size:14px;font-weight:600;min-height:72px}
    .fx-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:12px 0}
    .fx-row label{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:7px}
    .fx-row select{padding:8px 10px;font-size:12px}
    .fx-switch{cursor:pointer;user-select:none}
    .fx-switch input{accent-color:var(--blue);width:15px;height:15px}
    .fx-sub{font-size:11px;font-weight:700;color:var(--muted);margin:14px 0 8px;letter-spacing:.3px}
    .fx-opts{display:grid;gap:7px}
    .fx-opt{display:flex;align-items:center;gap:9px}
    .fx-opt .fx-key{width:22px;font-size:12px;font-weight:800;color:var(--blue);text-align:center;flex:none}
    .fx-opt input[type=radio],.fx-opt input[type=checkbox]{accent-color:var(--green);width:17px;height:17px;flex:none;cursor:pointer}
    .fx-opt .text-input{flex:1;min-width:0;padding:9px 10px;font-size:13px;border-radius:8px}
    .fx-opt .fx-x{border:0;background:transparent;color:var(--muted);font-size:18px;line-height:1;width:28px;height:28px;border-radius:50%;cursor:pointer;flex:none}
    .fx-opt .fx-x:hover{background:var(--badbg);color:var(--red)}
    .fx-opt.fx-correct .text-input{border-color:var(--okfg);background:var(--okbg)}
    .fx-hint{font-size:11px;color:var(--muted);margin-top:6px}
    .fx-add{margin-top:8px}
    .fx-actions{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
    .fx-actions .tiny-btn{padding:7px 10px;border-radius:8px}
    .fx-actions .tiny-btn:hover{background:var(--soft)}
    .fx-actions .fx-danger{color:var(--red)}
    .fx-actions .fx-danger:hover{background:var(--badbg)}
    .fx-actions .fx-spacer{flex:1}
    .fx-actions .fx-done{background:var(--btn);color:var(--btn-fg)}
    .fx-actions .fx-done:hover{filter:brightness(.92)}
    .fx-clear{display:none;margin-top:6px}
    .fx-clear.show{display:inline-block}
    .fx-orig-hide{display:none!important}
    .fx-progress{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 17px;margin-bottom:12px}
    .fx-progress-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .fx-progress-top b{font-size:13px}
    .fx-bar{height:6px;border-radius:6px;background:var(--soft);overflow:hidden;margin:10px 0 12px}
    .fx-bar i{display:block;height:100%;width:0;background:var(--green);transition:width .25s}
    .fx-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:112px;overflow:auto}
    .fx-chip{min-width:30px;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--muted);font:700 12px 'DM Sans',sans-serif;cursor:pointer}
    .fx-chip:hover{border-color:var(--blue);color:var(--blue)}
    .fx-chip.done{background:var(--okbg);border-color:var(--okfg);color:var(--okfg)}
    .fx-chip.req:not(.done){border-color:var(--badfg);color:var(--badfg)}
    .fx-badge.fx-ok{background:var(--okbg);color:var(--okfg)}
    .fx-badge.fx-bad{background:var(--badbg);color:var(--badfg)}
    .fx-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .fx-tools select{padding:7px 9px;font-size:12px;max-width:260px}
    .fx-miss{color:var(--badfg)!important}
    .q-text{font-size:calc(14px*var(--fx-scale,1))}.option{font-size:calc(13px*var(--fx-scale,1))}.answer-input{font-size:calc(13px*var(--fx-scale,1))}
    @media(max-width:700px){.fx-right .fx-points{display:none}}
  `;

  const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const open = new Set();                       // question ids whose editor is open
  const focusAfterRender = { id: null, idx: null };

  function setOpen(card, id, on) {
    card.classList.toggle("fx-editing", on);
    on ? open.add(id) : open.delete(id);
    updateProgress();
  }
  function refreshBadge(card, q) {
    const badge = card.querySelector(".fx-badge"); if (!badge) return;
    const ok = hasKey(q);
    badge.removeAttribute("style");
    badge.classList.toggle("fx-ok", ok); badge.classList.toggle("fx-bad", !ok);
    badge.textContent = ok ? "Answer detected" : "No answer detected";
  }
  function refreshAnswerArea(card, q) {          // live-update the student-facing options while editing
    card.querySelectorAll(".answer-area .option").forEach((el, i) => {
      const o = q.options[i]; if (!o) return;
      el.querySelector("span").innerHTML = `<b>${escapeHtml(o.key)}.</b> ${escapeHtml(o.text)}`;
    });
  }
  function scrollToCard(id) { cardOf(id)?.scrollIntoView({ behavior: "smooth", block: "center" }); }

  /* ======= FEATURE 1–5: compact card, pencil, option editor, required, duplicate, move, clear ======= */
  JusFeatures.onCard((card, q, index) => {
    const top = card.querySelector(".question-top");
    const typeEls = top.querySelectorAll(".q-type");
    typeEls[0]?.classList.add("fx-type");
    if (typeEls[1]) { typeEls[1].classList.add("fx-badge"); refreshBadge(card, q); }

    const qEdit = card.querySelector(".question-edit");
    const marksLabel = card.querySelector(".q-marks");
    const optEdit = card.querySelector(".options-edit");
    const refTa = card.querySelector(".reference-answer");
    const actions = card.querySelector(".question-actions");
    const answerArea = card.querySelector(".answer-area");
    const isMcq = q.type === "mcq" && q.options.length;
    const isTf = q.type === "tf";

    /* header: points, required, pencil */
    const right = document.createElement("div"); right.className = "fx-right";
    const points = document.createElement("span"); points.className = "fx-points";
    const req = document.createElement("span"); req.className = "fx-req";
    const syncHeader = () => { points.textContent = `${Number(q.marks) || 1} ${(Number(q.marks) || 1) === 1 ? "point" : "points"}`; req.textContent = q.required ? "* Required" : ""; };
    syncHeader();
    const pencil = document.createElement("button");
    pencil.className = "fx-pencil"; pencil.type = "button"; pencil.title = "Edit question"; pencil.setAttribute("aria-label", "Edit question"); pencil.innerHTML = PENCIL;
    right.append(req, points, pencil);
    marksLabel.classList.add("fx-orig-hide");           // marks input moves into the editor
    top.appendChild(right);

    /* clear selection (choice questions) */
    if (isMcq || isTf) {
      const clear = document.createElement("button"); clear.type = "button"; clear.className = "tiny-btn fx-clear"; clear.textContent = "Clear selection";
      const sync = () => clear.classList.toggle("show", isAnswered(q.id));
      clear.addEventListener("click", () => {
        delete state.answers[q.id];
        answerArea.querySelectorAll("input").forEach(i => { i.checked = false; });
        saveDraft(); sync(); updateProgress();
      });
      answerArea.addEventListener("change", () => setTimeout(sync, 0));
      answerArea.after(clear); sync();
    }

    /* ---------- editor ---------- */
    const editor = document.createElement("div"); editor.className = "fx-editor";
    editor.appendChild(qEdit);
    qEdit.addEventListener("input", () => { q.text = qEdit.value; card.querySelector(".q-text").textContent = q.text; saveDraft(); });

    // row: type · points · required
    const row = document.createElement("div"); row.className = "fx-row";
    const typeLabel = document.createElement("label"); typeLabel.textContent = "Type";
    const sel = document.createElement("select");
    [["mcq", "Multiple choice"], ["tf", "True / False"], ["fill", "Fill in the blank"], ["short", "Short answer"], ["long", "Descriptive answer"]]
      .forEach(([v, n]) => { const o = document.createElement("option"); o.value = v; o.textContent = n; if (v === q.type) o.selected = true; sel.appendChild(o); });
    typeLabel.appendChild(sel);
    sel.addEventListener("change", () => {
      q.type = sel.value;
      if (q.type === "mcq" && (!q.options || q.options.length < 2)) q.options = [{ key: "A", text: "Option 1" }, { key: "B", text: "Option 2" }];
      if (q.type === "mcq") { q.correct = mcqCorrect(q); }
      open.add(q.id); renderQuestions(); updateCounts(); saveDraft();
    });
    marksLabel.classList.remove("fx-orig-hide"); marksLabel.classList.add("fx-switch");
    const marksInput = marksLabel.querySelector(".marks-edit");
    marksInput.addEventListener("input", () => { q.marks = Math.max(0, Number(marksInput.value) || 0); syncHeader(); });
    marksLabel.firstChild.textContent = "Points ";
    const reqLabel = document.createElement("label"); reqLabel.className = "fx-switch";
    const reqBox = document.createElement("input"); reqBox.type = "checkbox"; reqBox.checked = !!q.required;
    reqBox.addEventListener("change", () => { q.required = reqBox.checked; syncHeader(); saveDraft(); updateProgress(); });
    reqLabel.append(reqBox, document.createTextNode(" Required"));
    row.append(typeLabel, marksLabel, reqLabel);
    editor.appendChild(row);

    // answer key editor
    if (isMcq) {
      const correctNow = mcqCorrect(q), multi = correctNow.length > 1;
      const rows = q.options.map(o => ({ text: o.text, correct: correctNow.includes(o.key) }));
      const sub = document.createElement("div"); sub.className = "fx-sub"; sub.textContent = "OPTIONS  ·  TICK THE CORRECT ANSWER";
      const list = document.createElement("div"); list.className = "fx-opts";
      const apply = () => {
        q.options = rows.map((r, i) => ({ key: letter(i), text: r.text }));
        q.correct = rows.map((r, i) => r.correct ? letter(i) : null).filter(Boolean);
        q.referenceAnswer = q.correct.map(k => `${k}. ${q.options[k.charCodeAt(0) - 65].text}`).join("  |  ");
        refreshAnswerArea(card, q); refreshBadge(card, q); saveDraft(); refreshSoon();
        card.querySelectorAll(".fx-opt").forEach((el, i) => el.classList.toggle("fx-correct", !!(rows[i] && rows[i].correct)));
      };
      rows.forEach((r, i) => {
        const el = document.createElement("div"); el.className = "fx-opt" + (r.correct ? " fx-correct" : "");
        const mark = document.createElement("input"); mark.type = multi ? "checkbox" : "radio"; mark.name = "fxk_" + q.id; mark.checked = r.correct; mark.title = "Correct answer";
        mark.addEventListener("change", () => { if (!multi) rows.forEach(x => x.correct = false); rows[i].correct = mark.checked; apply(); });
        const key = document.createElement("span"); key.className = "fx-key"; key.textContent = letter(i);
        const txt = document.createElement("input"); txt.type = "text"; txt.className = "text-input"; txt.value = r.text; txt.placeholder = "Option " + (i + 1);
        txt.addEventListener("input", () => { rows[i].text = txt.value; apply(); });
        const x = document.createElement("button"); x.type = "button"; x.className = "fx-x"; x.title = "Remove option"; x.textContent = "×"; x.disabled = rows.length <= 2;
        x.addEventListener("click", () => { rows.splice(i, 1); apply(); open.add(q.id); renderQuestions(); });
        el.append(mark, key, txt, x); list.appendChild(el);
      });
      const add = document.createElement("button"); add.type = "button"; add.className = "tiny-btn fx-add"; add.textContent = "+ Add option";
      add.disabled = rows.length >= 8;
      add.addEventListener("click", () => { rows.push({ text: "", correct: false }); apply(); open.add(q.id); focusAfterRender.id = q.id; focusAfterRender.idx = rows.length - 1; renderQuestions(); });
      const hint = document.createElement("div"); hint.className = "fx-hint";
      hint.textContent = correctNow.length ? "The ticked option is used as the answer key." : "No correct option detected — tick one to set the answer key.";
      editor.append(sub, list, add, hint);
      optEdit.previousElementSibling?.classList.add("fx-orig-hide"); optEdit.classList.add("fx-orig-hide");   // replaced by the editor above
      refTa.previousElementSibling.classList.add("fx-orig-hide"); refTa.classList.add("fx-orig-hide");
      editor.append(optEdit.previousElementSibling, optEdit, refTa.previousElementSibling, refTa);
    } else if (isTf) {
      const sub = document.createElement("div"); sub.className = "fx-sub"; sub.textContent = "CORRECT ANSWER";
      const r = document.createElement("div"); r.className = "fx-row";
      ["True", "False"].forEach(v => {
        const l = document.createElement("label"); l.className = "fx-switch";
        const i = document.createElement("input"); i.type = "radio"; i.name = "fxtf_" + q.id; i.checked = String(q.referenceAnswer || "").trim().toLowerCase() === v.toLowerCase();
        i.addEventListener("change", () => { q.referenceAnswer = v; refTa.value = v; refreshBadge(card, q); saveDraft(); refreshSoon(); });
        l.append(i, document.createTextNode(" " + v)); r.appendChild(l);
      });
      editor.append(sub, r);
      refTa.previousElementSibling.classList.add("fx-orig-hide"); refTa.classList.add("fx-orig-hide");
      editor.append(refTa.previousElementSibling, refTa);
    } else {
      const refLabel = refTa.previousElementSibling;
      refTa.addEventListener("input", () => { refreshBadge(card, q); refreshSoon(); });
      editor.append(refLabel, refTa);
    }

    // actions
    const act = document.createElement("div"); act.className = "fx-actions";
    const btn = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "tiny-btn " + (cls || ""); b.textContent = label; b.addEventListener("click", fn); return b; };
    const idx = state.questions.indexOf(q);
    const up = btn("↑ Move up", "", () => move(q, -1)); up.disabled = idx === 0;
    const down = btn("↓ Move down", "", () => move(q, +1)); down.disabled = idx === state.questions.length - 1;
    const del = btn("Delete", "fx-danger", () => card.querySelector(".delete-question").click());
    const spacer = document.createElement("span"); spacer.className = "fx-spacer";
    const done = btn("Done", "fx-done", () => { setOpen(card, q.id, false); card.querySelector(".q-text").textContent = q.text; refreshBadge(card, q); });
    act.append(btn("⧉ Duplicate", "", () => duplicate(q)), up, down, del, spacer, done);
    editor.appendChild(act);
    actions.classList.add("fx-orig-hide");
    top.after(editor);

    pencil.addEventListener("click", () => {
      const on = !card.classList.contains("fx-editing");
      setOpen(card, q.id, on);
      if (!on) { card.querySelector(".q-text").textContent = q.text; refreshBadge(card, q); }
      else qEdit.focus();
    });
    if (open.has(q.id)) card.classList.add("fx-editing");
    if (focusAfterRender.id === q.id) { card.querySelectorAll(".fx-opt .text-input")[focusAfterRender.idx]?.focus(); focusAfterRender.id = null; }
  });

  function duplicate(q) {
    const copy = JSON.parse(JSON.stringify(q)); copy.id = nextId();
    state.questions.splice(state.questions.indexOf(q) + 1, 0, copy);
    open.add(copy.id); renderQuestions(); updateCounts(); saveDraft(); scrollToCard(copy.id);
  }
  function move(q, dir) {
    const i = state.questions.indexOf(q), j = i + dir;
    if (j < 0 || j >= state.questions.length) return;
    [state.questions[i], state.questions[j]] = [state.questions[j], state.questions[i]];
    renderQuestions(); saveDraft(); scrollToCard(q.id);
  }

  /* ======= Section headings (subject · question type) between groups of questions ======= */
  JusFeatures.css`.fx-section{margin:26px 4px 10px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--blue)}`;
  JusFeatures.onCard((card, q, index) => {
    const prev = state.questions[index - 1];
    if (q.section && (!prev || prev.section !== q.section)) {
      const h = document.createElement("div"); h.className = "fx-section"; h.textContent = q.section; h.dataset.section = q.section; card.before(h);
    }
    if (q.section) card.dataset.section = q.section;
  });

  /* ======= Progress strip · section filter · missing answers · evaluate section · required ======= */
  let activeSection = "", strip = null, sectionSig = "", missCursor = -1, swapping = false;
  const inScope = q => !activeSection || q.section === activeSection;
  const scopeQs = () => state.questions.filter(inScope);
  function applyFilter() {
    document.querySelectorAll("#questionList > .question-card, #questionList > .fx-section").forEach(el => {
      el.style.display = (!activeSection || el.dataset.section === activeSection) ? "" : "none";
    });
  }
  function syncSubmitLabel() {
    const b = $f("submitBtn"); if (b && !/Evaluating/.test(b.textContent)) b.textContent = activeSection ? "Evaluate this section" : "Evaluate my paper";
  }
  function ensureStrip() {
    if (strip) return strip;
    strip = document.createElement("div"); strip.id = "fxProgress"; strip.className = "fx-progress";
    strip.innerHTML = `<div class="fx-progress-top"><b id="fxCount"></b><div class="fx-tools"><select id="fxSection" aria-label="Show section"></select><button type="button" class="tiny-btn fx-miss" id="fxMissing" style="display:none"></button><button type="button" class="tiny-btn" id="fxEditAll">✎ Edit all questions</button></div></div><div class="fx-bar"><i id="fxFill"></i></div><div class="fx-chips" id="fxChips"></div>`;
    $f("questionList").before(strip);
    $f("fxEditAll").addEventListener("click", () => {
      const sc = scopeQs(), allOpen = sc.length && sc.every(q => open.has(q.id));
      sc.forEach(q => { const c = cardOf(q.id); if (c) setOpen(c, q.id, !allOpen); });
      updateProgress();
    });
    $f("fxChips").addEventListener("click", e => { const b = e.target.closest("[data-fx-id]"); if (b) scrollToCard(Number(b.dataset.fxId)); });
    $f("fxSection").addEventListener("change", e => {
      activeSection = e.target.value; sectionSig = ""; updateProgress();
      const first = scopeQs()[0]; if (first) scrollToCard(first.id);
    });
    $f("fxMissing").addEventListener("click", () => {            // jump to the next question that has no answer key
      const miss = state.questions.map((q, i) => ({ q, i })).filter(x => !hasKey(x.q));
      if (!miss.length) return;
      const nxt = miss.find(x => x.i > missCursor) || miss[0]; missCursor = nxt.i;
      if (activeSection && nxt.q.section !== activeSection) { activeSection = ""; sectionSig = ""; }
      updateProgress();
      const c = cardOf(nxt.q.id); if (c) setOpen(c, nxt.q.id, true);
      scrollToCard(nxt.q.id);
    });
    return strip;
  }
  function updateProgress() {
    if (swapping) return;                                    // the list is temporarily a single section while evaluating
    const s = ensureStrip(), n = state.questions.length;
    s.style.display = n ? "" : "none";
    if (!n) { activeSection = ""; return; }
    const secs = []; state.questions.forEach(q => { if (q.section && !secs.includes(q.section)) secs.push(q.section); });
    if (activeSection && !secs.includes(activeSection)) activeSection = "";
    const sel = $f("fxSection"), sig = secs.join("|") + "#" + activeSection;
    sel.style.display = secs.length > 1 ? "" : "none";
    if (sig !== sectionSig) {
      sectionSig = sig;
      sel.innerHTML = `<option value="">All sections (${n})</option>` + secs.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)} (${state.questions.filter(q => q.section === x).length})</option>`).join("");
      sel.value = activeSection;
    }
    const sc = scopeQs(), done = sc.filter(q => isAnswered(q.id)).length, all = state.questions.filter(q => isAnswered(q.id)).length;
    $f("fxCount").textContent = activeSection ? `${done} of ${sc.length} answered here · ${all} of ${n} overall` : `${all} of ${n} answered`;
    $f("fxFill").style.width = (sc.length ? done / sc.length * 100 : 0) + "%";
    $f("fxChips").innerHTML = sc.map(q => `<button type="button" class="fx-chip${isAnswered(q.id) ? " done" : ""}${q.required ? " req" : ""}" data-fx-id="${q.id}" title="${q.required ? "Required" : "Go to question"}">${state.questions.indexOf(q) + 1}</button>`).join("");
    const miss = state.questions.filter(q => !hasKey(q)).length, mb = $f("fxMissing");
    mb.style.display = miss ? "" : "none"; mb.textContent = `⚠ ${miss} without answer key — fix next`;
    $f("fxEditAll").textContent = sc.length && sc.every(q => open.has(q.id)) ? "✓ Close all editors" : "✎ Edit all questions";
    applyFilter(); syncSubmitLabel();
  }
  JusFeatures.onRender(updateProgress);
  document.addEventListener("input", e => { if (e.target.closest("#questionList")) setTimeout(updateProgress, 0); });
  document.addEventListener("change", e => { if (e.target.closest("#questionList")) setTimeout(updateProgress, 0); });

  // Evaluate: honours "required" questions, and evaluates only the selected section when one is chosen
  document.addEventListener("click", e => {
    if (!e.target.closest("#submitBtn")) return;
    const scope = scopeQs(), missing = scope.filter(q => q.required && !isAnswered(q.id));
    if (missing.length) {
      e.stopImmediatePropagation(); e.preventDefault();
      alert(`Please answer the required question(s) first: ${missing.map(q => state.questions.indexOf(q) + 1).join(", ")}.`);
      scrollToCard(missing[0].id); return;
    }
    if (activeSection) {                                     // app.js evaluates synchronously, so swap the list for this click only
      const all = state.questions, name = state.questionName;
      swapping = true; state.questions = scope; state.questionName = `${name} — ${activeSection}`;
      setTimeout(() => { state.questions = all; state.questionName = name; swapping = false; updateProgress(); }, 0);
    }
  }, true);

  /* ======= THEMES + ACCOUNTS (settings, header buttons, sign-in lock) ======= */
  const el = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
  const EMPTY_LIST = '<div class="empty-card"><div class="empty-symbol">✍️</div><h3>Your answer spaces will appear here</h3><p>Upload and read your question paper to get started.</p></div>';
  const NOTICE0 = "Upload both PDFs and click Read PDFs. Jus Exam Study will create the question cards and pick up the correct answers from the blue underlined text in your answer paper. Please review the cards before answering.";

  /* ---- crypto helpers (passwords are salted + hashed with PBKDF2; never stored in plain text) ---- */
  const b64e = u8 => btoa(String.fromCharCode.apply(null, u8)), b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function hashPw(pw, saltB64) {
    if (!(window.crypto && crypto.subtle)) throw new Error("Secure sign-in needs https (or localhost).");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    return b64e(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64d(saltB64), iterations: 150000, hash: "SHA-256" }, key, 256)));
  }
  const normEmail = e => String(e || "").trim().toLowerCase();
  function startSession(id, keep) {
    uid = id; const v = JSON.stringify({ id });
    if (keep) { raw.set(SES_KEY, v); sessionStorage.removeItem(SES_KEY); } else { raw.del(SES_KEY); sessionStorage.setItem(SES_KEY, v); }
  }
  function endSession() { uid = null; raw.del(SES_KEY); sessionStorage.removeItem(SES_KEY); }
  async function signUp(name, email, password, keep, importGuest) {
    name = String(name || "").trim(); email = normEmail(email);
    if (!name) throw new Error("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
    if (String(password).length < 6) throw new Error("Password must be at least 6 characters.");
    const a = getAccounts();
    if (a.users.some(u => u.email === email)) throw new Error("An account with this email already exists. Try signing in.");
    const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
    const user = { id: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, email, salt, hash: await hashPw(password, salt), created: Date.now(), provider: "local" };
    a.users.push(user); putAccounts(a);
    if (importGuest) NS_KEYS.forEach(k => { const v = raw.get(k); if (v != null) raw.set(`acct:${user.id}:${k}`, v); });
    startSession(user.id, keep);
  }
  async function signIn(email, password, keep) {
    const u = getAccounts().users.find(x => x.email === normEmail(email) && x.provider === "local");
    if (!u || (await hashPw(password, u.salt)) !== u.hash) throw new Error("Incorrect email or password.");
    startSession(u.id, keep);
  }
  function googleLogin(credential) {
    const p = credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p), c => c.charCodeAt(0))));
    const id = "g" + d.sub, a = getAccounts(); let u = a.users.find(x => x.id === id);
    if (!u) { u = { id, provider: "google", created: Date.now() }; a.users.push(u); }
    u.name = d.name || d.email; u.email = normEmail(d.email); u.picture = d.picture || ""; putAccounts(a);
    startSession(id, true);
  }
  function loadGsi() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.id) return res();
      const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = res; s.onerror = () => rej(new Error("Could not load Google sign-in (check your connection)."));
      document.head.appendChild(s);
    });
  }
  async function mountGoogle(box, onDone) {
    const cid = raw.get(GCID_KEY); if (!cid || !box) return;
    try {
      await loadGsi();
      google.accounts.id.initialize({ client_id: cid, callback: r => { try { googleLogin(r.credential); onDone(); } catch (e) { box.textContent = "Google sign-in failed: " + e.message; } } });
      google.accounts.id.renderButton(box, { theme: "outline", size: "large", text: "continue_with", width: 280 });
    } catch (e) { box.innerHTML = `<p class="fx-msg bad">${escapeHtml(e.message)}</p>`; }
  }

  /* ---- switch the whole app to the current account's data without reloading ---- */
  function rehydrate() {
    Object.assign(state, { questionText: "", keyText: "", questions: [], answers: {}, questionName: "", keyName: "", mode: "practice", keyReport: null });
    open.clear();
    try { questionFile = null; keyFile = null; } catch (e) {}
    ["questionPdf", "keyPdf"].forEach(id => { const i = $f(id); if (i) i.value = ""; });
    $f("paperTitle").textContent = "No paper loaded"; $f("questionCount").textContent = "Upload PDFs to begin";
    $f("questionFileName").textContent = "Choose your question paper (without answers)"; $f("keyFileName").textContent = "Choose the paper with blue underlined answers";
    const pv = $f("paperPreview"); pv.className = "paper-preview empty-state"; pv.textContent = "Your question paper text will appear here after you select a PDF and choose Read PDFs.";
    $f("questionList").innerHTML = EMPTY_LIST; $f("submitBtn").disabled = true; $f("modeSelect").value = "practice"; $f("savedStatus").textContent = "Autosave on";
    notify(NOTICE0);
    loadDraft();                                           // app.js — now reads this account's saved draft
    $f("apiEndpoint").value = localStorage.getItem("jusExamStudyEndpoint") || "";
    activeSection = ""; sectionSig = ""; updateProgress();
    if (!$f("historyView").classList.contains("hidden")) renderHistory();
  }

  /* ---- header: theme + account buttons ---- */
  const nav = document.querySelector(".topbar nav");
  const themeBtn = el('<button type="button" id="fxThemeBtn" class="fx-iconbtn"></button>');
  themeBtn.addEventListener("click", () => { const o = ["light", "dark", "paper", "paperwhite", "auto"]; applyTheme(o[(o.indexOf(themeChoice()) + 1) % o.length]); });
  const avatarBtn = el('<button type="button" id="fxAvatarBtn" class="fx-avatar"></button>');
  avatarBtn.addEventListener("click", () => { switchView("settings"); $f("fxAccount").scrollIntoView({ behavior: "smooth", block: "start" }); });
  nav.append(themeBtn, avatarBtn);
  function paintAvatar(box, u) {
    if (u && u.picture) box.innerHTML = `<img alt="" referrerpolicy="no-referrer" src="${escapeHtml(u.picture)}">`;
    else box.textContent = u ? ((u.name || u.email || "?").trim()[0] || "?").toUpperCase() : "G";
  }
  function updateAvatar() { const u = currentUser(); paintAvatar(avatarBtn, u); avatarBtn.title = u ? `Signed in as ${u.name}` : "Guest — click to sign in"; }

  /* ---- settings: appearance, account, sign-in options ---- */
  const sv = $f("settingsView");
  const settingsHead = el('<div class="page-heading"><div><p class="eyebrow">PREFERENCES</p><h1>Settings</h1><p class="muted">Appearance, your account and sign-in options. The optional Google Sheets backend is further down.</p></div></div>');
  const appearance = el(`<div class="panel settings-panel fx-set" id="fxAppearance"><h2>Appearance</h2><p class="muted">Pick a reading theme — it is remembered on this device. The quick button next to your avatar cycles through them.</p><div class="fx-themes">${THEMES.map(t => `<button type="button" class="fx-theme-card" data-theme-id="${t[0]}"><span class="fx-swatch" style="background:${t[2]};color:${t[3]}">Aa<i style="background:${t[4]}"></i></span>${t[1]}<small>${t[5]}</small></button>`).join("")}</div><label class="field-label">Text size</label><div class="fx-sizes">${SCALES.map(s => `<button type="button" class="fx-size" data-scale="${s[0]}">${s[1]}</button>`).join("")}</div></div>`);
  appearance.addEventListener("click", e => {
    const t = e.target.closest(".fx-theme-card"), z = e.target.closest(".fx-size");
    if (t) applyTheme(t.dataset.themeId); if (z) applyScale(z.dataset.scale);
  });
  const account = el('<div class="panel settings-panel fx-set" id="fxAccount"></div>');
  const loginSet = el('<div class="panel settings-panel fx-set" id="fxLoginSet"></div>');
  sv.prepend(settingsHead, appearance, account, loginSet);

  let authTab = "in";
  const setMsg = (id, text, cls) => { const m = $f(id); if (m) { m.textContent = text; m.className = "fx-msg " + (cls || ""); } };
  function afterAuth() {
    authTab = "in";
    renderAccount(); renderLogin(); updateAvatar(); rehydrate();
    const lk = $f("fxLockScreen"); if (lk) lk.remove();
  }
  function renderAccount() {
    const u = currentUser();
    if (!u) {
      const up = authTab === "up";
      account.innerHTML = `<h2>Account</h2>
        <div class="fx-acc-card"><div class="fx-avatar big">G</div><div><b>Guest</b><small>You are using Jus Exam Study without signing in. History and drafts are saved in this browser. Create an account to keep each person’s history and drafts separate.</small></div></div>
        <div class="fx-tabs"><button type="button" class="fx-tab ${up ? "" : "on"}" data-tab="in">Sign in</button><button type="button" class="fx-tab ${up ? "on" : ""}" data-tab="up">Create account</button></div>
        <form class="fx-form" id="fxAuth">
          ${up ? '<label class="field-label">Name</label><input class="text-input" id="fxAName" autocomplete="name" required>' : ""}
          <label class="field-label">Email</label><input class="text-input" id="fxAEmail" type="email" autocomplete="email" required>
          <label class="field-label">Password</label><input class="text-input" id="fxAPass" type="password" autocomplete="${up ? "new-password" : "current-password"}" ${up ? 'minlength="6"' : ""} required>
          <label class="fx-switch"><input type="checkbox" id="fxAKeep" checked> Keep me signed in on this device</label>
          ${up ? '<label class="fx-switch"><input type="checkbox" id="fxAImport" checked> Move my current guest history and drafts into this account</label>' : ""}
          <div class="fx-btnrow"><button class="btn primary" type="submit">${up ? "Create account" : "Sign in"}</button></div>
          <p class="fx-msg" id="fxAMsg"></p>
        </form>
        <div id="fxGoogle"></div>
        <p class="fx-small">Accounts are stored in this browser only: passwords are salted and hashed here and never sent anywhere, so they cannot be recovered if forgotten. Use “Export my data” once signed in to keep a backup.</p>`;
      account.querySelector(".fx-tabs").addEventListener("click", e => { const t = e.target.closest("[data-tab]"); if (t) { authTab = t.dataset.tab; renderAccount(); } });
      account.querySelector("#fxAuth").addEventListener("submit", async e => {
        e.preventDefault(); const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; setMsg("fxAMsg", "Please wait…");
        try {
          if (up) await signUp($f("fxAName").value, $f("fxAEmail").value, $f("fxAPass").value, $f("fxAKeep").checked, $f("fxAImport").checked);
          else await signIn($f("fxAEmail").value, $f("fxAPass").value, $f("fxAKeep").checked);
          afterAuth(); setMsg("fxAMsg", "Signed in.", "ok");
        } catch (err) { setMsg("fxAMsg", err.message, "bad"); btn.disabled = false; }
      });
      mountGoogle(account.querySelector("#fxGoogle"), afterAuth);
      return;
    }
    const local = u.provider === "local";
    account.innerHTML = `<h2>Account</h2>
      <div class="fx-acc-card"><div class="fx-avatar big" id="fxBigAvatar"></div><div><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email || "")} · ${local ? "Local account" : "Google account"}</small></div></div>
      <div class="fx-form"><label class="field-label" for="fxName">Display name</label><input class="text-input" id="fxName" value="${escapeHtml(u.name)}"></div>
      <div class="fx-btnrow"><button type="button" class="btn secondary" id="fxSaveName">Save name</button><button type="button" class="btn secondary" id="fxSignOut">Sign out</button></div>
      ${local ? `<hr><h3>Change password</h3><div class="fx-form"><label class="field-label">Current password</label><input class="text-input" id="fxPw0" type="password" autocomplete="current-password"><label class="field-label">New password</label><input class="text-input" id="fxPw1" type="password" autocomplete="new-password" minlength="6"></div><div class="fx-btnrow"><button type="button" class="btn secondary" id="fxPwSave">Update password</button></div>` : ""}
      <hr><h3>Your data</h3><p class="muted">History, saved drafts and backend URL belong to this account.</p>
      <div class="fx-btnrow"><button type="button" class="btn secondary" id="fxExport">Export my data</button><button type="button" class="btn secondary" id="fxImportBtn">Import data</button><button type="button" class="btn danger" id="fxDelete">Delete account</button></div>
      <input type="file" id="fxImportFile" accept="application/json" hidden>
      <p class="fx-msg" id="fxAMsg"></p>`;
    paintAvatar($f("fxBigAvatar"), u);
    $f("fxSaveName").onclick = () => {
      const n = $f("fxName").value.trim(); if (!n) return setMsg("fxAMsg", "Name cannot be empty.", "bad");
      const a = getAccounts(), me = a.users.find(x => x.id === uid); me.name = n; putAccounts(a); renderAccount(); updateAvatar(); setMsg("fxAMsg", "Name saved.", "ok");
    };
    $f("fxSignOut").onclick = () => { endSession(); afterAuth(); maybeLock(); };
    if (local) $f("fxPwSave").onclick = async () => {
      try {
        const a = getAccounts(), me = a.users.find(x => x.id === uid), p1 = $f("fxPw1").value;
        if ((await hashPw($f("fxPw0").value, me.salt)) !== me.hash) throw new Error("Current password is incorrect.");
        if (p1.length < 6) throw new Error("New password must be at least 6 characters.");
        me.salt = b64e(crypto.getRandomValues(new Uint8Array(16))); me.hash = await hashPw(p1, me.salt); putAccounts(a);
        $f("fxPw0").value = ""; $f("fxPw1").value = ""; setMsg("fxAMsg", "Password updated.", "ok");
      } catch (err) { setMsg("fxAMsg", err.message, "bad"); }
    };
    $f("fxExport").onclick = () => {
      const data = { app: "jus-exam-study", version: 1, exported: new Date().toISOString(), profile: { name: u.name, email: u.email },
        history: readJSON2("jusExamStudyHistoryV1", []), draft: readJSON2("jusExamStudyDraftV1", null), endpoint: localStorage.getItem("jusExamStudyEndpoint") || "" };
      downloadBlob(`jus-exam-study-${(u.email || "account").replace(/[^a-z0-9]+/gi, "-")}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    };
    $f("fxImportBtn").onclick = () => $f("fxImportFile").click();
    $f("fxImportFile").onchange = async e => {
      try {
        const d = JSON.parse(await e.target.files[0].text());
        if (d.app !== "jus-exam-study") throw new Error("This file is not a Jus Exam Study export.");
        const have = readJSON2("jusExamStudyHistoryV1", []), seen = new Set(have.map(h => h.date + "|" + h.paperName));
        const merged = have.concat((d.history || []).filter(h => !seen.has(h.date + "|" + h.paperName))).sort((x, y) => String(y.date).localeCompare(String(x.date)));
        localStorage.setItem("jusExamStudyHistoryV1", JSON.stringify(merged.slice(0, 200)));
        if (d.draft && !localStorage.getItem("jusExamStudyDraftV1")) localStorage.setItem("jusExamStudyDraftV1", JSON.stringify(d.draft));
        if (d.endpoint && !localStorage.getItem("jusExamStudyEndpoint")) localStorage.setItem("jusExamStudyEndpoint", d.endpoint);
        rehydrate(); setMsg("fxAMsg", `Imported ${(d.history || []).length} attempt(s).`, "ok");
      } catch (err) { setMsg("fxAMsg", err.message, "bad"); }
      e.target.value = "";
    };
    $f("fxDelete").onclick = () => {
      if (!confirm("Delete this account and ALL of its history and drafts from this browser? This cannot be undone.")) return;
      const id = uid, a = getAccounts(); a.users = a.users.filter(x => x.id !== id); putAccounts(a);
      NS_KEYS.forEach(k => raw.del(`acct:${id}:${k}`)); endSession();
      if (!a.users.length) raw.del(LOCK_KEY);
      afterAuth();
    };
  }
  const readJSON2 = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? fb : v; } catch (e) { return fb; } };

  function renderLogin() {
    const hasAcc = getAccounts().users.length > 0;
    loginSet.innerHTML = `<h2>Sign-in options</h2>
      <label class="fx-switch fx-form" style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="fxLockToggle" ${raw.get(LOCK_KEY) === "1" ? "checked" : ""} ${hasAcc ? "" : "disabled"}> Ask me to sign in whenever the app opens</label>
      <p class="fx-small">A convenience for shared devices. Because everything runs in your browser it is not strong security — anyone who can use this browser profile can still read its stored data.${hasAcc ? "" : " Create an account first to turn this on."}</p>
      <hr><h3>Continue with Google (optional)</h3>
      <label class="field-label" for="fxGcid">Google Client ID</label><input class="text-input" id="fxGcid" placeholder="1234567890-abc….apps.googleusercontent.com" value="${escapeHtml(raw.get(GCID_KEY) || "")}">
      <div class="fx-btnrow" style="margin-top:0"><button type="button" class="btn secondary" id="fxGcidSave">Save Client ID</button></div>
      <p class="fx-msg" id="fxLMsg"></p>
      <p class="fx-small">In Google Cloud Console create an OAuth client ID of type “Web application”, add your site address (for example https://juszeeshan.github.io) under Authorized JavaScript origins, and paste the Client ID here. A “Continue with Google” button then appears in the sign-in form. Google sign-in only identifies you for this device’s account list — no server is involved.</p>`;
    $f("fxLockToggle").onchange = e => {
      if (e.target.checked && !uid) { e.target.checked = false; return setMsg("fxLMsg", "Sign in first, then turn this on.", "bad"); }
      e.target.checked ? raw.set(LOCK_KEY, "1") : raw.del(LOCK_KEY);
    };
    $f("fxGcidSave").onclick = () => {
      const v = $f("fxGcid").value.trim(); v ? raw.set(GCID_KEY, v) : raw.del(GCID_KEY);
      setMsg("fxLMsg", v ? "Saved. Open the account section to see the Google button." : "Cleared.", "ok"); if (!uid) renderAccount();
    };
  }

  /* ---- optional sign-in lock screen ---- */
  function maybeLock() {
    if (raw.get(LOCK_KEY) !== "1" || uid || !getAccounts().users.length || $f("fxLockScreen")) return;
    const o = el(`<div class="fx-lock" id="fxLockScreen"><div class="fx-lock-card"><h2>Welcome back</h2><p class="muted">Sign in to open Jus Exam Study.</p>
      <form class="fx-form" id="fxLockForm"><label class="field-label">Email</label><input class="text-input" id="fxLEmail" type="email" autocomplete="email" required><label class="field-label">Password</label><input class="text-input" id="fxLPass" type="password" autocomplete="current-password" required><label class="fx-switch"><input type="checkbox" id="fxLKeep" checked> Keep me signed in on this device</label><div class="fx-btnrow"><button class="btn primary" type="submit">Sign in</button></div><p class="fx-msg" id="fxLockMsg"></p></form><div id="fxLockG"></div></div></div>`);
    document.body.appendChild(o);
    o.querySelector("#fxLockForm").addEventListener("submit", async e => {
      e.preventDefault(); const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      try { await signIn($f("fxLEmail").value, $f("fxLPass").value, $f("fxLKeep").checked); afterAuth(); }
      catch (err) { setMsg("fxLockMsg", err.message, "bad"); btn.disabled = false; }
    });
    mountGoogle(o.querySelector("#fxLockG"), afterAuth);
  }

  applyTheme(themeChoice()); applyScale(raw.get("jusScale") || "1");
  updateAvatar(); renderAccount(); renderLogin(); maybeLock();
  if (lateLoad && uid) rehydrate();            // this file was loaded after the app had already read guest data

  /* ============================================================================
   * ADD NEW FEATURES BELOW THIS LINE   (everything above this point is working code)
   * Example:
   *   JusFeatures.onCard((card, q, index) => { ... });
   *   JusFeatures.css`.my-class{color:red}`;
   * ========================================================================== */

  /* ---------------------------------------------------------------- start */
  initHooks.forEach(h => { try { h(); } catch (e) { console.error(e); } });
  if (state.questions.length) renderQuestions();          // decorate cards restored from the saved draft
  updateProgress();
  }   // end boot
})();
