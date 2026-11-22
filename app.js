/* Jus Exam Study - browser-side workspace */
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = id => document.getElementById(id);
const state = { questionText:"", keyText:"", questions:[], answers:{}, questionName:"", keyName:"", mode:"practice" };
const HISTORY_KEY = "jusExamStudyHistoryV1";
const DRAFT_KEY = "jusExamStudyDraftV1";
let questionFile = null, keyFile = null, questionObjectUrl = null;

function notify(message, bad=false){ $("notice").textContent=message; $("notice").style.background=bad?"#fff1f2":"#eef4ff"; $("notice").style.color=bad?"#9f2637":"#40547d"; }
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function switchView(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(view+"View").classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="history") renderHistory();
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$("modeSelect").addEventListener("change",e=>{state.mode=e.target.value; saveDraft();});

async function readPdf(file){
  const bytes=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
  let pages=[];
  for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n), content=await page.getTextContent();
    pages.push(content.items.map(i=>i.str).join(" "));
  }
  return pages.join("\n\n");
}
$("questionPdf").addEventListener("change",e=>{questionFile=e.target.files[0]||null;if(questionFile){state.questionName=questionFile.name;$("questionFileName").textContent=questionFile.name;}});
$("keyPdf").addEventListener("change",e=>{keyFile=e.target.files[0]||null;if(keyFile){state.keyName=keyFile.name;$("keyFileName").textContent=keyFile.name;}});

$("extractBtn").addEventListener("click",async()=>{
  if(!questionFile||!keyFile){notify("Please choose both the question paper PDF and the answer key PDF first.",true);return;}
  $("extractBtn").disabled=true;$("extractBtn").textContent="Reading PDFs…";
  try{
    state.questionText=await readPdf(questionFile);
    state.keyText=await readPdf(keyFile);
    $("paperTitle").textContent=state.questionName;
    $("paperPreview").classList.remove("empty-state");
    if(questionObjectUrl) URL.revokeObjectURL(questionObjectUrl);
    questionObjectUrl=URL.createObjectURL(questionFile);
    $("paperPreview").innerHTML=`<iframe title="Question paper PDF" src="${questionObjectUrl}" style="width:100%;height:68vh;min-height:440px;border:0;border-radius:8px"></iframe><details style="margin-top:12px"><summary style="cursor:pointer;color:#3157d5;font-size:12px;font-weight:700">View extracted text</summary><pre style="white-space:pre-wrap;font:12px/1.6 sans-serif">${escapeHtml(state.questionText.slice(0,14000))}</pre></details>`;
    state.questions=parseQuestions(state.questionText);
    if(!state.questions.length){
      state.questions=[{id:1,text:"No numbered questions were detected. Add or edit the question text below.",type:"long",marks:0,options:[]}];
    }
    state.answers={};
    restoreDraftAnswers();
    renderQuestions();
    $("questionCount").textContent=`${state.questions.length} question(s) detected • Review the question cards`;
    $("submitBtn").disabled=false;
    notify("PDF text extracted. Check the detected question boundaries, question types and marks. You can edit question text and type before evaluation.");
    saveDraft();
  }catch(err){console.error(err);notify("Could not read one of the PDFs. If it is a scanned image, run OCR first or use searchable PDFs.",true);}
  finally{$("extractBtn").disabled=false;$("extractBtn").textContent="Read PDFs";}
});

function parseQuestions(text){
  const normalized=text.replace(/\r/g,"\n").replace(/[ \t]+/g," ");
  // Recognize common numbering styles: Q1, Q.1, 1., 1), Question 1
  const re=/(?:^|\n)\s*(?:(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,3})\s*[\).:]|Q(?:uestion)?\s*(\d{1,3})\s*[:.)-])\s*/gim;
  let matches=[...normalized.matchAll(re)];
  if(matches.length===0)return [];
  const out=[];
  for(let i=0;i<matches.length;i++){
    const m=matches[i], start=m.index+(m[0].startsWith("\n")?m[0].length-1:m[0].length);
    const end=i+1<matches.length?matches[i+1].index:normalized.length;
    let block=normalized.slice(start,end).trim();
    if(block.length<3)continue;
    const id=Number(m[1]||m[2]);
    const marksMatch=block.match(/\(?(\d+(?:\.\d+)?)\s*(?:marks?|mks?)\)?\s*\.?\s*$/i);
    const marks=marksMatch?Number(marksMatch[1]):inferMarks(block);
    if(marksMatch)block=block.slice(0,marksMatch.index).trim();
    const options=[...block.matchAll(/(?:^|\s)([A-D])[\).]\s*([^;]+?)(?=(?:\s+[A-D][\).]\s)|$)/gi)].map(x=>({key:x[1].toUpperCase(),text:x[2].trim()}));
    let type=classify(block,options);
    out.push({id,text:block,type,marks,options});
  }
  return out;
}
function inferMarks(t){if(/\b(4|five|5|six|6)\s*marks?\b/i.test(t))return 4;if(/\b(2|two)\s*marks?\b/i.test(t))return 2;return 0;}
function classify(t,options){
  if(options.length>=2)return "mcq";
  if(/true\s+or\s+false|state\s+whether.*true|write\s+true\s+or\s+false/i.test(t))return "tf";
  if(/_{2,}|\.{3,}|\bfill\s+in\s+the\s+blanks?\b/i.test(t))return "fill";
  const m=t.match(/\((\d+)\s*marks?\)/i)||t.match(/\b(\d+)\s*marks?\b/i);
  const marks=m?Number(m[1]):0;
  if(marks<=2&&marks>0)return "short";
  if(marks>=3||/\b(explain|discuss|describe|elaborate|evaluate)\b/i.test(t))return "long";
  return "short";
}
function typeName(t){return ({mcq:"Multiple choice",fill:"Fill in the blank",tf:"True / False",short:"Short answer",long:"Descriptive answer"})[t]||"Answer";}
function renderQuestions(){
  const list=$("questionList");list.innerHTML="";
  state.questions.forEach((q,index)=>{
    const card=document.createElement("article");card.className="question-card";card.dataset.id=q.id;
    let input="";
    if(q.type==="mcq"&&q.options.length){
      const multi=/select\s+all|more\s+than\s+one|multiple\s+answers/i.test(q.text);
      input=q.options.map(o=>`<label class="option"><input type="${multi?"checkbox":"radio"}" name="q_${q.id}" value="${escapeHtml(o.key)}" ${getAnswerArray(q.id).includes(o.key)?"checked":""}><span><b>${escapeHtml(o.key)}.</b> ${escapeHtml(o.text)}</span></label>`).join("");
    }else if(q.type==="tf"){
      input=["True","False"].map(v=>`<label class="option"><input type="radio" name="q_${q.id}" value="${v}" ${state.answers[q.id]===v?"checked":""}><span>${v}</span></label>`).join("");
    }else{
      input=`<textarea class="answer-input" data-answer="${q.id}" rows="${q.type==="fill"?1:q.type==="short"?3:6}" placeholder="${q.type==="fill"?"Type the missing word or phrase…":"Write your answer here…"}">${escapeHtml(state.answers[q.id]||"")}</textarea>`;
    }
    card.innerHTML=`<div class="question-top"><span class="q-number">QUESTION ${index+1}</span><span class="q-type">${typeName(q.type)}</span><label class="q-marks">Marks <input class="marks-edit" type="number" min="0" step="0.5" value="${Number(q.marks)||0}" style="width:65px;padding:5px;border:1px solid #dce2ed;border-radius:6px"></label></div>
      <p class="q-text"></p><textarea class="question-edit" aria-label="Edit question text">${escapeHtml(q.text)}</textarea>
      ${q.type==="mcq"?`<label class="field-label">MCQ options (one per line, e.g. A. Option text)</label><textarea class="answer-input options-edit" rows="3" placeholder="A. First option&#10;B. Second option&#10;C. Third option&#10;D. Fourth option">${escapeHtml((q.options||[]).map(o=>o.key+". "+o.text).join("\n"))}</textarea>`:""}
      <div class="answer-area">${input}</div>
      <label class="field-label">Reference answer / marking points (optional)</label><textarea class="answer-input reference-answer" rows="2" placeholder="Add the expected answer or key marking points">${escapeHtml(q.referenceAnswer||"")}</textarea>
      <div class="question-actions"><button class="tiny-btn change-type">Change answer type</button><button class="tiny-btn delete-question">Delete question</button><span class="muted">Autosaved</span></div>
      ${state.mode==="practice"?`<button class="tiny-btn reveal-reference">Show reference answer</button><div class="reference-reveal hidden muted" style="padding:10px;background:#f4f7fc;border-radius:8px;margin-top:8px;white-space:pre-wrap">${escapeHtml(q.referenceAnswer||"No per-question reference answer added. Add one above to use this feature.")}</div>`:""}`;
    card.querySelector(".q-text").textContent=q.text;
    card.querySelector(".question-edit").addEventListener("change",e=>{q.text=e.target.value;card.querySelector(".q-text").textContent=q.text;saveDraft();});
    card.querySelector(".options-edit")?.addEventListener("change",e=>{q.options=e.target.value.split(/\n/).map((line,i)=>{const m=line.match(/^\s*([A-Z])\s*[).:-]?\s*(.*)$/i);return {key:m?m[1].toUpperCase():String.fromCharCode(65+i),text:m?m[2].trim():line.trim()};}).filter(o=>o.text);renderQuestions();saveDraft();});
    card.querySelector(".change-type").addEventListener("click",()=>cycleType(q.id));
    card.querySelector(".marks-edit").addEventListener("change",e=>{q.marks=Math.max(0,Number(e.target.value)||0);saveDraft();});
    card.querySelector(".reference-answer").addEventListener("input",e=>{q.referenceAnswer=e.target.value;saveDraft();});
    card.querySelector(".delete-question").addEventListener("click",()=>{if(confirm("Delete this question?")){state.questions=state.questions.filter(x=>x.id!==q.id);delete state.answers[q.id];renderQuestions();saveDraft();}});
    card.querySelector(".reveal-reference")?.addEventListener("click",e=>{const box=card.querySelector(".reference-reveal");box.classList.toggle("hidden");e.target.textContent=box.classList.contains("hidden")?"Show reference answer":"Hide reference answer";});
    card.querySelectorAll("[data-answer]").forEach(el=>el.addEventListener("input",()=>{state.answers[q.id]=el.value;saveDraft();}));
    card.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(el=>el.addEventListener("change",()=>{const all=[...card.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);if(el.type==="checkbox")state.answers[q.id]=all;else state.answers[q.id]=el.value;saveDraft();}));
    list.appendChild(card);
  });
}
function getAnswerArray(id){const a=state.answers[id];return Array.isArray(a)?a:[];}
function cycleType(id){const q=state.questions.find(x=>x.id===id);const types=["mcq","fill","tf","short","long"];q.type=types[(types.indexOf(q.type)+1)%types.length];renderQuestions();saveDraft();}
function saveDraft(){
  const draft={questionName:state.questionName,keyName:state.keyName,questionText:state.questionText,keyText:state.keyText,questions:state.questions,answers:state.answers,mode:state.mode};
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));$("savedStatus").textContent="Saved just now";}catch(e){$("savedStatus").textContent="Storage full";}
}
function restoreDraftAnswers(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}");if(d.questionName===state.questionName&&d.keyName===state.keyName)state.answers=d.answers||{};}catch(e){}}
function loadDraft(){
  try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");if(!d)return;Object.assign(state,d);$("modeSelect").value=state.mode||"practice";if(state.questionText){$("paperTitle").textContent=state.questionName||"Saved paper";$("paperPreview").textContent=state.questionText.slice(0,14000);$("paperPreview").classList.remove("empty-state");state.questions=state.questions||[];renderQuestions();$("questionCount").textContent=`${state.questions.length} saved question(s)`;$("submitBtn").disabled=!state.questions.length;$("questionFileName").textContent=state.questionName||"Saved question paper";$("keyFileName").textContent=state.keyName||"Saved answer key";}}catch(e){}
}

$("submitBtn").addEventListener("click",evaluatePaper);
async function evaluatePaper(){
  if(!state.questions.length)return;
  const unanswered=state.questions.filter(q=>!String(state.answers[q.id]??"").trim()&&!(Array.isArray(state.answers[q.id])&&state.answers[q.id].length));
  if(unanswered.length&&!confirm(`${unanswered.length} question(s) are unanswered. Submit anyway?`))return;
  $("submitBtn").disabled=true;$("submitBtn").textContent="Evaluating…";
  try{
    const endpoint=localStorage.getItem("jusExamStudyEndpoint")||"";
    let result;
    if(endpoint){
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"evaluate",questions:state.questions,answers:state.answers,answerKeyText:state.keyText,mode:state.mode,paperName:state.questionName})});
      if(!response.ok)throw new Error(`Evaluation service returned ${response.status}`);
      result=await response.json();
      if(result.error)throw new Error(result.error);
    }else{
      result=localEvaluate();
      notify("No Apps Script backend configured. This attempt used local basic matching and was not sent to Google Sheets.",true);
    }
    result.date=new Date().toISOString();result.paperName=state.questionName||"Practice paper";
    const history=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");history.unshift(result);localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,100)));
    showResult(result);
  }catch(err){console.error(err);alert("Evaluation failed: "+err.message+". Check your Apps Script Web app URL and deployment access setting.");}
  finally{$("submitBtn").disabled=false;$("submitBtn").textContent="Evaluate my paper";}
}
function localEvaluate(){
  // Basic fallback only. It is not semantic AI grading.
  const rows=state.questions.map(q=>{
    const answer=state.answers[q.id]??"";
    const key=findKeyAnswer(q.id);
    const a=Array.isArray(answer)?answer.join(", "):String(answer);
    const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
    let awarded=0,feedback="No answer provided.";
    if(a.trim()){
      if(key&&norm(a)===norm(key)){awarded=q.marks||1;feedback="Exact text match with the extracted answer key.";}
      else if(key){const words=norm(key).split(" ").filter(w=>w.length>3);const hits=words.filter(w=>norm(a).includes(w)).length;const ratio=words.length?hits/words.length:0;awarded=(q.marks||1)*Math.min(.75,ratio);feedback="Basic keyword overlap only. Review manually; this is not semantic grading.";}
      else{awarded=0;feedback="Answer key could not be reliably matched to this question. Review manually.";}
    }
    return {id:q.id,question:q.text,answer:a,expected:key||"Not confidently extracted from answer key",marks:q.marks||1,awarded:Math.round(awarded*100)/100,feedback};
  });
  const total=rows.reduce((s,r)=>s+r.marks,0),score=rows.reduce((s,r)=>s+r.awarded,0);
  return {rows,total,score,percentage:total?Math.round(score/total*1000)/10:0,method:"Basic keyword matching (not AI)"};
}
function findKeyAnswer(id){
  const lines=state.keyText.split(/\n/);
  const re=new RegExp(`(?:^|\\n)\\s*(?:Q(?:uestion)?\\s*\\.?\\s*)?${id}\\s*[).:]?\\s*`, "i");
  const joined=state.keyText.replace(/\s+/g," ");
  const match=joined.match(new RegExp(`(?:Q(?:uestion)?\\s*\\.?\\s*)?${id}\\s*[).:]\\s*([^\\n]{5,350})`,"i"));
  return match?match[1].trim():"";
}
function showResult(r){
  const pct=Number(r.percentage??0);
  $("resultContent").innerHTML=`<p class="eyebrow">EVALUATION COMPLETE</p><h2 style="font-family:Manrope">Your result</h2><div class="result-score">${Number(r.score||0).toFixed(1)} / ${Number(r.total||0).toFixed(1)}</div><p class="muted">${pct}% • ${escapeHtml(r.method||"AI evaluation")} • ${escapeHtml(r.paperName||"")}</p><div style="height:8px;background:#edf0f5;border-radius:9px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,pct))}%;background:#16845b"></div></div><div style="margin-top:20px">${(r.rows||[]).map(row=>`<div class="result-row"><strong>Q${escapeHtml(row.id)} · ${Number(row.awarded||0)} / ${Number(row.marks||0)} marks</strong><p>${escapeHtml(row.question||"")}</p><p><b>Your answer:</b> ${escapeHtml(row.answer||"—")}</p><p><b>Expected answer:</b> ${escapeHtml(row.expected||"Not available")}</p><p>${escapeHtml(row.feedback||"")}</p></div>`).join("")}</div>`;
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


// Extra study tools: manual authoring, OCR, exports and printable reports.
$("addQuestionBtn").addEventListener("click",()=>{
  const next=Math.max(0,...state.questions.map(q=>Number(q.id)||0))+1;
  state.questions.push({id:next,text:"New question – edit this text",type:"short",marks:2,options:[],referenceAnswer:""});
  renderQuestions();saveDraft();$("questionCount").textContent=`${state.questions.length} question(s)`;
  document.querySelector(`[data-id="${next}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
});

$("ocrBtn").addEventListener("click",async()=>{
  if(!questionFile){notify("Choose a question paper PDF first.",true);return;}
  if(!window.Tesseract){notify("OCR library could not load. Check your internet connection and retry.",true);return;}
  const btn=$("ocrBtn");btn.disabled=true;btn.textContent="Running OCR…";
  try{
    if(keyFile&&!state.keyText)state.keyText=await readPdf(keyFile);
    const pdf=await pdfjsLib.getDocument({data:await questionFile.arrayBuffer()}).promise;
    let pages=[];
    for(let n=1;n<=pdf.numPages;n++){
      btn.textContent=`OCR page ${n}/${pdf.numPages}…`;
      const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.7});
      const canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;
      await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
      const result=await Tesseract.recognize(canvas,"eng");pages.push(result.data.text);
    }
    state.questionText=pages.join("\n\n");state.questionName=questionFile.name;
    state.questions=parseQuestions(state.questionText);
    if(!state.questions.length)state.questions=[{id:1,text:state.questionText.slice(0,1200)||"OCR did not detect text. Add a question manually.",type:"long",marks:0,options:[],referenceAnswer:""}];
    state.answers={};$("paperTitle").textContent=state.questionName;$("paperPreview").classList.remove("empty-state");$("paperPreview").textContent=state.questionText.slice(0,14000);
    renderQuestions();$("submitBtn").disabled=false;$("questionCount").textContent=`${state.questions.length} question(s) detected by OCR`;
    notify("OCR finished. Please proofread the extracted questions and correct any OCR mistakes before starting.");saveDraft();
  }catch(err){console.error(err);notify("OCR failed: "+err.message,true);}
  finally{btn.disabled=false;btn.textContent="OCR scanned PDF";}
});

function csvCell(v){return '"'+String(v??"").replace(/"/g,'""')+'"';}
$("exportCsvBtn").addEventListener("click",()=>{
  const rows=[["Question No","Question","Type","Marks","Your Answer","Reference Answer"]];
  state.questions.forEach(q=>rows.push([q.id,q.text,q.type,q.marks,Array.isArray(state.answers[q.id])?state.answers[q.id].join("; "):state.answers[q.id]||"",q.referenceAnswer||""]));
  const csv=rows.map(r=>r.map(csvCell).join(",")).join("\r\n");downloadBlob("jus-exam-study-answers.csv",new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
});
function downloadBlob(name,blob){const a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// Print the currently opened evaluation result or browser print dialog can save it as PDF.
const originalShowResult=showResult;
showResult=function(r){originalShowResult(r);const content=$("resultContent");if(!content.querySelector("#printReport")){const b=document.createElement("button");b.id="printReport";b.className="btn primary";b.textContent="Print / Save as PDF";b.addEventListener("click",()=>window.print());content.prepend(b);}};

$("exportHistoryBtn").addEventListener("click",()=>{
 const hs=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
 const rows=[["Paper","Date","Score","Total","Percentage","Evaluation method"] ,...hs.map(h=>[h.paperName,h.date,h.score,h.total,h.percentage,h.method])];
 const csv=rows.map(r=>r.map(csvCell).join(",")).join("\r\n");downloadBlob("jus-exam-study-history.csv",new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
});
