# 🔄 Agent Bridge

> Let any two AI models collaborate — without copy-pasting.

Agent Bridge is a CLI + Telegram bot that relays messages between two AI agents from **any provider**, automatically. MiniMax talks to Claude. GPT-4o talks to Gemini. Ollama talks to anything.

Watch them work together in a Telegram group. Intervene any time by typing. Monitor every session live in a web UI.

---

## Features

- **5 providers** — Anthropic, OpenAI, MiniMax, Gemini, Ollama (any pair)
- **Telegram mode** — two bots in a group chat, you watch and intervene
- **Live web UI** — real-time session monitor at `localhost:3737`
- **Human intervention** — type in the group to inject context mid-session
- **Auto-retry** — retries failed API calls up to 2x before stopping
- **Session logs** — every conversation saved to `sessions/` as JSON automatically
- **Stop conditions** — agents signal completion with `DONE`, or use `/stop`
- **5 role presets** — Builder/Reviewer, Debater, Planner/Critic, Teacher/Student, CTO/Engineer
- **CLI mode** — run without Telegram for pure API relay

---

## Providers

| Provider | Models | Auth |
|----------|--------|------|
| `anthropic` | claude-opus-4-5, claude-sonnet-4-5 | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o, gpt-4-turbo | `OPENAI_API_KEY` |
| `minimax` | MiniMax-Text-01, abab6.5s-chat | `MINIMAX_API_KEY` + `MINIMAX_GROUP_ID` |
| `gemini` | gemini-1.5-pro, gemini-1.5-flash | `GEMINI_API_KEY` |
| `ollama` | any local model | none |

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/agent-bridge
cd agent-bridge
npm install
cp .env.example .env
# Fill in your API keys
```

### CLI mode

```bash
node cli.js run \
  --task "Design a caching strategy for a high-traffic REST API" \
  --agent-a minimax \
  --agent-b anthropic \
  --preset builder-reviewer \
  --turns 6
```

### Telegram mode

1. Create two bots via @BotFather, get their tokens
2. Create a Telegram group, add both bots and yourself
3. Fill in `.env`:
```
BOT_A_TOKEN=...
BOT_B_TOKEN=...
TELEGRAM_PROVIDER_A=minimax
TELEGRAM_PROVIDER_B=anthropic
```
4. Start the bridge: `node telegram.js`
5. Send `/start Design a REST API for a real-time chat app` in the group

### Web UI monitor

```bash
node webui.js
# Opens http://localhost:3737 — updates live via WebSocket
```

---

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start <task>` | Begin a relay session |
| `/stop` | Stop the current session |
| `/status` | Show current state |
| `/presets` | List role presets |
| `/history` | Last session summary |
| `/help` | All commands |

Type any non-command message during a session to intervene — both agents receive it.

---

## Presets

| Key | Pair | Best for |
|-----|------|---------|
| `builder-reviewer` | Builder / Reviewer | Code, design, writing |
| `debater` | Advocate / Skeptic | Exploring both sides |
| `planner-critic` | Planner / Critic | Strategy, roadmaps |
| `teacher-student` | Teacher / Student | Learning |
| `cto-engineer` | CTO / Engineer | Technical proposals |

---

## Adding a Provider

Create `src/providers/yourprovider.js` exporting `meta` and `chat()`, then register in `src/providers/index.js`. See existing providers for the pattern.

---

## License

MIT
