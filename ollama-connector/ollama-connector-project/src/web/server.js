// ===============================================================
// web/server.js – Web Dashboard Server (Node.js + SSE)
// Ollama Connector ☠️ v1.0.9
// ===============================================================

const http = require("http");
const fs   = require("fs");
const path = require("path");
const continueData = require("./continue_data.js");

const TOOL_DIR    = process.env.HOME + "/.ollama_connector";
const LOG_FILE    = TOOL_DIR + "/logs/connector.log";
const METRICS_FILE = TOOL_DIR + "/data/metrics.json";
const PORT        = process.env.PORT || 3000;

let clients = [];

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlDashboard());

  } else if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "Access-Control-Allow-Origin": "*",
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
        <h1 class="text-lg font-bold tracking-widest text-pink-400 uppercase">Mr.0x1nj3ct04 ☠️ ☠️</h1>
        <p class="text-xs text-slate-500 tracking-wide">Ollama Connector v1.0.9 &nbsp;|&nbsp; Mr. 1nj3ct04 &nbsp;|&nbsp; realtime dev_data</p>
      </div>
    </div>
    <div class="flex items-center gap-3 text-xs">
      <button id="theme-toggle" title="Toggle theme" class="card px-2 py-1.5 hover:border-cyan-400 transition"><i data-lucide="moon" class="w-4 h-4"></i></button>
      <span id="dot" class="w-2 h-2 rounded-full bg-emerald-400 pulse"></span>
      <span id="conn" class="text-slate-400">connecting…</span>
    </div>
  </header>

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

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
