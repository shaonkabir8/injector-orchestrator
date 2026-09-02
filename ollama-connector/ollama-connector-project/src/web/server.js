// ===============================================================
// web/server.js – Web Dashboard Server (Node.js + SSE)
// Ollama Connector ☠️ v1.0.9
// ===============================================================

const http = require("http");
const fs   = require("fs");
const path = require("path");
const continueData = require("./continue_data.js");
const providers = require("./providers.js");

const TOOL_DIR    = process.env.HOME + "/.ollama_connector";
const LOG_FILE    = TOOL_DIR + "/logs/connector.log";
const METRICS_FILE = TOOL_DIR + "/data/metrics.json";
const PORT        = process.env.PORT || 3000;
// Bind to loopback only. This dashboard exposes usage telemetry and manages
// API keys; it must never be reachable from the network.
const HOST        = process.env.HOST || "127.0.0.1";

// Read a JSON body with a hard size cap.
function readJsonBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > 64 * 1024) { req.destroy(); return cb(new Error("body too large")); }
    chunks.push(c);
  });
  req.on("end", () => {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
    catch (e) { cb(new Error("invalid JSON body")); }
  });
  req.on("error", (e) => cb(e));
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

let clients = [];

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlDashboard());

  } else if (req.url === "/events") {
    // No CORS header: same-origin only. A wildcard here would let any site
    // you visit read your telemetry stream from localhost.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    });
    clients.push(res);
    req.on("close", () => { clients = clients.filter(c => c !== res); });
    sendMetrics(res);
    sendContinue(res);

  } else if (req.url === "/metrics.json") {
    try {
      const data = fs.readFileSync(METRICS_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
    }

  } else if (req.url === "/api/continue") {
    try {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify(continueData.aggregate()));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ERROR", error: String(e && e.message || e) }));
    }

  } else if (req.url === "/api/providers" && req.method === "GET") {
    // Masked listing only — safe to render in the browser.
    sendJson(res, 200, { ok: true, providers: providers.list() });

  } else if (req.url === "/api/providers" && req.method === "POST") {
    if (!providers.checkToken(req)) return sendJson(res, 401, { ok: false, errors: ["invalid or missing X-Admin-Token"] });
    readJsonBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { ok: false, errors: [err.message] });
      const result = providers.upsert(body || {});
      sendJson(res, result.ok ? 200 : 400, result);
    });

  } else if (req.url.startsWith("/api/providers/") && req.url.endsWith("/reveal") && req.method === "POST") {
    if (!providers.checkToken(req)) return sendJson(res, 401, { ok: false, errors: ["invalid or missing X-Admin-Token"] });
    const id = decodeURIComponent(req.url.slice("/api/providers/".length, -"/reveal".length));
    const result = providers.revealKey(id);
    sendJson(res, result.ok ? 200 : 404, result);

  } else if (req.url.startsWith("/api/providers/") && req.method === "DELETE") {
    if (!providers.checkToken(req)) return sendJson(res, 401, { ok: false, errors: ["invalid or missing X-Admin-Token"] });
    const id = decodeURIComponent(req.url.slice("/api/providers/".length));
    const result = providers.remove(id);
    sendJson(res, result.ok ? 200 : 404, result);

  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

function sendMetrics(res) {
  try {
    const data = JSON.parse(fs.readFileSync(METRICS_FILE, "utf8"));
    const last = data[data.length - 1] || {};
    const totalTokens = data.reduce((s, d) => s + (d.total_tokens || 0), 0);
    const cell = (label, value) =>
      `<div class="card p-4"><div class="text-[0.65rem] uppercase tracking-widest text-slate-500 mb-1">${label}</div><div class="stat text-2xl font-bold text-emerald-400">${value}</div></div>`;
    const html =
      cell("Iterations", last.iteration || 0) +
      cell("Tokens", totalTokens.toLocaleString()) +
      cell("Cost (USD)", "$" + (totalTokens * 0.002 / 1000000).toFixed(5)) +
      cell("RAM", Number(last.ram_percent || 0).toFixed(1) + "%") +
      cell("CPU Load", Number(last.cpu_load || 0).toFixed(2)) +
      cell("Latency", (last.latency_ms || 0) + "ms");
    res.write(`data: ${JSON.stringify({ type: "metric", html })}\n\n`);
  } catch { /* ignore */ }
}

let lastLogSize = 0;
setInterval(() => {
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > lastLogSize) {
      const raw   = fs.readFileSync(LOG_FILE, "utf8");
      const lines = raw.split("\n").filter(l => l.trim());
      const newLine = lines[lines.length - 1];
      if (newLine) {
        let cls = "info";
        if (newLine.includes("ERROR"))   cls = "error";
        else if (newLine.includes("SUCCESS")) cls = "success";
        else if (newLine.includes("WARN"))    cls = "warn";
        else if (newLine.includes("STEP"))    cls = "step";
        else if (newLine.includes("CHECK"))   cls = "check";
        const payload = JSON.stringify({ type: "log", cls, line: newLine });
        clients.forEach(c => c.write(`data: ${payload}\n\n`));
      }
      lastLogSize = stats.size;
    }
  } catch { /* ignore */ }
}, 500);

// Push metric updates every 5 seconds
setInterval(() => {
  clients.forEach(res => sendMetrics(res));
}, 5000);

// Continue dev_data: push on change (mtime poll) + every 10s heartbeat
function sendContinue(res) {
  try {
    const agg = continueData.aggregate();
    res.write(`data: ${JSON.stringify({ type: "continue", agg })}\n\n`);
  } catch { /* ignore */ }
}
let lastContinueSig = "";
setInterval(() => {
  let sig = "";
  try { sig = JSON.stringify(continueData.fileMtimes()); } catch { /* ignore */ }
  if (sig !== lastContinueSig) {
    lastContinueSig = sig;
    clients.forEach(res => sendContinue(res));
  }
}, 2000);
setInterval(() => {
  clients.forEach(res => sendContinue(res));
}, 10000);

function htmlDashboard() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mr.0x1nj3ct04 ☠️ Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root { --bg:#090d14; --surface:#0d1520; --border:#1a2a3a; --text:#e2e8f0; --muted:#64748b; }
    html.light { --bg:#f1f5f9; --surface:#ffffff; --border:#cbd5e1; --text:#0f172a; --muted:#64748b; }
    body { background:var(--bg); color:var(--text); font-family: ui-monospace, "JetBrains Mono", "Courier New", monospace; transition:background .2s,color .2s; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:0.75rem; }
    .card:hover { border-color:#00e5ff55; }
    .stat { font-variant-numeric: tabular-nums; }
    .bar { height:8px; border-radius:9999px; background:var(--border); overflow:hidden; }
    .bar > span { display:block; height:100%; background:linear-gradient(90deg,#00e5ff,#00ff88); }
    ::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:8px}
    .pulse{animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  </style>
</head>
<body class="min-h-screen p-6">
  <header class="flex items-center justify-between border-b border-[#1a2a3a] pb-4 mb-6">
    <div class="flex items-center gap-3">
      <i data-lucide="bot" class="text-pink-400 w-7 h-7"></i>
      <div>
        <h1 class="text-lg font-bold tracking-widest text-pink-400 uppercase">Mr.0x1nj3ct04 ☠️</h1>
        <p class="text-xs text-slate-500 tracking-wide">Profile Connector v1.0.9 &nbsp;|&nbsp; Mr. 1nj3ct04 &nbsp;|&nbsp; realtime dev_data</p>
      </div>
    </div>
    <div class="flex items-center gap-3 text-xs">
      <button id="theme-toggle" title="Toggle theme" class="card px-2 py-1.5 hover:border-cyan-400 transition"><i data-lucide="moon" class="w-4 h-4"></i></button>
      <span id="dot" class="w-2 h-2 rounded-full bg-emerald-400 pulse"></span>
      <span id="conn" class="text-slate-400">connecting…</span>
    </div>
  </header>

  <section class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400"><i data-lucide="key-round" class="w-4 h-4"></i> Providers &amp; API Keys</h2>
      <div class="flex items-center gap-2">
        <input id="admin-token" type="password" placeholder="admin token (from server console)" class="card px-2 py-1 text-xs w-56 outline-none focus:border-cyan-400" style="color:var(--text)">
        <button id="btn-unlock" class="card px-3 py-1 text-xs hover:border-cyan-400 transition">Unlock</button>
        <button id="btn-new" class="card px-3 py-1 text-xs hover:border-emerald-400 transition text-emerald-400">+ Add</button>
      </div>
    </div>
    <div id="prov-status" class="text-[0.7rem] mb-2 text-slate-500">🔒 Locked — paste the admin token printed in the server console to edit.</div>
    <div id="prov-list" class="grid md:grid-cols-2 xl:grid-cols-3 gap-3"></div>

    <div id="prov-form" class="card p-4 mt-3 hidden">
      <div class="grid md:grid-cols-2 gap-3 text-xs">
        <label class="block">Label
          <input id="f-label" class="card w-full px-2 py-1 mt-1 outline-none focus:border-cyan-400" style="color:var(--text)" placeholder="GonkaRouter">
        </label>
        <label class="block">Base URL
          <input id="f-baseurl" class="card w-full px-2 py-1 mt-1 outline-none focus:border-cyan-400" style="color:var(--text)" placeholder="https://api.example.io/v1">
        </label>
        <label class="block">Default Model
          <input id="f-model" class="card w-full px-2 py-1 mt-1 outline-none focus:border-cyan-400" style="color:var(--text)" placeholder="deepseek-ai/DeepSeek-V4-Flash-0731">
        </label>
        <label class="block">API Key <span class="text-slate-500">(blank = keep existing)</span>
          <input id="f-key" type="password" autocomplete="off" class="card w-full px-2 py-1 mt-1 outline-none focus:border-cyan-400" style="color:var(--text)" placeholder="sk-…">
        </label>
      </div>
      <div class="flex items-center gap-2 mt-3">
        <button id="f-save" class="card px-3 py-1 text-xs text-emerald-400 hover:border-emerald-400 transition">💾 Save</button>
        <button id="f-cancel" class="card px-3 py-1 text-xs text-slate-400 hover:border-slate-400 transition">Cancel</button>
        <span id="f-msg" class="text-[0.7rem] text-slate-500"></span>
        <input id="f-id" type="hidden">
      </div>
    </div>
  </section>

  <section class="mb-6">
    <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 mb-3"><i data-lucide="sparkles" class="w-4 h-4"></i> Continue — Agentic AI &amp; Usage</h2>
    <div id="c-cards" class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3"></div>
  </section>

  <div class="grid md:grid-cols-2 gap-6 mb-6">
    <section class="card p-4">
      <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 mb-3"><i data-lucide="trending-up" class="w-4 h-4"></i> Token Throughput (realtime)</h2>
      <canvas id="chart-tokens" height="140"></canvas>
    </section>
    <section class="card p-4">
      <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 mb-3"><i data-lucide="pie-chart" class="w-4 h-4"></i> Model Token Share</h2>
      <canvas id="chart-models" height="140"></canvas>
    </section>
  </div>

  <div class="grid md:grid-cols-2 gap-6 mb-6">
    <section class="card p-4">
      <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 mb-3"><i data-lucide="layers" class="w-4 h-4"></i> Model Usage (tokens)</h2>
      <div id="c-models" class="space-y-3 text-sm"></div>
    </section>
    <section class="card p-4">
      <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 mb-3"><i data-lucide="wrench" class="w-4 h-4"></i> Top Tools (agentic)</h2>
      <div id="c-tools" class="space-y-2 text-sm"></div>
    </section>
  </div>

  <section class="mb-6">
    <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 mb-3"><i data-lucide="activity" class="w-4 h-4"></i> Ollama Connector Loop</h2>
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" id="metrics">
      <div class="card p-4"><div class="text-[0.65rem] uppercase tracking-widest text-slate-500">Loading…</div><div class="value text-2xl font-bold text-emerald-400">—</div></div>
    </div>
  </section>

  <section>
    <div class="flex items-center justify-between mb-2">
      <h2 class="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400"><i data-lucide="terminal" class="w-4 h-4"></i> Live Logs</h2>
      <span class="text-[0.7rem] text-slate-500">SSE stream</span>
    </div>
    <div class="card h-80 overflow-y-auto p-3 text-xs" id="log"></div>
  </section>

  <script>
    var COLORS = { info:'text-sky-400', success:'text-emerald-400', warn:'text-yellow-400', error:'text-red-400', step:'text-pink-400', check:'text-violet-400' };
    function fmt(n){ return (n==null?0:n).toLocaleString(); }
    function card(icon, label, value, sub, accent){
      accent = accent || 'text-emerald-400';
      return '<div class="card p-4">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<span class="text-[0.65rem] uppercase tracking-widest text-slate-500">' + label + '</span>' +
          '<i data-lucide="' + icon + '" class="w-4 h-4 text-slate-600"></i>' +
        '</div>' +
        '<div class="stat text-2xl font-bold ' + accent + '">' + value + '</div>' +
        (sub ? '<div class="text-[0.7rem] text-slate-500 mt-1">' + sub + '</div>' : '') +
      '</div>';
    }
    var tokChart=null, modelChart=null, lastTotal=null;
    function initCharts(){
      if(!window.Chart) return;
      var gridC='rgba(148,163,184,0.12)', tickC='#64748b';
      Chart.defaults.color=tickC; Chart.defaults.font.family='ui-monospace, monospace';
      tokChart=new Chart(document.getElementById('chart-tokens'),{type:'line',
        data:{labels:[],datasets:[{label:'tokens/interval',data:[],borderColor:'#00e5ff',backgroundColor:'rgba(0,229,255,0.12)',fill:true,tension:0.35,pointRadius:0,borderWidth:2}]},
        options:{responsive:true,animation:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:gridC}},y:{grid:{color:gridC},beginAtZero:true}}}});
      modelChart=new Chart(document.getElementById('chart-models'),{type:'doughnut',
        data:{labels:[],datasets:[{data:[],backgroundColor:['#00e5ff','#00ff88','#ff66cc','#ffd600','#4fc3f7','#aa88ff'],borderColor:'#0d1520',borderWidth:2}]},
        options:{responsive:true,animation:false,cutout:'62%',plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:10}}}}}});
    }
    function updateCharts(a){
      var t=a.tokens||{}, models=a.models||[];
      if(tokChart){
        var delta = (lastTotal==null)?0:Math.max(0,(t.total||0)-lastTotal); lastTotal=t.total||0;
        var lbl=new Date().toLocaleTimeString();
        tokChart.data.labels.push(lbl); tokChart.data.datasets[0].data.push(delta);
        if(tokChart.data.labels.length>30){tokChart.data.labels.shift();tokChart.data.datasets[0].data.shift();}
        tokChart.update('none');
      }
      if(modelChart){
        var top=models.slice(0,6);
        modelChart.data.labels=top.map(function(m){return m.model;});
        modelChart.data.datasets[0].data=top.map(function(m){return m.promptTokens+m.generatedTokens;});
        modelChart.update('none');
      }
    }
    function renderContinue(a){
      var t=a.tokens||{}, ch=a.chat||{}, tl=a.tools||{}, ed=a.edits||{};
      updateCharts(a);
      var cards = ''+
        card('coins','Est. Cost (USD)','$'+(t.estCostUsd!=null?t.estCostUsd.toFixed(4):'0'),'prompt+gen estimate','text-cyan-400')+
        card('binary','Total Tokens',fmt(t.total),fmt(t.prompt)+' in / '+fmt(t.generated)+' out')+
        card('messages-square','Chat Interactions',fmt(ch.interactions),fmt(ch.sessions)+' sessions')+
        card('wrench','Tool Calls',fmt(tl.calls),(tl.successRate||0)+'% success · '+(tl.acceptRate||0)+'% accepted','text-pink-400')+
        card('git-pull-request','Edit Accept',(ed.acceptRate||0)+'%',fmt(ed.total)+' edits')+
        card('plus-circle','Lines Added',fmt(ed.linesAdded),null,'text-emerald-400')+
        card('minus-circle','Lines Removed',fmt(ed.linesRemoved),null,'text-red-400')+
        card('layers','Models Used',fmt((a.models||[]).length),'this workspace','text-violet-400');
      document.getElementById('c-cards').innerHTML = cards;
      var models=a.models||[]; var max=1; models.forEach(function(m){var s=m.promptTokens+m.generatedTokens; if(s>max)max=s;});
      document.getElementById('c-models').innerHTML = models.slice(0,6).map(function(m){
        var s=m.promptTokens+m.generatedTokens; var w=Math.round(s/max*100);
        return '<div><div class="flex justify-between mb-1"><span class="text-slate-300">'+m.model+'</span><span class="text-slate-500">'+fmt(s)+'</span></div><div class="bar"><span style="width:'+w+'%"></span></div></div>';
      }).join('') || '<div class="text-slate-500">No model data yet.</div>';
      var tools=(a.tools&&a.tools.byTool)||[];
      document.getElementById('c-tools').innerHTML = tools.map(function(x){
        return '<div class="flex items-center justify-between"><span class="text-slate-300">'+x.name+'</span><span class="text-slate-500">'+x.succeeded+'/'+x.calls+'</span></div>';
      }).join('') || '<div class="text-slate-500">No tool calls yet.</div>';
      if(window.lucide) lucide.createIcons();
    }
    // ---- Providers admin panel ----
    var TOKEN='';
    function hdrs(){ var h={'Content-Type':'application/json'}; if(TOKEN) h['X-Admin-Token']=TOKEN; return h; }
    function setStatus(msg, cls){ var el=document.getElementById('prov-status'); el.textContent=msg; el.className='text-[0.7rem] mb-2 '+(cls||'text-slate-500'); }
    function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function loadProviders(){
      fetch('/api/providers').then(function(r){return r.json();}).then(function(d){
        var list=(d.providers)||[];
        document.getElementById('prov-list').innerHTML = list.map(function(p){
          var keyBadge = p.hasKey
            ? '<span class="text-emerald-400">🔑 '+esc(p.keyMasked)+'</span>'
            : '<span class="text-yellow-400">⚠️ no key</span>';
          return '<div class="card p-3">'+
            '<div class="flex items-center justify-between mb-1">'+
              '<span class="text-sm font-bold text-slate-200">'+esc(p.label)+'</span>'+
              '<span class="text-[0.65rem] '+(p.enabled?'text-emerald-400':'text-slate-500')+'">'+(p.enabled?'● enabled':'○ disabled')+'</span>'+
            '</div>'+
            '<div class="text-[0.7rem] text-slate-500 truncate" title="'+esc(p.baseUrl)+'">🌐 '+esc(p.baseUrl)+'</div>'+
            (p.defaultModel?'<div class="text-[0.7rem] text-slate-500 truncate">🤖 '+esc(p.defaultModel)+'</div>':'')+
            '<div class="text-[0.7rem] mt-1">'+keyBadge+'</div>'+
            '<div class="flex gap-2 mt-2">'+
              '<button data-act="edit" data-id="'+esc(p.id)+'" class="card px-2 py-0.5 text-[0.7rem] hover:border-cyan-400">✏️ Edit</button>'+
              '<button data-act="reveal" data-id="'+esc(p.id)+'" class="card px-2 py-0.5 text-[0.7rem] hover:border-yellow-400">👁 Reveal</button>'+
              '<button data-act="del" data-id="'+esc(p.id)+'" class="card px-2 py-0.5 text-[0.7rem] text-red-400 hover:border-red-400">🗑 Delete</button>'+
            '</div></div>';
        }).join('') || '<div class="text-slate-500 text-sm">No providers configured.</div>';
      });
    }
    function showForm(p){
      document.getElementById('prov-form').classList.remove('hidden');
      document.getElementById('f-id').value = p&&p.id?p.id:'';
      document.getElementById('f-label').value = p&&p.label?p.label:'';
      document.getElementById('f-baseurl').value = p&&p.baseUrl?p.baseUrl:'';
      document.getElementById('f-model').value = p&&p.defaultModel?p.defaultModel:'';
      document.getElementById('f-key').value='';
      document.getElementById('f-msg').textContent='';
    }
    document.getElementById('btn-unlock').addEventListener('click', function(){
      TOKEN=document.getElementById('admin-token').value.trim();
      if(!TOKEN){ setStatus('🔒 Locked — token required.','text-yellow-400'); return; }
      // Validate by attempting an authenticated no-op reveal on a bogus id.
      fetch('/api/providers/__probe__/reveal',{method:'POST',headers:hdrs()}).then(function(r){
        if(r.status===401){ TOKEN=''; setStatus('❌ Invalid admin token.','text-red-400'); }
        else { setStatus('🔓 Unlocked — editing enabled.','text-emerald-400'); }
      });
    });
    document.getElementById('btn-new').addEventListener('click', function(){ showForm(null); });
    document.getElementById('f-cancel').addEventListener('click', function(){ document.getElementById('prov-form').classList.add('hidden'); });
    document.getElementById('f-save').addEventListener('click', function(){
      if(!TOKEN){ document.getElementById('f-msg').textContent='🔒 Unlock with the admin token first.'; return; }
      var body={ id:document.getElementById('f-id').value||undefined, label:document.getElementById('f-label').value,
        baseUrl:document.getElementById('f-baseurl').value, defaultModel:document.getElementById('f-model').value,
        apiKey:document.getElementById('f-key').value };
      fetch('/api/providers',{method:'POST',headers:hdrs(),body:JSON.stringify(body)})
        .then(function(r){return r.json();}).then(function(d){
          if(d.ok){ document.getElementById('f-msg').textContent='✅ Saved.'; document.getElementById('f-key').value=''; loadProviders(); }
          else { document.getElementById('f-msg').textContent='❌ '+((d.errors||['failed']).join('; ')); }
        });
    });
    document.getElementById('prov-list').addEventListener('click', function(e){
      var btn=e.target.closest('button[data-act]'); if(!btn) return;
      var id=btn.getAttribute('data-id'), act=btn.getAttribute('data-act');
      if(act==='edit'){
        fetch('/api/providers').then(function(r){return r.json();}).then(function(d){
          var p=(d.providers||[]).filter(function(x){return x.id===id;})[0]; showForm(p);
        });
      } else if(act==='reveal'){
        if(!TOKEN){ setStatus('🔒 Unlock with the admin token to reveal keys.','text-yellow-400'); return; }
        fetch('/api/providers/'+encodeURIComponent(id)+'/reveal',{method:'POST',headers:hdrs()})
          .then(function(r){return r.json();}).then(function(d){
            if(d.ok){ setStatus('👁 '+id+': '+d.apiKey+'  (visible to this browser only)','text-yellow-400'); }
            else { setStatus('❌ '+((d.errors||['failed']).join('; ')),'text-red-400'); }
          });
      } else if(act==='del'){
        if(!TOKEN){ setStatus('🔒 Unlock with the admin token to delete.','text-yellow-400'); return; }
        if(!confirm('Delete provider "'+id+'"? This removes its stored API key.')) return;
        fetch('/api/providers/'+encodeURIComponent(id),{method:'DELETE',headers:hdrs()})
          .then(function(r){return r.json();}).then(function(d){
            if(d.ok){ setStatus('🗑 Removed '+id,'text-slate-400'); loadProviders(); }
            else { setStatus('❌ '+((d.errors||['failed']).join('; ')),'text-red-400'); }
          });
      }
    });
    loadProviders();

    // Theme toggle (persisted)
    (function(){
      var root=document.documentElement, btn=document.getElementById('theme-toggle');
      function apply(t){ if(t==='light'){root.classList.add('light');} else {root.classList.remove('light');} if(btn){btn.innerHTML='<i data-lucide="'+(t==='light'?'sun':'moon')+'" class="w-4 h-4"></i>';} if(window.lucide) lucide.createIcons(); }
      var saved=localStorage.getItem('theme')||'dark'; apply(saved);
      if(btn) btn.addEventListener('click',function(){ var t=root.classList.contains('light')?'dark':'light'; localStorage.setItem('theme',t); apply(t); });
    })();
    var es = new EventSource('/events');
    es.onopen = function(){ document.getElementById('conn').textContent='online'; };
    es.onerror = function(){ document.getElementById('conn').textContent='reconnecting…'; document.getElementById('dot').classList.remove('bg-emerald-400'); document.getElementById('dot').classList.add('bg-yellow-400'); };
    es.onmessage = function(e){
      var d = JSON.parse(e.data);
      if (d.type==='metric'){ document.getElementById('metrics').innerHTML = d.html; }
      else if (d.type==='continue'){ renderContinue(d.agg); }
      else if (d.type==='log'){
        var div=document.createElement('div');
        div.className='py-0.5 border-b border-[#0d1520] whitespace-pre-wrap '+(COLORS[d.cls]||'text-slate-300');
        div.textContent=d.line;
        var c=document.getElementById('log'); c.appendChild(div); c.scrollTop=c.scrollHeight;
        while(c.children.length>500) c.removeChild(c.firstChild);
      }
    };
    if(window.lucide) lucide.createIcons();
    initCharts();
  </script>
</body>
</html>`;
}

providers.ensureStore();

server.listen(PORT, HOST, () => {
  console.log(`Dashboard running at http://${HOST}:${PORT}`);
  console.log(`Provider store: ${providers.STORE} (mode 0600)`);
  console.log("");
  console.log("Admin token (required for key add/update/remove):");
  console.log(`  ${providers.ADMIN_TOKEN}`);
  console.log("Paste it into the Providers panel to unlock editing.");
  console.log("Set DASHBOARD_ADMIN_TOKEN to pin it across restarts.");
  console.log("");
  console.log("Press Ctrl+C to stop");
});
