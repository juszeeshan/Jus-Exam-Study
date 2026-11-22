/* Jus Exam Study — PDF engine
 * 1. Reads a PDF into positioned words/lines (text layer, or OCR for scanned PDFs).
 * 2. Detects which words are "highlighted" (blue text, blue underline or blue highlighter)
 *    by looking at the rendered page pixels under every word.
 * 3. Parses numbered questions + options, and matches the highlighted answers
 *    from the answer paper to the questions of the question paper.
 */
(function (global) {
  "use strict";

  /* ---------- pixel classification ---------- */
  // 0 = background (white), 1 = ink (any non-blue colour), 2 = blue
  function classifyPixel(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mn >= 236) return 0;
    const d = mx - mn;
    if (b === mx && d >= (mx < 110 ? 30 : 14) && d / mx >= 0.07) {
      const t = (r - g) / d;            // hue between ~190° and ~262°
      if (t >= -0.84 && t <= 0.37) return 2;
    }
    return 1;
  }

  function buildClassMap(imageData, W, H) {
    const px = imageData.data, map = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < map.length; i++, p += 4) map[i] = classifyPixel(px[p], px[p + 1], px[p + 2]);
    return map;
  }

  function markHighlights(words, cls, W, H) {
    for (const w of words) {
      const x0 = Math.max(0, Math.floor(w.x0) + 1), x1 = Math.min(W - 1, Math.ceil(w.x1) - 1);
      if (x1 <= x0) { w.hl = false; continue; }
      const y0 = Math.max(0, Math.floor(w.top)), y1 = Math.min(H - 1, Math.ceil(w.bot));
      let ink = 0, blue = 0;
      for (let y = y0; y <= y1; y++) {
        const row = y * W;
        for (let x = x0; x <= x1; x++) { const c = cls[row + x]; if (c) { ink++; if (c === 2) blue++; } }
      }
      let hl = blue >= 3 && ink > 0 && blue / ink >= 0.5;       // blue text or blue highlighter
      if (!hl) {                                                  // black text with a blue underline
        const ya = Math.max(0, Math.floor(w.base - 0.05 * w.h)), yb = Math.min(H - 1, Math.ceil(w.base + 0.38 * w.h));
        let cols = 0;
        for (let x = x0; x <= x1; x++) {
          for (let y = ya; y <= yb; y++) { if (cls[y * W + x] === 2) { cols++; break; } }
        }
        hl = cols / (x1 - x0 + 1) >= 0.75;
        if (hl) {                                                 // a thin line, not the edge of a bigger blue area
          const yc = Math.min(H - 1, yb + 2); let below = 0;
          for (let x = x0; x <= x1; x++) if (cls[yc * W + x] === 2) below++;
          if (below / (x1 - x0 + 1) >= 0.5) hl = false;
        }
      }
      w.hl = hl;
    }
  }

  /* ---------- words from the PDF text layer / OCR ---------- */
  async function textWords(page, viewport) {
    const tc = await page.getTextContent();
    const U = global.pdfjsLib.Util, out = [];
    for (const it of tc.items) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const m = U.transform(viewport.transform, it.transform);
      const fs = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
      if (!fs || Math.abs(m[1]) > 0.3 * Math.abs(m[0])) continue;      // skip rotated / watermark text
      const str = it.str, n = str.length, widthPx = (it.width || 0) * viewport.scale;
      const re = /\S+/g; let mm;
      while ((mm = re.exec(str))) {
        const a = mm.index, b = a + mm[0].length;
        out.push({ s: mm[0], x0: m[4] + widthPx * a / n, x1: m[4] + widthPx * b / n, base: m[5], h: fs,
                   top: m[5] - 0.8 * fs, bot: m[5] + 0.22 * fs, gl: a === 0, gr: b === n, hl: false });
      }
    }
    return out;
  }

  async function ocrWords(worker, canvas) {
    const res = worker ? await worker.recognize(canvas) : await global.Tesseract.recognize(canvas, "eng");
    return (res.data.words || []).filter(w => w.text && w.text.trim() && (w.confidence == null || w.confidence > 25)).map(w => {
      const h = Math.max(4, w.bbox.y1 - w.bbox.y0);
      return { s: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, top: w.bbox.y0, bot: w.bbox.y1, h, base: w.bbox.y1 - 0.18 * h, gl: false, gr: false, hl: false };
    });
  }

  /* ---------- words -> columns -> lines ---------- */
  function splitColumns(words, W) {
    if (words.length < 40) return [words];
    let best = null;
    for (let g = W * 0.38; g <= W * 0.62; g += W / 200) {
      let cross = 0, left = 0, right = 0;
      for (const w of words) { if (w.x0 < g && w.x1 > g) cross++; else if (w.x1 <= g) left++; else right++; }
      if (!best || cross < best.cross || (cross === best.cross && Math.abs(g - W / 2) < Math.abs(best.g - W / 2))) best = { g, cross, left, right };
    }
    const N = words.length;
    if (best && best.cross <= Math.max(2, 0.02 * N) && Math.min(best.left, best.right) >= 0.25 * N) {
      const L = [], R = [];
      for (const w of words) ((w.x0 + w.x1) / 2 < best.g ? L : R).push(w);
      return [L, R];
    }
    return [words];
  }

  function groupLines(words) {
    words.sort((a, b) => a.base - b.base || a.x0 - b.x0);
    const lines = [];
    for (const w of words) {
      let L = null;
      for (let i = lines.length - 1; i >= 0 && i >= lines.length - 3; i--) {
        if (Math.abs(lines[i].base - w.base) <= 0.5 * Math.min(lines[i].h, w.h)) { L = lines[i]; break; }
      }
      if (!L) { L = { words: [], base: w.base, h: w.h }; lines.push(L); }
      L.words.push(w);
    }
    for (const L of lines) {
      L.words.sort((a, b) => a.x0 - b.x0);
      const merged = [];
      for (const w of L.words) {
        const p = merged[merged.length - 1];
        if (p && p.gr && w.gl && w.x0 - p.x1 < 0.12 * p.h && w.x0 - p.x1 > -0.6 * p.h) {
          p.s += w.s; p.x1 = w.x1; p.hl = p.hl || w.hl; p.gr = w.gr;
        } else merged.push(w);
      }
      L.words = merged;
      L.x0 = merged[0].x0; L.x1 = merged[merged.length - 1].x1;
      L.text = merged.map(w => w.s).join(" ");
    }
    lines.sort((a, b) => a.base - b.base);
    return lines;
  }

  function dropRepeatedHeadersFooters(pages) {
    const pageNo = /^(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$|^-\s*\d{1,3}\s*-$/i;
    pages.forEach(p => { p.lines = p.lines.filter(l => !((l.base < p.H * 0.08 || l.base > p.H * 0.93) && pageNo.test(l.text.trim()))); });
    if (pages.length < 2) return;
    const counts = new Map();
    const key = l => l.text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
    const inZone = (l, p) => l.base < p.H * 0.08 || l.base > p.H * 0.93;
    pages.forEach(p => { const seen = new Set(); p.lines.forEach(l => { if (inZone(l, p)) { const k = key(l); if (!seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) || 0) + 1); } } }); });
    const limit = Math.max(2, Math.ceil(pages.length * 0.5));
    pages.forEach(p => { p.lines = p.lines.filter(l => !(inZone(l, p) && counts.get(key(l)) >= limit)); });
  }

  /* ---------- read a whole PDF ---------- */
  async function readDocument(file, opts) {
    opts = opts || {};
    const progress = opts.onProgress || function () {};
    const pdf = await global.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let useOcr = !!opts.ocr, autoOcr = false;
    if (!useOcr) {                                       // scanned PDF? (no text layer)
      let chars = 0;
      for (let n = 1; n <= Math.min(3, pdf.numPages); n++) {
        const tc = await (await pdf.getPage(n)).getTextContent();
        chars += tc.items.reduce((s, i) => s + (i.str || "").trim().length, 0);
      }
      if (chars < 30) { useOcr = true; autoOcr = true; }
    }
    if (useOcr && !global.Tesseract) throw new Error("This PDF has no text layer and the OCR library could not load. Check your internet connection and try again.");
    let worker = null;
    if (useOcr) { progress("Starting OCR…"); try { worker = await global.Tesseract.createWorker("eng"); } catch (e) { worker = null; } }
    const scale = useOcr ? 2.5 : 2, pages = [];
    let hlWords = 0, allWords = 0;
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        progress((useOcr ? "OCR page " : "Reading page ") + n + "/" + pdf.numPages + "…");
        const page = await pdf.getPage(n), viewport = page.getViewport({ scale });
        const W = Math.ceil(viewport.width), H = Math.ceil(viewport.height);
        let canvas = null, cls = null;
        if (useOcr || opts.highlights) {
          canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
          await page.render({ canvasContext: ctx, canvas, viewport, background: "#ffffff" }).promise;
          if (opts.highlights) cls = buildClassMap(ctx.getImageData(0, 0, W, H), W, H);
        }
        const words = useOcr ? await ocrWords(worker, canvas) : await textWords(page, viewport);
        if (cls) markHighlights(words, cls, W, H);
        allWords += words.length; hlWords += words.filter(w => w.hl).length;
        const lines = [];
        splitColumns(words, W).forEach((colWords, ci) => {
          const colLines = groupLines(colWords);
          const colMin = colLines.length ? Math.min.apply(null, colLines.map(l => l.x0)) : 0;
          colLines.forEach(l => { l.rel = l.x0 - colMin; l.col = ci; lines.push(l); });
        });
        pages.push({ lines, W, H });
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        page.cleanup();
      }
    } finally { if (worker) { try { await worker.terminate(); } catch (e) {} } }
    dropRepeatedHeadersFooters(pages);
    return { pages, ocr: useOcr, autoOcr, pageCount: pdf.numPages, wordCount: allWords, hlWordCount: hlWords };
  }

  function docText(doc) { return doc.pages.map(p => p.lines.map(l => l.text).join("\n")).join("\n\n"); }

  /* ---------- question parsing ---------- */
  // "Q.1 text", "Q1)", "Question 1:", "1." , "1)"
  const QSTART = /^\s*(?:Q(?:uestion)?\.?\s*(\d{1,3})\s*[.):\-]?|(\d{1,3})\s*[.):])(?=\s|$|[A-Za-z(“"'])/i;
  const NL_BEFORE = /^(\(?[ivx]{1,4}[).]|\(?[1-9][).]|[IVX]{1,4}[.:]|Statement|Assertion|Reason|\(R\)|\(A\)|List)$/;

  function bestChain(c) {
    let best = [];
    for (let s = 0; s < c.length; s++) {
      if (best.length > c.length - s) break;
      const chain = [c[s]]; let last = c[s].n;
      for (let j = s + 1; j < c.length; j++) { const n = c[j].n; if (n > last && n <= last + 3) { chain.push(c[j]); last = n; } }
      if (chain.length >= best.length) best = chain;               // ties: the later start wins (skips instruction lists)
    }
    return best;
  }

  function consumePrefix(words, len) {
    let used = 0; const out = [];
    for (const w of words) {
      if (used >= len) { out.push(w); continue; }
      const take = len - used, wl = w.s.length;
      if (take >= wl) { used += wl + 1; continue; }
      out.push(Object.assign({}, w, { s: w.s.slice(take) })); used = len;
    }
    return out;
  }

  function splitGluedMarkers(words) {
    const out = [];
    for (const w of words) {
      const m = /^\(([A-Ea-e])\)(\S+)$/.exec(w.s);
      if (m) { out.push(Object.assign({}, w, { s: "(" + m[1] + ")" })); out.push(Object.assign({}, w, { s: m[2], nl: false })); }
      else out.push(w);
    }
    return out;
  }

  function findOptionChain(words) {
    const letterMarks = [], numMarks = [];
    words.forEach((w, idx) => {
      let m = /^\(?([A-Ea-e])[).]$/.exec(w.s);
      if (m) letterMarks.push({ idx, ch: m[1], upper: m[1] === m[1].toUpperCase() });
      m = /^\(([1-5])\)$/.exec(w.s);
      if (m) numMarks.push({ idx, ch: m[1] });
    });
    function chainFrom(marks, seq) {
      // all increasing chains seq[0] < seq[1] < ...; prefer the longest, then the one whose markers start lines
      // (so a name like "B. R. Ambedkar" inside an option is not mistaken for option B), then the later one.
      let best = null;
      const score = ch => ch.reduce((n, m) => n + (words[m.idx].nl || m.idx === 0 ? 1 : 0), 0);
      const better = (x, y) => !y || x.length > y.length || (x.length === y.length && (score(x) > score(y) || (score(x) === score(y) && x[0].idx > y[0].idx)));
      let budget = 4000;
      function dfs(chain, from, want) {
        if (budget-- <= 0) return;
        if (chain.length >= 2 && better(chain, best)) best = chain.slice();
        if (want >= seq.length) return;
        for (let j = from; j < marks.length; j++) if (marks[j].ch === seq[want]) { chain.push(marks[j]); dfs(chain, j + 1, want + 1); chain.pop(); }
      }
      marks.forEach((m, k) => { if (m.ch === seq[0]) dfs([m], k + 1, 1); });
      return best;
    }
    const cands = [];
    const up = chainFrom(letterMarks.filter(m => m.upper), ["A", "B", "C", "D", "E"]);
    const lo = chainFrom(letterMarks.filter(m => !m.upper), ["a", "b", "c", "d", "e"]);
    if (up) cands.push(up.map(m => ({ idx: m.idx, key: m.ch.toUpperCase() })));
    if (lo) cands.push(lo.map(m => ({ idx: m.idx, key: m.ch.toUpperCase() })));
    if (!cands.length) {
      const nu = chainFrom(numMarks, ["1", "2", "3", "4", "5"]);
      if (nu && nu.length >= 3) cands.push(nu.map(m => ({ idx: m.idx, key: String.fromCharCode(64 + Number(m.ch)) })));
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b[0].idx - a[0].idx);                         // options come after the stem statements
    return cands[0];
  }

  function wordsToText(ws) {
    let out = "";
    ws.forEach((w, i) => { if (i) out += (w.nl && NL_BEFORE.test(w.s) ? "\n" : " "); out += w.s; });
    return out.trim();
  }

  const MARKS_RES = [/[\[(]\s*(\d+(?:\.\d+)?)\s*(?:marks?|mks?)\s*[\])]/i, /[\[(]\s*marks?\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*[\])]/i, /\b(\d+(?:\.\d+)?)\s*marks?\s*$/i];
  function pullMarks(text) {
    for (const re of MARKS_RES) { const m = re.exec(text); if (m) return { marks: Number(m[1]), text: (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).replace(/[ \t]+/g, " ").trim() }; }
    return { marks: null, text };
  }

  function classify(t, options) {
    if (options.length >= 2) return "mcq";
    if (/true\s+or\s+false|state\s+whether.*true|write\s+true\s+or\s+false/i.test(t)) return "tf";
    if (/_{2,}|\.{3,}|\bfill\s+in\s+the\s+blanks?\b/i.test(t)) return "fill";
    const m = t.match(/\((\d+)\s*marks?\)/i) || t.match(/\b(\d+)\s*marks?\b/i);
    const marks = m ? Number(m[1]) : 0;
    if (marks <= 2 && marks > 0) return "short";
    if (marks >= 3 || /\b(explain|discuss|describe|elaborate|evaluate)\b/i.test(t)) return "long";
    return "short";
  }

  function buildQuestion(id, rawWords) {
    const words = splitGluedMarkers(rawWords);
    const chain = findOptionChain(words);
    let stemWords = words, options = [];
    if (chain) {
      stemWords = words.slice(0, chain[0].idx);
      options = chain.map((c, k) => {
        const end = k + 1 < chain.length ? chain[k + 1].idx : words.length, ow = words.slice(c.idx + 1, end), marker = words[c.idx];
        const hlCount = ow.filter(w => w.hl).length;
        return { key: c.key, words: ow, hl: !!marker.hl || (ow.length > 0 && hlCount / ow.length >= 0.5) };
      });
    }
    let stem = wordsToText(stemWords), marks = null;
    let pm = pullMarks(stem); stem = pm.text; if (pm.marks != null) marks = pm.marks;
    const outOptions = options.map(o => {
      let t = wordsToText(o.words); const p = pullMarks(t); t = p.text; if (p.marks != null && marks == null) marks = p.marks;
      return { key: o.key, text: t, hl: o.hl };
    });
    const type = classify(stem, outOptions);
    if (marks == null) marks = 1;
    return { id, text: stem, type, marks, options: outOptions, _words: words };
  }

  function parseQuestions(doc) {
    const lines = []; doc.pages.forEach(p => p.lines.forEach(l => lines.push(l)));
    const cands = [];
    lines.forEach((l, i) => {
      if (l.rel > 24) return;
      const m = QSTART.exec(l.text); if (!m) return;
      const n = Number(m[1] || m[2]); if (n < 1) return;
      cands.push({ i, n, len: m[0].length });
    });
    const chain = bestChain(cands), out = [];
    chain.forEach((c, k) => {
      const end = k + 1 < chain.length ? chain[k + 1].i : lines.length, words = [];
      for (let li = c.i; li < end; li++) {
        let ws = lines[li].words;
        if (li === c.i) ws = consumePrefix(ws, c.len);
        ws.forEach((w, wi) => words.push(wi === 0 && li !== c.i ? Object.assign({}, w, { nl: true }) : w));
      }
      if (words.length) out.push(buildQuestion(c.n, words));
    });
    return out;
  }

  /* ---------- answers ---------- */
  function normWords(s) { return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1); }
  function similarity(a, b) {
    const A = new Set(normWords(a)), B = new Set(normWords(b));
    if (!A.size || !B.size) return 1;
    let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
    return inter / (A.size + B.size - inter);
  }
  function highlightedRuns(words) {
    const runs = []; let cur = [];
    words.forEach(w => { if (w.hl) cur.push(w.s); else if (cur.length) { runs.push(cur.join(" ")); cur = []; } });
    if (cur.length) runs.push(cur.join(" "));
    return runs;
  }
  function parseAnswerGrid(text) {
    const map = new Map(), re = /(?:^|[\s,;|])(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[-–:.)]*\s*\(?([A-Ea-e])\)?(?=$|[\s,;|.])/g;
    let m; while ((m = re.exec(text))) if (!map.has(Number(m[1]))) map.set(Number(m[1]), m[2].toUpperCase());
    return map;
  }
  function setMcqKey(q, letters) {
    q.correct = letters;
    q.referenceAnswer = letters.map(L => { const o = q.options.find(x => x.key === L); return o ? L + ". " + o.text : L; }).join("  |  ");
  }

  // Copies the answers found in the answer paper (keyQs) onto the questions of the question paper (qs).
  function applyKey(qs, keyQs, keyDoc) {
    const byId = new Map(); keyQs.forEach(k => { if (!byId.has(k.id)) byId.set(k.id, k); });
    let method = "highlights";
    qs.forEach(q => {
      let k = byId.get(q.id);
      if (k && q.text && k.text && similarity(q.text, k.text) < 0.2) {          // numbering differs between the two PDFs
        let alt = null, altSim = 0.6;
        keyQs.forEach(c => { const s = similarity(q.text, c.text); if (s > altSim) { alt = c; altSim = s; } });
        if (alt) k = alt;
      }
      if (!k) return;
      if (q.options.length < 2 && k.options.length >= 2) { q.options = k.options.map(o => ({ key: o.key, text: o.text })); q.type = "mcq"; if (!q.marks) q.marks = 1; }
      if (q.type === "mcq") {
        let flagged = k.options.filter(o => o.hl).map(o => o.key);
        if (flagged.length === k.options.length) flagged = [];
        if (!flagged.length) {                                                   // highlight on option text only partially / in the stem
          const runs = highlightedRuns(k._words).join(" ");
          if (runs) {
            let bestKey = null, bestScore = 0.6;
            q.options.forEach(o => { const s = similarity(runs, o.text); if (s > bestScore) { bestKey = o.key; bestScore = s; } });
            if (bestKey) flagged = [bestKey];
          }
        }
        flagged = flagged.filter(L => q.options.some(o => o.key === L));
        if (flagged.length) setMcqKey(q, flagged);
      } else {
        let ref = highlightedRuns(k._words).map(r => r.replace(/^\(?(?:ans(?:wer)?|a)\)?\s*[:.\-–]\s*/i, "")).filter(Boolean).join("; ");
        if (q.type === "tf" || /^(true|false)$/i.test(ref)) { const m = /\b(true|false)\b/i.exec(ref); if (m) { q.type = "tf"; ref = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); } }
        if (ref) q.referenceAnswer = ref;
      }
    });
    // Plain "1. B  2. D ..." answer tables (no highlights) — only when the key is clearly a table, not a copy of the paper
    const have = () => qs.filter(q => hasKey(q)).length;
    if (have() < qs.length * 0.2 && keyQs.length < qs.length * 0.5) {
      const grid = parseAnswerGrid(docText(keyDoc));
      if (grid.size >= Math.max(3, qs.length * 0.3)) {
        method = "table";
        qs.forEach(q => { if (q.type === "mcq" && !hasKey(q) && grid.has(q.id)) { const L = grid.get(q.id); if (q.options.some(o => o.key === L)) setMcqKey(q, [L]); } });
      }
    }
    qs.forEach(q => { delete q._words; });
    const missing = qs.filter(q => !hasKey(q)).map(q => q.id);
    return { total: qs.length, detected: qs.length - missing.length, missing, method };
  }

  function hasKey(q) { return q.type === "mcq" ? !!(q.correct && q.correct.length) : !!String(q.referenceAnswer || "").trim(); }

  global.JusEngine = { readDocument, docText, parseQuestions, applyKey, hasKey, similarity };
})(window);
