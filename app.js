(function(){
"use strict";
const CFG = window.SNOW_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const HAZ_TYPES = ["Hazard reported","Resident complaint","Slip / fall incident"];
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(_) { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(_) {} },
  del(k){ try { localStorage.removeItem(k); } catch(_) {} }
};
let entries = [], range = {from:null,to:null};

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2,"0");
const localInput = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes());
const dateInput = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
function fmt(ts){ if(!ts) return ""; const d = new Date(ts); if(isNaN(d)) return ts; return d.toLocaleString("en-CA",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}); }
function seasonStart(now){ const y = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear()-1; return new Date(y,9,1); } // Oct 1
function num(v){ const n = parseFloat(v); return isFinite(n) ? n : null; }

/* ---------- backend (Google Apps Script) ---------- */
async function api(method, payload){
  if(!CFG.scriptUrl) throw {code:"no_backend"};
  let res;
  if(method === "GET"){
    res = await fetch(CFG.scriptUrl + "?t=" + Date.now());
  } else {
    // text/plain avoids a CORS preflight, which Apps Script doesn't answer.
    res = await fetch(CFG.scriptUrl, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body: JSON.stringify(payload)});
  }
  if(!res.ok) throw {code:"network"};
  const out = await res.json();
  if(!out.ok) throw {code: out.error || "server"};
  return out;
}
async function load(){
  try{
    const out = await api("GET");
    entries = out.entries || [];
    $("#status").textContent = entries.length + " entries · updated " + new Date().toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit",hour12:false});
    renderAll();
    return true;
  }catch(e){
    if(e.code === "bad_pin"){ $("#status").textContent = "The Google Script still requires a PIN · update Code.gs (see README)"; return true; }
    if(e.code === "no_backend"){ $("#status").textContent = "Not connected to a Google Sheet yet"; return true; }
    $("#status").textContent = "Couldn't reach the log · showing last loaded";
    return true;
  }
}

/* ---------- forecast (live from Open-Meteo) ---------- */
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function flags(d){
  const f = [];
  if(d.snow >= 2) f.push(["crit","Plow / shovel"]); else if(d.snow > 0) f.push(["warn","Pre-salt"]);
  if(d.rain > 0 && d.min <= 0) f.push(["crit","Freezing rain"]);
  if(d.min <= 0 && d.max >= 0) f.push(["warn","Refreeze"]);
  if(d.min <= -10) f.push(["info","Deep cold"]);
  if(!f.length) f.push(["ok","No action"]);
  return f;
}
async function loadForecast(){
  const lat = CFG.latitude ?? 43.65, lon = CFG.longitude ?? -79.38;
  const url = "https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+
    "&daily=temperature_2m_max,temperature_2m_min,snowfall_sum,rain_sum,precipitation_probability_max,wind_gusts_10m_max&timezone=America%2FToronto&forecast_days=7";
  try{
    const r = await fetch(url); if(!r.ok) throw 0;
    const j = await r.json(), D = j.daily;
    const days = D.time.map((t,i) => ({date:t, max:D.temperature_2m_max[i], min:D.temperature_2m_min[i], snow:D.snowfall_sum[i]||0, rain:D.rain_sum[i]||0, pop:D.precipitation_probability_max[i]??0, gust:D.wind_gusts_10m_max[i]||0}));
    renderForecast(days);
    $("#fc-asof").textContent = "Updated " + fmt(new Date());
  }catch(_){
    $("#fc").innerHTML = '<div class="empty">Couldn\'t load the forecast. Check the connection and reload.</div>';
    $("#fc-asof").textContent = "Forecast unavailable";
  }
}
function renderForecast(days){
  $("#fc").innerHTML = days.map(d => {
    const fl = flags(d), lvl = fl.some(x=>x[0]==="crit") ? "crit" : fl.some(x=>x[0]==="warn") ? "warn" : "ok";
    const dt = new Date(d.date+"T12:00:00");
    return `<div class="day ${lvl}">
      <div class="d">${DOW[dt.getDay()]} <span class="muted mono" style="font-size:.8rem">${dt.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}</span></div>
      <div class="t">${Math.round(d.max)}° / ${Math.round(d.min)}°</div>
      <div class="row"><span>Snow</span><b>${d.snow.toFixed(1)} cm</b></div>
      <div class="row"><span>Rain</span><b>${d.rain.toFixed(1)} mm</b></div>
      <div class="row"><span>Precip</span><b>${d.pop}%</b></div>
      <div class="row"><span>Gusts</span><b>${Math.round(d.gust)} km/h</b></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${fl.map(x=>`<span class="chip ${x[0]}">${x[1]}</span>`).join("")}</div>
    </div>`;
  }).join("");
}

/* ---------- hazards & season ---------- */
function renderHazards(){
  const open = entries.filter(e => e.status === "open").sort((a,b) => a.ts < b.ts ? 1 : -1);
  $("#hz-count").textContent = open.length + " open";
  $("#hz").innerHTML = open.length ? open.map(e => `<div class="hz-item">
      <div class="top"><strong>${esc(e.area)}</strong><span class="mono muted" style="font-size:.78rem">${esc(fmt(e.ts))}</span></div>
      <div><span class="chip crit">${esc(e.type)}</span> <span class="chip warn">${esc(e.cond)}</span></div>
      ${e.notes ? `<div style="font-size:.86rem">${esc(e.notes)}</div>` : ""}
      <div class="actions"><span class="muted" style="font-size:.8rem">Logged by ${esc(e.by)}</span><button type="button" class="small ghost" data-resolve="${esc(e.id)}">Mark resolved</button></div>
    </div>`).join("") : `<div class="empty">No open hazards. Entries marked as hazards, complaints and slip/fall incidents stay here until resolved.</div>`;
  const ss = dateInput(seasonStart(new Date()));
  const s = entries.filter(e => String(e.ts) >= ss);
  const kg = s.reduce((t,e) => t + (num(e.qty)||0), 0);
  $("#season").innerHTML = [
    [s.length,"Entries this season"],
    [kg.toFixed(0)+" kg","Material used this season"],
    [s.filter(e => e.type==="Plowing"||e.type==="Shovelling").length,"Plow / shovel runs"],
    [s.filter(e => e.type==="Slip / fall incident").length,"Slip / fall incidents"]
  ].map(([v,k]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");
}

/* ---------- report ---------- */
function inRange(){
  const area = $("#r-area").value;
  return entries.filter(e => {
    const day = String(e.ts).slice(0,10);
    if(range.from && day < range.from) return false;
    if(range.to && day > range.to) return false;
    if(area && e.area !== area) return false;
    return true;
  }).sort((a,b) => a.ts < b.ts ? 1 : -1);
}
const blank = v => v === "" || v == null;
function renderReport(){
  const list = inRange();
  const kg = list.reduce((t,e) => t + (num(e.qty)||0), 0);
  $("#rstats").innerHTML = [
    [list.length,"Entries"],
    [list.filter(e => e.type==="Inspection / patrol").length,"Patrols"],
    [list.filter(e => ["Plowing","Shovelling"].includes(e.type)).length,"Plow / shovel"],
    [kg.toFixed(1)+" kg","Material"],
    [list.filter(e => HAZ_TYPES.includes(e.type)).length,"Hazards & incidents"]
  ].map(([v,k]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");
  $("#rows").innerHTML = list.length ? list.map(e => `<tr>
    <td class="num">${esc(fmt(e.ts))}</td><td>${esc(e.type)}</td><td>${esc(e.area)}</td><td>${esc(e.cond)}</td>
    <td>${esc(e.mat||"—")}</td><td class="num">${blank(e.qty)?"—":esc(e.qty)}</td><td class="num">${blank(e.temp)?"—":esc(e.temp)}</td>
    <td>${esc(e.by)}</td><td>${esc(e.notes||"")}</td>
    <td>${e.status==="open"?'<span class="chip crit">Open</span>':e.status==="resolved"?'<span class="chip ok">Resolved</span>':'<span class="muted">—</span>'}</td></tr>`).join("")
    : `<tr><td colspan="10" class="muted">No entries in this range. Change the dates or log a patrol above.</td></tr>`;
}
function reportText(){
  const list = inRange().slice().reverse();
  const kg = list.reduce((t,e) => t + (num(e.qty)||0), 0);
  const L = ["SNOW & ICE LOG REPORT — " + (CFG.building || "")];
  L.push("Period: "+(range.from||"start")+" to "+(range.to||"today")+($("#r-area").value?" | Area: "+$("#r-area").value:""));
  L.push("Entries: "+list.length+" | Material: "+kg.toFixed(1)+" kg | Hazards/incidents: "+list.filter(e=>HAZ_TYPES.includes(e.type)).length+" | Still open: "+list.filter(e=>e.status==="open").length);
  L.push("");
  list.forEach(e => {
    L.push(fmt(e.ts)+" | "+e.type+" | "+e.area+" | "+e.cond+(e.mat?" | "+e.mat+(blank(e.qty)?"":" "+e.qty+" kg"):"")+(blank(e.temp)?"":" | "+e.temp+" °C")+" | "+e.by+(e.status==="open"?" | OPEN":e.status==="resolved"?" | resolved "+fmt(e.resolvedAt):""));
    if(e.notes) L.push("    "+e.notes);
  });
  return L.join("\n");
}
function csv(){
  const head = ["timestamp","type","area","condition","material","qty_kg","air_temp_c","done_by","notes","status","resolved_at"];
  const q = v => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  return [head.join(",")].concat(inRange().slice().reverse().map(e => [e.ts,e.type,e.area,e.cond,e.mat,e.qty,e.temp,e.by,e.notes,e.status,e.resolvedAt].map(q).join(","))).join("\n");
}
function setRange(r){
  const now = new Date();
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.r === String(r))));
  let from;
  if(r === "season") from = seasonStart(now);
  else { const n = Number(r); from = new Date(now); from.setDate(from.getDate() - (n === 1 ? 1 : n-1)); }
  range = {from: dateInput(from), to: dateInput(now)};
  $("#r-from").value = range.from; $("#r-to").value = range.to;
  renderReport();
}
function renderAll(){ renderHazards(); renderReport(); }

/* ---------- quick log ---------- */
const QUICK = {
  patrol:{type:"Inspection / patrol",cond:"Clear & dry",mat:"",open:false,focus:"#f-area"},
  salt:{type:"Salt / de-icer applied",cond:"Ice / black ice",mat:"Rock salt (NaCl)",open:false,focus:"#f-qty"},
  plow:{type:"Shovelling",cond:"Snow 2 cm or more",mat:"",open:false,focus:"#f-area"},
  hazard:{type:"Hazard reported",cond:"Ice / black ice",mat:"",open:true,focus:"#f-notes"}
};
document.addEventListener("click", ev => {
  const k = ev.target.closest && ev.target.closest("[data-q]"); if(!k) return;
  const q = QUICK[k.dataset.q];
  $("#f-type").value = q.type; $("#f-cond").value = q.cond; $("#f-mat").value = q.mat; $("#f-open").checked = q.open;
  $("#f-ts").value = localInput(new Date());
  $("#f").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start"});
  setTimeout(() => $(q.focus).focus({preventScroll:true}), 350);
});

/* ---------- form ---------- */
$("#f-now").onclick = () => { $("#f-ts").value = localInput(new Date()); };
$("#f-ts").value = localInput(new Date());
$("#f-type").onchange = () => { $("#f-open").checked = HAZ_TYPES.includes($("#f-type").value); };
const savedBy = store.get("sil-by"); if(savedBy) $("#f-by").value = savedBy;
$("#f").addEventListener("submit", async ev => {
  ev.preventDefault();
  const msg = $("#f-msg"); msg.className = "msg";
  const e = {
    ts:$("#f-ts").value, type:$("#f-type").value, area:$("#f-area").value, cond:$("#f-cond").value,
    mat:$("#f-mat").value, qty:$("#f-qty").value === "" ? "" : Number($("#f-qty").value),
    temp:$("#f-temp").value === "" ? "" : Number($("#f-temp").value), by:$("#f-by").value.trim(),
    notes:$("#f-notes").value.trim(), status:$("#f-open").checked ? "open" : "none"
  };
  $("#f-save").disabled = true; msg.textContent = "Saving…";
  try{
    const out = await api("POST", {action:"add", entry:e});
    store.set("sil-by", e.by);
    entries.push(Object.assign({id:out.id, createdAt:new Date().toISOString()}, e)); renderAll();
    msg.textContent = "Saved " + e.type.toLowerCase() + " at " + e.area + ".";
    $("#f-qty").value = ""; $("#f-notes").value = ""; $("#f-open").checked = false; $("#f-ts").value = localInput(new Date());
  }catch(err){
    msg.className = "msg err";
    msg.textContent = err.code === "no_backend" ? "Not connected to the Google Sheet yet, so this entry wasn't saved."
      : err.code === "bad_pin" ? "The Google Script still asks for a PIN. Update Code.gs as described in the README."
      : "Couldn't save. Check your connection and try again; the entry is still in the form.";
  }finally{ $("#f-save").disabled = false; }
});
$("#hz").addEventListener("click", async ev => {
  const id = ev.target.dataset && ev.target.dataset.resolve; if(!id) return;
  ev.target.disabled = true; ev.target.textContent = "Saving…";
  try{ await api("POST", {action:"resolve", id}); const e = entries.find(x => x.id === id); if(e){ e.status = "resolved"; e.resolvedAt = new Date().toISOString(); } renderAll(); }
  catch(_){ ev.target.disabled = false; ev.target.textContent = "Couldn't update · retry"; }
});

/* ---------- report controls ---------- */
document.querySelectorAll(".seg button").forEach(b => b.onclick = () => setRange(b.dataset.r));
["#r-from","#r-to"].forEach(s => $(s).onchange = () => {
  range = {from:$("#r-from").value||null, to:$("#r-to").value||null};
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed","false"));
  renderReport();
});
$("#r-area").innerHTML = '<option value="">All areas</option>' + [...$("#f-area").options].map(o => `<option>${esc(o.value)}</option>`).join("");
$("#r-area").onchange = renderReport;
$("#copy").onclick = () => {
  const t = reportText(), box = $("#copybox");
  const fallback = () => { box.hidden = false; box.value = t; box.focus(); box.select(); $("#r-msg").textContent = "Text selected below. Press Ctrl+C / ⌘C to copy."; };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => { $("#r-msg").textContent = "Report copied. Paste it into an email or the board package."; }, fallback);
  else fallback();
};
$("#csv").onclick = () => {
  const blob = new Blob([csv()], {type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "snow-ice-log_" + (range.from||"all") + "_to_" + (range.to||"today") + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $("#r-msg").textContent = "CSV downloaded.";
};
setRange(7);

/* ---------- startup ---------- */
$("#bldg").textContent = CFG.building || "Toronto";
if(!CFG.scriptUrl) $("#setup").hidden = false;
loadForecast();
load();
setInterval(() => { if(!document.hidden) load(); }, 60000);
document.addEventListener("visibilitychange", () => { if(!document.hidden) load(); });
})();
