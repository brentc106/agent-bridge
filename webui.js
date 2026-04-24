#!/usr/bin/env node
// webui.js — Live session monitor with WebSocket streaming
// Run alongside telegram.js or cli.js to watch sessions in real time
// Usage: node webui.js  →  opens http://localhost:3737

import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { readdirSync, readFileSync, existsSync, watchFile } from "fs";
import { resolve } from "path";
import open from "open";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.WEBUI_PORT || 3737;
const SESSIONS_DIR = resolve("sessions");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// ── WebSocket — push session updates to browser ──────────────────────────

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));

  // Send current session list on connect
  ws.send(JSON.stringify({ type: "sessions", data: loadSessions() }));
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

// Watch sessions dir for new/updated files
function watchSessions() {
  if (!existsSync(SESSIONS_DIR)) return;
  readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".json"))
    .forEach(file => {
      const path = resolve(SESSIONS_DIR, file);
      watchFile(path, { interval: 500 }, () => {
        try {
          const data = JSON.parse(readFileSync(path, "utf8"));
          broadcast({ type: "session_update", data });
        } catch {}
      });
    });
}

// Poll for new session files every 2s
setInterval(() => {
  if (!existsSync(SESSIONS_DIR)) return;
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
  broadcast({ type: "sessions", data: loadSessions() });
  watchSessions();
}, 2000);

function loadSessions() {
  if (!existsSync(SESSIONS_DIR)) return [];
  return readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort().reverse()
    .slice(0, 20)
    .map(f => {
      try { return JSON.parse(readFileSync(resolve(SESSIONS_DIR, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

// ── REST API ──────────────────────────────────────────────────────────────

app.get("/api/sessions", (req, res) => res.json(loadSessions()));

app.get("/api/sessions/:id", (req, res) => {
  const path = resolve(SESSIONS_DIR, `${req.params.id}.json`);
  if (!existsSync(path)) return res.status(404).json({ error: "Not found" });
  res.json(JSON.parse(readFileSync(path, "utf8")));
});

// ── Web UI ────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(getHTML());
});

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Bridge — Monitor</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

  :root {
    --bg: #090909; --surface: #111; --border: #1e1e1e;
    --a: #00ff88; --b: #ff6b35; --human: #a78bfa;
    --text: #d4d4d4; --muted: #555; --dim: #333;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'IBM Plex Mono', monospace; height: 100vh; display: flex; flex-direction: column; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #333; }

  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 24px; border-bottom: 1px solid var(--border);
    background: #0d0d0d;
  }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo-icon { width: 24px; height: 24px; border: 1px solid var(--a); border-radius: 3px; display: flex; align-items: center; justify-content: center; color: var(--a); font-size: 12px; }
  .logo-text { font-size: 12px; font-weight: 600; letter-spacing: .12em; color: #fff; }
  .logo-sub { font-size: 9px; color: var(--muted); letter-spacing: .2em; }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--a); box-shadow: 0 0 8px var(--a); animation: pulse 2s ease-in-out infinite; }

  main { display: flex; flex: 1; overflow: hidden; }

  /* Sidebar */
  aside { width: 260px; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .sidebar-head { padding: 12px 16px; font-size: 9px; color: var(--muted); letter-spacing: .2em; border-bottom: 1px solid var(--border); }
  .session-list { overflow-y: auto; flex: 1; }
  .session-item {
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background .15s;
  }
  .session-item:hover { background: #151515; }
  .session-item.active { background: #1a1a1a; border-left: 2px solid var(--a); }
  .session-id { font-size: 9px; color: var(--a); letter-spacing: .08em; margin-bottom: 4px; }
  .session-task { font-size: 11px; color: var(--text); font-family: 'IBM Plex Sans', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
  .session-meta { font-size: 9px; color: var(--muted); display: flex; gap: 8px; }
  .badge { padding: 1px 5px; border-radius: 2px; font-size: 8px; letter-spacing: .08em; }
  .badge-done { color: var(--a); border: 1px solid var(--a)33; }
  .badge-running { color: #fbbf24; border: 1px solid #fbbf2433; animation: pulse 1.5s infinite; }
  .badge-stopped { color: var(--muted); border: 1px solid var(--dim); }
  .empty-state { padding: 32px 16px; text-align: center; color: var(--muted); font-size: 11px; line-height: 1.8; }

  /* Main panel */
  .panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .panel-head { padding: 14px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .panel-task { font-size: 13px; color: #fff; font-family: 'IBM Plex Sans', sans-serif; font-weight: 500; }
  .panel-agents { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .agent-chip { font-size: 9px; letter-spacing: .1em; padding: 2px 8px; border-radius: 2px; }
  .agent-a { color: var(--a); border: 1px solid var(--a)44; background: var(--a)11; }
  .agent-b { color: var(--b); border: 1px solid var(--b)44; background: var(--b)11; }
  .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .msg { display: flex; gap: 10px; animation: slideIn .25s ease-out; }
  .msg.agent-b-msg { flex-direction: row-reverse; }
  .msg-avatar { width: 32px; height: 32px; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; margin-top: 2px; }
  .msg-body { max-width: 78%; display: flex; flex-direction: column; gap: 4px; }
  .msg.agent-b-msg .msg-body { align-items: flex-end; }
  .msg-label { font-size: 9px; letter-spacing: .1em; display: flex; gap: 6px; align-items: center; }
  .msg-bubble { padding: 10px 13px; border-radius: 2px 8px 8px 8px; background: var(--surface); font-size: 12px; font-family: 'IBM Plex Sans', sans-serif; line-height: 1.65; color: var(--text); white-space: pre-wrap; }
  .msg.agent-b-msg .msg-bubble { border-radius: 8px 2px 8px 8px; }
  .msg-human .msg-bubble { border: 1px solid var(--human)44; background: var(--human)0a; }
  .no-session { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--dim); }
  .no-session-icon { font-size: 36px; }

  /* Stats bar */
  .stats { padding: 8px 20px; border-top: 1px solid var(--border); display: flex; gap: 20px; align-items: center; }
  .stat { font-size: 9px; color: var(--muted); letter-spacing: .1em; }
  .stat span { color: var(--text); }

  @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
  @keyframes slideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
</style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-icon">⟳</div>
    <div>
      <div class="logo-text">AGENT BRIDGE</div>
      <div class="logo-sub">LIVE MONITOR</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:8px">
    <div class="live-dot"></div>
    <span style="font-size:9px;color:var(--muted);letter-spacing:.15em">LIVE</span>
  </div>
</header>

<main>
  <aside>
    <div class="sidebar-head">SESSIONS</div>
    <div class="session-list" id="sessionList">
      <div class="empty-state">No sessions yet.<br>Run a bridge to see logs here.</div>
    </div>
  </aside>

  <div class="panel">
    <div id="panelHead" class="panel-head" style="display:none">
      <div class="panel-task" id="panelTask"></div>
      <div class="panel-agents" id="panelAgents"></div>
    </div>
    <div id="noSession" class="no-session">
      <div class="no-session-icon">⟳</div>
      <div style="font-size:10px;letter-spacing:.15em">SELECT A SESSION</div>
    </div>
    <div class="messages" id="messages" style="display:none"></div>
    <div class="stats" id="statsBar" style="display:none">
      <div class="stat">TURNS <span id="statTurns">—</span></div>
      <div class="stat">STATUS <span id="statStatus">—</span></div>
      <div class="stat">STARTED <span id="statStarted">—</span></div>
    </div>
  </div>
</main>

<script>
let sessions = [];
let activeId = null;

const ws = new WebSocket(\`ws://\${location.host}\`);

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "sessions") {
    sessions = msg.data;
    renderList();
    if (activeId) {
      const updated = sessions.find(s => s.id === activeId);
      if (updated) renderSession(updated);
    }
  }
  if (msg.type === "session_update") {
    const idx = sessions.findIndex(s => s.id === msg.data.id);
    if (idx >= 0) sessions[idx] = msg.data;
    else sessions.unshift(msg.data);
    renderList();
    if (activeId === msg.data.id) renderSession(msg.data);
  }
};

function renderList() {
  const el = document.getElementById("sessionList");
  if (!sessions.length) {
    el.innerHTML = '<div class="empty-state">No sessions yet.<br>Run a bridge to see logs here.</div>';
    return;
  }
  el.innerHTML = sessions.map(s => {
    const isRunning = s.endedAt == null;
    const badge = isRunning
      ? '<span class="badge badge-running">LIVE</span>'
      : (s.stopReason?.includes("complete") || s.stopReason?.includes("signalled"))
        ? '<span class="badge badge-done">DONE</span>'
        : '<span class="badge badge-stopped">ENDED</span>';
    return \`
      <div class="session-item \${s.id === activeId ? 'active' : ''}" onclick="selectSession('\${s.id}')">
        <div class="session-id">\${s.id.slice(-16)}</div>
        <div class="session-task">\${s.task || '—'}</div>
        <div class="session-meta">\${badge}<span>\${s.totalTurns || 0} turns</span></div>
      </div>\`;
  }).join("");
}

function selectSession(id) {
  activeId = id;
  const s = sessions.find(s => s.id === id);
  if (s) renderSession(s);
  renderList();
}

function renderSession(s) {
  document.getElementById("noSession").style.display = "none";
  document.getElementById("panelHead").style.display = "flex";
  document.getElementById("messages").style.display = "flex";
  document.getElementById("statsBar").style.display = "flex";

  document.getElementById("panelTask").textContent = s.task || "—";
  document.getElementById("panelAgents").innerHTML =
    \`<div class="agent-chip agent-a">\${s.agentA?.name || 'A'} · \${s.agentA?.provider || ''}</div>
     <span style="color:var(--dim)">↔</span>
     <div class="agent-chip agent-b">\${s.agentB?.name || 'B'} · \${s.agentB?.provider || ''}</div>\`;

  document.getElementById("statTurns").textContent = s.totalTurns || s.messages?.length || "—";
  document.getElementById("statStatus").textContent = s.endedAt ? (s.stopReason || "ended") : "running";
  document.getElementById("statStarted").textContent = s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : "—";

  const container = document.getElementById("messages");
  container.innerHTML = (s.messages || []).map(m => {
    const isA = m.agent === "A";
    const isHuman = m.agent === "HUMAN";
    const color = isHuman ? "var(--human)" : isA ? "var(--a)" : "var(--b)";
    const label = m.name || m.agent;
    const providerLabel = m.provider ? \` · \${m.provider}\` : "";
    const clean = m.text.replace(/\\nDONE\\s*$/, "").replace(/^DONE\\s*\\n?/, "").trim();
    return \`
      <div class="msg \${isA ? '' : isHuman ? 'msg-human' : 'agent-b-msg'}">
        <div class="msg-avatar" style="background:\${color}18;border:1px solid \${color}44">\${isHuman ? '👤' : isA ? '⚙' : '🔍'}</div>
        <div class="msg-body">
          <div class="msg-label" style="color:\${color}">\${label}<span style="color:var(--muted)">\${providerLabel} · turn \${m.turn}</span></div>
          <div class="msg-bubble" style="border:1px solid \${color}22">\${escapeHtml(clean)}</div>
        </div>
      </div>\`;
  }).join("");

  container.scrollTop = container.scrollHeight;
}

function escapeHtml(t) {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
</script>
</body>
</html>`;
}

// ── Start ─────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🖥️  Agent Bridge Web UI`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Live session monitor — updates automatically\n`);
  open(`http://localhost:${PORT}`).catch(() => {});
});
