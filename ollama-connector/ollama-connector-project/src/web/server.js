// ===============================================================
// web/server.js – Web Dashboard Server (Node.js + SSE)
// Ollama Connector ☠️ v1.0.9
// ===============================================================

const http = require("http");
const fs   = require("fs");
const path = require("path");

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

  } else if (req.url === "/metrics.json") {
    try {
      const data = fs.readFileSync(METRICS_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
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
    const html = `
      <div class="metric"><div class="label">ITERATIONS</div><div class="value">${last.iteration || 0}</div></div>
      <div class="metric"><div class="label">TOKENS</div><div class="value">${totalTokens.toLocaleString()}</div></div>
      <div class="metric"><div class="label">COST (USD)</div><div class="value">$${(totalTokens * 0.002 / 1000000).toFixed(5)}</div></div>
      <div class="metric"><div class="label">RAM</div><div class="value">${Number(last.ram_percent || 0).toFixed(1)}%</div></div>
      <div class="metric"><div class="label">CPU LOAD</div><div class="value">${Number(last.cpu_load || 0).toFixed(2)}</div></div>
      <div class="metric"><div class="label">LATENCY</div><div class="value">${last.latency_ms || 0}ms</div></div>
    `;
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

function htmlDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ollama Connector Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:      #090d14;
      --surface: #0d1520;
      --border:  #1a2a3a;
      --cyan:    #00e5ff;
      --green:   #00ff88;
      --yellow:  #ffd600;
      --red:     #ff3d3d;
      --pink:    #ff66cc;
      --blue:    #4fc3f7;
      --dim:     #4a6070;
    }
    body { background: var(--bg); color: var(--cyan); font-family: "Courier New", Courier, monospace; min-height: 100vh; padding: 24px; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
    header h1 { color: var(--pink); font-size: 1.4rem; letter-spacing: 4px; text-transform: uppercase; }
    header p  { color: var(--dim); font-size: 0.75rem; margin-top: 4px; letter-spacing: 2px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 28px; }
    .metric { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 16px; }
    .label { color: var(--blue); font-size: 0.65rem; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
    .value { color: var(--green); font-size: 1.8rem; font-weight: bold; }
    .log-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .log-header h2 { color: var(--blue); font-size: 0.85rem; letter-spacing: 2px; text-transform: uppercase; }
    .log-container { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; height: 420px; overflow-y: auto; padding: 12px; }
    .log-line { padding: 3px 0; border-bottom: 1px solid #0d1520; font-size: 0.8rem; white-space: pre-wrap; }
    .info    { color: var(--blue); }
    .success { color: var(--green); }
    .warn    { color: var(--yellow); }
    .error   { color: var(--red); }
    .step    { color: var(--pink); }
    .check   { color: #aa88ff; }
  </style>
</head>
<body>
  <header>
    <h1>Ollama Connector &mdash; Dashboard</h1>
    <p>Author: Mr. 1nj3ct04 ☠️ &nbsp;|&nbsp; v1.0.9 &nbsp;|&nbsp; Write Yourselfer, Injector</p>
  </header>
  <div class="grid" id="metrics">
    <div class="metric"><div class="label">Loading...</div><div class="value">—</div></div>
  </div>
  <div class="log-header">
    <h2>Live Logs</h2>
    <span style="color:var(--dim);font-size:0.7rem;">SSE connected</span>
  </div>
  <div class="log-container" id="log"></div>
  <script>
    const es = new EventSource("/events");
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "metric") {
        document.getElementById("metrics").innerHTML = d.html;
      }
      if (d.type === "log") {
        const div = document.createElement("div");
        div.className = "log-line " + d.cls;
        div.textContent = d.line;
        const c = document.getElementById("log");
        c.appendChild(div);
        c.scrollTop = c.scrollHeight;
        // Keep only last 500 lines
        while (c.children.length > 500) c.removeChild(c.firstChild);
      }
    };
  </script>
</body>
</html>`;
}

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
