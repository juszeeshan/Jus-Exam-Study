/* Jus Exam Study - browser-side workspace */
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = id => document.getElementById(id);
const state = { questionText:"", keyText:"", questions:[], answers:{}, questionName:"", keyName:"", mode:"practice", keyReport:null };
const HISTORY_KEY = "jusExamStudyHistoryV1";
const DRAFT_KEY = "jusExamStudyDraftV1";
let questionFile = null, keyFile = null, questionObjectUrl = null, keyObjectUrl = null;

function notify(message, bad=false){ $("notice").textContent=message; $("notice").style.background=bad?"#fff1f2":"#eef4ff"; $("notice").style.color=bad?"#9f2637":"#40547d"; }
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function switchView(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(view+"View").classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="history") renderHistory();
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$("modeSelect").addEventListener("change",e=>{state.mode=e.target.value; renderQuestions(); saveDraft();});

/* ---------- answer helpers ---------- */
function hasKey(q){return JusEngine.hasKey(q);}
function parseLetters(s){
  const m=/^\s*((?:\(?[A-Ea-e]\)?\s*(?:,|&|\/|and|;)?\s*)+)(?:[.)\-:]|\s|$)/.exec(String(s||""));
  if(!m)return [];
  return [...new Set(m[1].replace(/\band\b/gi," ").match(/[A-Ea-e]/g)||[])].map(x=>x.toUpperCase());
}
function mcqCorrect(q){return (q.correct&&q.correct.length)?q.correct:parseLetters(q.referenceAnswer);}
function expectedText(q){
  if(q.type==="mcq"){
    const c=mcqCorrect(q);
    if(!c.length)return "";
    return c.map(L=>{const o=(q.options||[]).find(x=>x.key===L);return o?`${L}. ${o.text}`:L;}).join("  |  ");
  }
  return String(q.referenceAnswer||"").trim();
}

/* ---------- reading the PDFs ---------- */
$("questionPdf").addEventListener("change",e=>{questionFile=e.target.files[0]||null;if(questionFile){state.questionName=questionFile.name;$("questionFileName").textContent=questionFile.name;}});
$("keyPdf").addEventListener("change",e=>{keyFile=e.target.files[0]||null;if(keyFile){state.keyName=keyFile.name;$("keyFileName").textContent=keyFile.name;}});
$("extractBtn").addEventListener("click",()=>runExtraction(false));
$("ocrBtn").addEventListener("click",()=>runExtraction(true));

async function runExtraction(forceOcr){
  if(!questionFile||!keyFile){notify("Please choose both the question paper PDF and the answer paper PDF first.",true);return;}
  const btn=forceOcr?$("ocrBtn"):$("extractBtn"), label=btn.textContent;
  $("extractBtn").disabled=true;$("ocrBtn").disabled=true;
  const progress=(who)=>msg=>{btn.textContent=who+": "+msg;};
  try{
    const qDoc=await JusEngine.readDocument(questionFile,{ocr:forceOcr,highlights:false,onProgress:progress("Question paper")});
    const kDoc=await JusEngine.readDocument(keyFile,{ocr:forceOcr,highlights:true,onProgress:progress("Answer paper")});
    btn.textContent="Matching answers…";
    state.questionText=JusEngine.docText(qDoc);
    state.keyText=JusEngine.docText(kDoc);
    let questions=JusEngine.parseQuestions(qDoc);
    const keyQuestions=JusEngine.parseQuestions(kDoc);
    if(!questions.length){
      questions=[{id:1,text:"No numbered questions were detected. Add or edit the question text below.",type:"long",marks:0,options:[]}];
      state.keyReport={total:0,detected:0,missing:[],method:"none"};
    }else{
      state.keyReport=JusEngine.applyKey(questions,keyQuestions,kDoc);
    }
    state.keyReport.hlWords=kDoc.hlWordCount;state.keyReport.words=kDoc.wordCount;
    state.questions=questions;
    state.answers={};restoreDraftAnswers();
    if(questionObjectUrl)URL.revokeObjectURL(questionObjectUrl);
    questionObjectUrl=URL.createObjectURL(questionFile);
    if(keyObjectUrl)URL.revokeObjectURL(keyObjectUrl);
    keyObjectUrl=URL.createObjectURL(keyFile);
    $("paperTitle").textContent=state.questionName;
    renderPreview();renderQuestions();updateCounts();
    $("submitBtn").disabled=false;
    const r=state.keyReport;
    if(!r.total||!r.detected){
      notify(r.total?"No blue underlined answers were found in the answer paper. Check that the two PDFs are in the correct slots, or type the correct answers into each question's reference box.":"Could not detect numbered questions. Add questions manually or try OCR.",true);
    }else if(r.missing.length){
      notify(`${r.detected} of ${r.total} answers were detected from the answer paper. Question(s) ${r.missing.join(", ")} have no detected answer — add them in the reference box before evaluating.`,true);
    }else{
      notify(`All ${r.total} questions were read and every answer was detected from the blue underlined text. Skim the cards once, then start answering.`);
    }
    if(qDoc.autoOcr||kDoc.autoOcr)notify($("notice").textContent+" (A scanned PDF was detected, so OCR was used — please proofread.)",!!(!r.detected));
    saveDraft();
  }catch(err){console.error(err);notify("Could not read one of the PDFs: "+(err&&err.message?err.message:err),true);}
  finally{$("extractBtn").disabled=false;$("ocrBtn").disabled=false;btn.textContent=label;}
}

function updateCounts(){
  const n=state.questions.length,d=state.questions.filter(hasKey).length;
  $("questionCount").textContent=`${n} question(s) • ${d} answer(s) detected • Review the question cards`;
}

function renderPreview(){
  const el=$("paperPreview");
  el.classList.remove("empty-state");
  const frame=src=>`<iframe title="PDF preview" src="${src}" style="width:100%;height:68vh;min-height:440px;border:0;border-radius:8px"></iframe>`;
  const pill=(q)=>{const ok=hasKey(q);return `<span style="display:inline-block;margin:3px 4px 3px 0;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:700;background:${ok?"#e8f6ef":"#fff1f2"};color:${ok?"#16845b":"#c23b4b"}">Q${escapeHtml(q.id)} → ${ok?escapeHtml(q.type==="mcq"?mcqCorrect(q).join(", "):expectedText(q).slice(0,28)):"?"}</span>`;};
  const r=state.keyReport;
  const keyHtml=state.questions.length?`<details open><summary style="cursor:pointer;color:#3157d5;font-size:12px;font-weight:700">Detected answer key${r?` (${r.detected}/${r.total})`:""}</summary><div style="margin-top:8px">${state.questions.map(pill).join("")}</div></details>`:"";
  const qSrc=questionObjectUrl?frame(questionObjectUrl):"";
  const kSrc=keyObjectUrl?`<details style="margin-top:12px"><summary style="cursor:pointer;color:#3157d5;font-size:12px;font-weight:700">View answer paper</summary>${frame(keyObjectUrl)}</details>`:"";
  el.innerHTML=`${keyHtml}${qSrc?`<div style="margin-top:12px">${qSrc}</div>`:""}${kSrc}<details style="margin-top:12px"><summary style="cursor:pointer;color:#3157d5;font-size:12px;font-weight:700">View extracted text</summary><pre style="white-space:pre-wrap;font:12px/1.6 sans-serif">${escapeHtml(state.questionText.slice(0,14000))}</pre></details>`;
}

function typeName(t){return ({mcq:"Multiple choice",fill:"Fill in the blank",tf:"True / False",short:"Short answer",long:"Descriptive answer"})[t]||"Answer";}
function renderQuestions(){
  const list=$("questionList");list.innerHTML="";
  state.questions.forEach((q,index)=>{
    const card=document.createElement("article");card.className="question-card";card.dataset.id=q.id;
    let input="";
    const isMcq=q.type==="mcq"&&q.options.length;
    if(isMcq){
      const multi=/select\s+all|more\s+than\s+one|multiple\s+answers/i.test(q.text)||mcqCorrect(q).length>1;
      input=q.options.map(o=>`<label class="option"><input type="${multi?"checkbox":"radio"}" name="q_${q.id}" value="${escapeHtml(o.key)}" ${getAnswerArray(q.id).includes(o.key)||state.answers[q.id]===o.key?"checked":""}><span><b>${escapeHtml(o.key)}.</b> ${escapeHtml(o.text)}</span></label>`).join("");
    }else if(q.type==="tf"){
      input=["True","False"].map(v=>`<label class="option"><input type="radio" name="q_${q.id}" value="${v}" ${state.answers[q.id]===v?"checked":""}><span>${v}</span></label>`).join("");
    }else{
      input=`<textarea class="answer-input" data-answer="${q.id}" rows="${q.type==="fill"?1:q.type==="short"?3:6}" placeholder="${q.type==="fill"?"Type the missing word or phrase…":"Write your answer here…"}">${escapeHtml(state.answers[q.id]||"")}</textarea>`;
    }
    const ok=hasKey(q);
    const badge=`<span class="q-type" style="background:${ok?"#e8f6ef":"#fff1f2"};color:${ok?"#16845b":"#c23b4b"}">${ok?"Answer detected":"No answer detected"}</span>`;
    const refLabel=q.type==="mcq"?"Correct option (auto-detected from the blue underlined answer — edit if wrong, e.g. B)":"Reference answer / marking points (auto-detected from the blue underlined text — optional to edit)";
    card.innerHTML=`<div class="question-top"><span class="q-number">QUESTION ${index+1}</span><span class="q-type">${typeName(q.type)}</span>${badge}<label class="q-marks">Marks <input class="marks-edit" type="number" min="0" step="0.5" value="${Number(q.marks)||0}" style="width:65px;padding:5px;border:1px solid #dce2ed;border-radius:6px"></label></div>
      <p class="q-text"></p><textarea class="question-edit" aria-label="Edit question text">${escapeHtml(q.text)}</textarea>
      ${q.type==="mcq"?`<label class="field-label">MCQ options (one per line, e.g. A. Option text)</label><textarea class="answer-input options-edit" rows="3" placeholder="A. First option&#10;B. Second option&#10;C. Third option&#10;D. Fourth option">${escapeHtml((q.options||[]).map(o=>o.key+". "+o.text).join("\n"))}</textarea>`:""}
      <div class="answer-area">${input}</div>
      <label class="field-label">${refLabel}</label><textarea class="answer-input reference-answer" rows="2" placeholder="${q.type==="mcq"?"e.g. B":"Add the expected answer or key marking points"}">${escapeHtml(q.type==="mcq"?expectedText(q):(q.referenceAnswer||""))}</textarea>
      <div class="question-actions"><button class="tiny-btn change-type">Change answer type</button><button class="tiny-btn delete-question">Delete question</button><span class="muted">Autosaved</span></div>
      ${state.mode==="practice"?`<button class="tiny-btn reveal-reference">Show reference answer</button><div class="reference-reveal hidden muted" style="padding:10px;background:#f4f7fc;border-radius:8px;margin-top:8px;white-space:pre-wrap">${escapeHtml(expectedText(q)||"No answer was detected for this question. Add one in the box above to use this feature.")}</div>`:""}`;
    card.querySelector(".q-text").textContent=q.text;
    card.querySelector(".question-edit").addEventListener("change",e=>{q.text=e.target.value;card.querySelector(".q-text").textContent=q.text;saveDraft();});
    card.querySelector(".options-edit")?.addEventListener("change",e=>{q.options=e.target.value.split(/\n/).map((line,i)=>{const m=line.match(/^\s*([A-Z])\s*[).:-]?\s*(.*)$/i);return {key:m?m[1].toUpperCase():String.fromCharCode(65+i),text:m?m[2].trim():line.trim()};}).filter(o=>o.text);renderQuestions();updateCounts();saveDraft();});
    card.querySelector(".change-type").addEventListener("click",()=>cycleType(q.id));
    card.querySelector(".marks-edit").addEventListener("change",e=>{q.marks=Math.max(0,Number(e.target.value)||0);saveDraft();});
    card.querySelector(".reference-answer").addEventListener("input",e=>{
      q.referenceAnswer=e.target.value;
      if(q.type==="mcq")q.correct=parseLetters(e.target.value);
      saveDraft();
    });
    card.querySelector(".reference-answer").addEventListener("change",()=>{updateCounts();renderPreview();});
    card.querySelector(".delete-question").addEventListener("click",()=>{if(confirm("Delete this question?")){state.questions=state.questions.filter(x=>x.id!==q.id);delete state.answers[q.id];renderQuestions();updateCounts();saveDraft();}});
    card.querySelector(".reveal-reference")?.addEventListener("click",e=>{const box=card.querySelector(".reference-reveal");box.classList.toggle("hidden");e.target.textContent=box.classList.contains("hidden")?"Show reference answer":"Hide reference answer";});
    card.querySelectorAll("[data-answer]").forEach(el=>el.addEventListener("input",()=>{state.answers[q.id]=el.value;saveDraft();}));
    card.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(el=>el.addEventListener("change",()=>{const all=[...card.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);if(el.type==="checkbox")state.answers[q.id]=all;else state.answers[q.id]=el.value;saveDraft();}));
    list.appendChild(card);
  });
}
function getAnswerArray(id){const a=state.answers[id];return Array.isArray(a)?a:[];}
function cycleType(id){const q=state.questions.find(x=>x.id===id);const types=["mcq","fill","tf","short","long"];q.type=types[(types.indexOf(q.type)+1)%types.length];if(q.type==="mcq"&&q.referenceAnswer&&!(q.correct&&q.correct.length))q.correct=parseLetters(q.referenceAnswer);renderQuestions();updateCounts();saveDraft();}
function saveDraft(){
  const draft={questionName:state.questionName,keyName:state.keyName,questionText:state.questionText,keyText:state.keyText,questions:state.questions,answers:state.answers,mode:state.mode,keyReport:state.keyReport};
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));$("savedStatus").textContent="Saved just now";}catch(e){$("savedStatus").textContent="Storage full";}
}
function restoreDraftAnswers(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}");if(d.questionName===state.questionName&&d.keyName===state.keyName)state.answers=d.answers||{};}catch(e){}}
function loadDraft(){
  try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");if(!d)return;Object.assign(state,d);$("modeSelect").value=state.mode||"practice";if(state.questionText){$("paperTitle").textContent=state.questionName||"Saved paper";state.questions=state.questions||[];renderPreview();renderQuestions();updateCounts();$("submitBtn").disabled=!state.questions.length;$("questionFileName").textContent=state.questionName||"Saved question paper";$("keyFileName").textContent=state.keyName||"Saved answer paper";}}catch(e){}
}

/* ---------- evaluation (done entirely in the browser) ---------- */
$("submitBtn").addEventListener("click",evaluatePaper);
async function evaluatePaper(){
  if(!state.questions.length)return;
  const unanswered=state.questions.filter(q=>!String(state.answers[q.id]??"").trim()&&!(Array.isArray(state.answers[q.id])&&state.answers[q.id].length));
  if(unanswered.length&&!confirm(`${unanswered.length} question(s) are unanswered. Submit anyway?`))return;
  $("submitBtn").disabled=true;$("submitBtn").textContent="Evaluating…";
  try{
    const result=localEvaluate();
    result.date=new Date().toISOString();result.paperName=state.questionName||"Practice paper";
    const history=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");history.unshift(result);localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,100)));
    showResult(result);
    logToSheet(result);   // optional, runs in the background
  }catch(err){console.error(err);alert("Evaluation failed: "+err.message);}
  finally{$("submitBtn").disabled=false;$("submitBtn").textContent="Evaluate my paper";}
}
async function logToSheet(result){
  const endpoint=localStorage.getItem("jusExamStudyEndpoint")||"";
  if(!endpoint)return;
  try{
    const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"log",result,mode:state.mode,paperName:state.questionName})});
    const data=await response.json();
    if(data.error)throw new Error(data.error);
    notify("Result evaluated and saved to your Google Sheet.");
  }catch(err){
    console.warn(err);
    notify("Result evaluated and saved in this browser, but it could not be logged to Google Sheets ("+err.message+"). If you updated the app, redeploy the latest Code.gs in Apps Script.",true);
  }
}
const norm=s=>String(s??"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const STOP=new Set("the and for with that this from are was were have has into which what when where how why then than also its their his her not but can may shall any all".split(" "));
function gradeQuestion(q,ans){
  const marks=Number(q.marks)||1;
  const a=Array.isArray(ans)?ans.join(", "):String(ans??"");
  const expected=expectedText(q);
  if(!a.trim())return {awarded:0,feedback:"No answer provided.",expected};
  if(q.type==="mcq"){
    const corr=mcqCorrect(q);
    if(!corr.length)return {awarded:0,feedback:"No correct option was detected for this question. Review manually.",expected};
    const given=(Array.isArray(ans)?ans:[a]).map(x=>String(x).toUpperCase()).sort().join(",");
    const ok=given===[...corr].sort().join(",");
    return {awarded:ok?marks:0,feedback:ok?"Correct.":`Incorrect. The correct option is ${corr.join(", ")}.`,expected};
  }
  if(!expected)return {awarded:0,feedback:"No reference answer was detected for this question. Review manually.",expected};
  const na=norm(a),nk=norm(expected);
  if(na===nk)return {awarded:marks,feedback:"Matches the reference answer.",expected};
  if(q.type==="tf"){const ok=na===nk||nk.split(" ").includes(na);return {awarded:ok?marks:0,feedback:ok?"Correct.":"Incorrect.",expected};}
  const kw=[...new Set(nk.split(" ").filter(w=>w.length>2&&!STOP.has(w)))];
  const hits=kw.filter(w=>na.includes(w)).length,ratio=kw.length?hits/kw.length:0;
  if(q.type==="fill"){
    const parts=String(expected).split(/\s*;\s*/).map(norm).filter(Boolean);
    const ok=parts.includes(na)||(kw.length&&ratio>=0.8);
    return {awarded:ok?marks:0,feedback:ok?"Correct.":"Does not match the reference answer.",expected};
  }
  return {awarded:Math.round(marks*Math.min(0.85,ratio*0.85)*100)/100,feedback:`Estimated partial credit from key-term coverage (${Math.round(ratio*100)}%). This is not semantic AI grading; review descriptive answers yourself.`,expected};
}
function localEvaluate(){
  const rows=state.questions.map(q=>{
    const ans=state.answers[q.id]??"";
    const g=gradeQuestion(q,ans);
    const a=Array.isArray(ans)?ans.join(", "):String(ans);
    return {id:q.id,question:q.text,answer:a,expected:g.expected||"Not detected",marks:Number(q.marks)||1,awarded:Math.round(g.awarded*100)/100,feedback:g.feedback};
  });
  const total=rows.reduce((s,r)=>s+r.marks,0),score=rows.reduce((s,r)=>s+r.awarded,0);
  return {rows,total,score:Math.round(score*100)/100,percentage:total?Math.round(score/total*1000)/10:0,method:"Answer-key marking (detected from your answer paper)"};
}
function showResult(r){
  const pct=Number(r.percentage??0);
  $("resultContent").innerHTML=`<p class="eyebrow">EVALUATION COMPLETE</p><h2 style="font-family:Manrope">Your result</h2><div class="result-score">${Number(r.score||0).toFixed(1)} / ${Number(r.total||0).toFixed(1)}</div><p class="muted">${pct}% • ${escapeHtml(r.method||"Evaluation")} • ${escapeHtml(r.paperName||"")}</p><div style="height:8px;background:#edf0f5;border-radius:9px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,pct))}%;background:#16845b"></div></div><div style="margin-top:20px">${(r.rows||[]).map(row=>{const full=Number(row.awarded||0)>=Number(row.marks||0)&&Number(row.marks||0)>0;return `<div class="result-row" style="border-left:4px solid ${full?"#16845b":Number(row.awarded||0)>0?"#d99a1e":"#c23b4b"};padding-left:12px"><strong>Q${escapeHtml(row.id)} · ${Number(row.awarded||0)} / ${Number(row.marks||0)} marks</strong><p>${escapeHtml(row.question||"")}</p><p><b>Your answer:</b> ${escapeHtml(row.answer||"—")}</p><p><b>Expected answer:</b> ${escapeHtml(row.expected||"Not available")}</p><p>${escapeHtml(row.feedback||"")}</p></div>`;}).join("")}</div>`;
  $("resultModal").classList.remove("hidden");
}
$("closeModal").addEventListener("click",()=>$("resultModal").classList.add("hidden"));
$("resultModal").addEventListener("click",e=>{if(e.target===$("resultModal"))$("resultModal").classList.add("hidden");});
function renderHistory(){
  const history=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
  const avg=history.length?history.reduce((s,h)=>s+Number(h.percentage||0),0)/history.length:0;
  const best=history.length?Math.max(...history.map(h=>Number(h.percentage||0))):0;
  const summary=history.length?`<div class="upload-grid"><div class="panel" style="padding:16px"><small class="muted">Attempts</small><h2>${history.length}</h2></div><div class="panel" style="padding:16px"><small class="muted">Average score</small><h2>${avg.toFixed(1)}%</h2></div><div class="panel" style="padding:16px"><small class="muted">Best score</small><h2>${best.toFixed(1)}%</h2></div></div>`:"";
  $("historyList").innerHTML=summary+(history.length?history.map((h,i)=>`<div class="history-item"><div><strong>${escapeHtml(h.paperName||"Practice paper")}</strong><small>${new Date(h.date).toLocaleString()} · ${escapeHtml(h.method||"Evaluation")}</small></div><div style="text-align:right"><div class="score">${Number(h.percentage||0)}%</div><small>${Number(h.score||0).toFixed(1)} / ${Number(h.total||0).toFixed(1)} marks</small><br><button class="tiny-btn" data-history="${i}">View result</button></div></div>`).join(""):'<div class="empty-card"><div class="empty-symbol">📚</div><h3>No attempts saved yet</h3><p>Your completed evaluations will appear here.</p></div>');
  $("historyList").querySelectorAll("[data-history]").forEach(b=>b.addEventListener("click",()=>showResult(history[Number(b.dataset.history)])));
}

$("saveSettings").addEventListener("click",()=>{const url=$("apiEndpoint").value.trim();if(url&&!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url)){ $("settingsStatus").textContent="Please paste the Apps Script Web app URL ending in /exec.";return;}localStorage.setItem("jusExamStudyEndpoint",url);$("settingsStatus").textContent=url?"Backend URL saved on this device.":"Backend URL cleared.";});
$("apiEndpoint").value=localStorage.getItem("jusExamStudyEndpoint")||"";
$("clearHistory").addEventListener("click",()=>{if(confirm("Delete all saved evaluation history from this browser?")){localStorage.removeItem(HISTORY_KEY);renderHistory();}});
loadDraft();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.warn));


// Extra study tools: manual authoring, exports and printable reports.
$("addQuestionBtn").addEventListener("click",()=>{
  const next=Math.max(0,...state.questions.map(q=>Number(q.id)||0))+1;
  state.questions.push({id:next,text:"New question – edit this text",type:"short",marks:2,options:[],referenceAnswer:""});
  renderQuestions();saveDraft();updateCounts();
  document.querySelector(`[data-id="${next}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
});

function csvCell(v){return '"'+String(v??"").replace(/"/g,'""')+'"';}
$("exportCsvBtn").addEventListener("click",()=>{
  const rows=[["Question No","Question","Type","Marks","Your Answer","Reference Answer"]];
  state.questions.forEach(q=>rows.push([q.id,q.text,q.type,q.marks,Array.isArray(state.answers[q.id])?state.answers[q.id].join("; "):state.answers[q.id]||"",expectedText(q)]));
  const csv=rows.map(r=>r.map(csvCell).join(",")).join("\r\n");downloadBlob("jus-exam-study-answers.csv",new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"}));
});
function downloadBlob(name,blob){const a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// Print the currently opened evaluation result or browser print dialog can save it as PDF.
const originalShowResult=showResult;
showResult=function(r){originalShowResult(r);const content=$("resultContent");if(!content.querySelector("#printReport")){const b=document.createElement("button");b.id="printReport";b.className="btn primary";b.textContent="Print / Save as PDF";b.addEventListener("click",()=>window.print());content.prepend(b);}};

$("exportHistoryBtn").addEventListener("click",()=>{
 const hs=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
 const rows=[["Paper","Date","Score","Total","Percentage","Evaluation method"] ,...hs.map(h=>[h.paperName,h.date,h.score,h.total,h.percentage,h.method])];
 const csv=rows.map(r=>r.map(csvCell).join(",")).join("\r\n");downloadBlob("jus-exam-study-history.csv",new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"}));
});
