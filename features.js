/* ============================================================================
 * Jus Exam Study — FEATURES  (this is the one file for all future feature updates)
 *
 * Loaded after app.js. It never edits app.js; it plugs in through three hooks:
 *
 *   JusFeatures.onCard((card, q, index) => { ... })   runs for every question card after each render
 *   JusFeatures.onRender(() => { ... })               runs once after the whole list is rendered
 *   JusFeatures.onInit(() => { ... })                 runs once when the page has loaded
 *
 * To add a new feature: scroll to "ADD NEW FEATURES BELOW", write a block that uses the
 * hooks above (and JusFeatures.css`...` for its styles), and ship this single file.
 *
 * Features in this version
 *   1. Compact, Google-Forms-style cards with an edit pencil (everything editable hides behind it)
 *   2. Option editor: type the options, tick the correct one (this is the answer key)
 *   3. Required questions (blocks "Evaluate" until answered)
 *   4. Duplicate question, move up / down
 *   5. Clear selection (for choice questions)
 *   6. Progress bar + question navigator + "Edit all" toggle
 * ========================================================================== */
(function () {
  "use strict";

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
    .question-card.fx-editing{border-color:#b9c9ff;box-shadow:0 6px 22px rgba(49,87,213,.12)}
    .question-card.fx-editing::before{content:"";position:absolute;left:-1px;top:14px;bottom:14px;width:4px;border-radius:4px;background:var(--blue)}
    .fx-right{display:flex;align-items:center;gap:8px;margin-left:auto}
    .fx-points{font-size:11px;color:var(--muted);white-space:nowrap}
    .fx-req{font-size:11px;color:var(--red);font-weight:700;white-space:nowrap}
    .fx-pencil{width:34px;height:34px;border-radius:50%;border:0;background:transparent;color:#5a6785;display:grid;place-items:center;cursor:pointer;flex:none}
    .fx-pencil:hover{background:#edf1ff;color:var(--blue)}
    .fx-editing .fx-pencil{background:#edf1ff;color:var(--blue)}
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
    .fx-opt .fx-x{border:0;background:transparent;color:#8a94a8;font-size:18px;line-height:1;width:28px;height:28px;border-radius:50%;cursor:pointer;flex:none}
    .fx-opt .fx-x:hover{background:#fff0f1;color:var(--red)}
    .fx-opt.fx-correct .text-input{border-color:#9ad3b8;background:#f3fbf7}
    .fx-hint{font-size:11px;color:var(--muted);margin-top:6px}
    .fx-add{margin-top:8px}
    .fx-actions{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
    .fx-actions .tiny-btn{padding:7px 10px;border-radius:8px}
    .fx-actions .tiny-btn:hover{background:#edf1ff}
    .fx-actions .fx-danger{color:var(--red)}
    .fx-actions .fx-danger:hover{background:#fff0f1}
    .fx-actions .fx-spacer{flex:1}
    .fx-actions .fx-done{background:var(--blue);color:#fff}
    .fx-actions .fx-done:hover{background:#2748b8}
    .fx-clear{display:none;margin-top:6px}
    .fx-clear.show{display:inline-block}
    .fx-orig-hide{display:none!important}
    .fx-progress{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 17px;margin-bottom:12px}
    .fx-progress-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .fx-progress-top b{font-size:13px}
    .fx-bar{height:6px;border-radius:6px;background:#edf0f5;overflow:hidden;margin:10px 0 12px}
    .fx-bar i{display:block;height:100%;width:0;background:var(--green);transition:width .25s}
    .fx-chips{display:flex;flex-wrap:wrap;gap:6px}
    .fx-chip{min-width:30px;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--line);background:#fff;color:#4a5876;font:700 12px 'DM Sans',sans-serif;cursor:pointer}
    .fx-chip:hover{border-color:var(--blue);color:var(--blue)}
    .fx-chip.done{background:#e8f6ef;border-color:#bfe3d1;color:var(--green)}
    .fx-chip.req:not(.done){border-color:#f0b9c0;color:var(--red)}
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
    badge.classList.toggle("fx-ok", ok);
    badge.textContent = ok ? "Answer detected" : "No answer detected";
    badge.style.background = ok ? "#e8f6ef" : "#fff1f2"; badge.style.color = ok ? "#16845b" : "#c23b4b";
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
      const h = document.createElement("div"); h.className = "fx-section"; h.textContent = q.section; card.before(h);
    }
  });

  /* ======= FEATURE 3: required questions block "Evaluate" ======= */
  document.addEventListener("click", e => {
    if (!e.target.closest("#submitBtn")) return;
    const missing = state.questions.filter(q => q.required && !isAnswered(q.id));
    if (!missing.length) return;
    e.stopImmediatePropagation(); e.preventDefault();
    alert(`Please answer the required question(s) first: ${missing.map(q => state.questions.indexOf(q) + 1).join(", ")}.`);
    scrollToCard(missing[0].id);
  }, true);

  /* ======= FEATURE 6: progress bar, navigator, edit all ======= */
  let strip = null;
  function ensureStrip() {
    if (strip) return strip;
    strip = document.createElement("div"); strip.id = "fxProgress"; strip.className = "fx-progress";
    strip.innerHTML = `<div class="fx-progress-top"><b id="fxCount"></b><button type="button" class="tiny-btn" id="fxEditAll">✎ Edit all questions</button></div><div class="fx-bar"><i id="fxFill"></i></div><div class="fx-chips" id="fxChips"></div>`;
    $f("questionList").before(strip);
    $f("fxEditAll").addEventListener("click", () => {
      const allOpen = state.questions.length && state.questions.every(q => open.has(q.id));
      state.questions.forEach(q => { const c = cardOf(q.id); if (c) setOpen(c, q.id, !allOpen); });
      updateProgress();
    });
    $f("fxChips").addEventListener("click", e => { const b = e.target.closest("[data-fx-id]"); if (b) scrollToCard(Number(b.dataset.fxId)); });
    return strip;
  }
  function updateProgress() {
    const s = ensureStrip(), n = state.questions.length;
    s.style.display = n ? "" : "none";
    if (!n) return;
    const done = state.questions.filter(q => isAnswered(q.id)).length;
    $f("fxCount").textContent = `${done} of ${n} answered`;
    $f("fxFill").style.width = (n ? done / n * 100 : 0) + "%";
    $f("fxChips").innerHTML = state.questions.map((q, i) => `<button type="button" class="fx-chip${isAnswered(q.id) ? " done" : ""}${q.required ? " req" : ""}" data-fx-id="${q.id}" title="${q.required ? "Required" : "Go to question"}">${i + 1}</button>`).join("");
    const allOpen = state.questions.every(q => open.has(q.id));
    $f("fxEditAll").textContent = allOpen ? "✓ Close all editors" : "✎ Edit all questions";
  }
  JusFeatures.onRender(updateProgress);
  document.addEventListener("input", e => { if (e.target.closest("#questionList")) setTimeout(updateProgress, 0); });
  document.addEventListener("change", e => { if (e.target.closest("#questionList")) setTimeout(updateProgress, 0); });

  /* ============================================================================
   * ADD NEW FEATURES BELOW THIS LINE
   * Example:
   *   JusFeatures.onCard((card, q, index) => { ... });
   *   JusFeatures.css`.my-class{color:red}`;
   * ========================================================================== */

  /* ---------------------------------------------------------------- start */
  initHooks.forEach(h => { try { h(); } catch (e) { console.error(e); } });
  if (state.questions.length) renderQuestions();          // decorate cards restored from the saved draft
})();
