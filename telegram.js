#!/usr/bin/env node
// telegram.js — Two-bot Telegram transport for Agent Bridge
//
// Setup:
//   1. Create two bots via @BotFather → get BOT_A_TOKEN and BOT_B_TOKEN
//   2. Create a Telegram group and add both bots + yourself
//   3. Set TELEGRAM_GROUP_ID in .env (send /start to the group first, bridge will print it)
//   4. Set your provider credentials in .env
//   5. Run: node telegram.js

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { runBridge } from "./src/bridge.js";
import { getPreset, listPresets } from "./src/presets.js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

dotenv.config();

// ── Config ─────────────────────────────────────────────────────────────────

const BOT_A_TOKEN    = process.env.BOT_A_TOKEN;
const BOT_B_TOKEN    = process.env.BOT_B_TOKEN;
const GROUP_ID       = process.env.TELEGRAM_GROUP_ID;
const PROVIDER_A     = process.env.TELEGRAM_PROVIDER_A || "minimax";
const PROVIDER_B     = process.env.TELEGRAM_PROVIDER_B || "anthropic";
const PRESET_NAME    = process.env.TELEGRAM_PRESET     || "builder-reviewer";
const MAX_TURNS      = parseInt(process.env.TELEGRAM_MAX_TURNS || "8", 10);

if (!BOT_A_TOKEN || !BOT_B_TOKEN) {
  console.error("❌  Missing BOT_A_TOKEN or BOT_B_TOKEN in .env");
  process.exit(1);
}

// ── Bot instances ───────────────────────────────────────────────────────────

const botA = new TelegramBot(BOT_A_TOKEN, { polling: true });
const botB = new TelegramBot(BOT_B_TOKEN, { polling: true });

// ── State ───────────────────────────────────────────────────────────────────

let running        = false;
let abortCtrl      = null;
let humanQueue     = [];   // messages typed by user during a session
let detectedGroupId = GROUP_ID || null;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function sendAsA(text) {
  if (!detectedGroupId) return;
  const clean = stripStopTokens(text);
  if (!clean.trim()) return;
  // Telegram messages max 4096 chars — chunk if needed
  for (const chunk of chunkText(clean)) {
    await botA.sendMessage(detectedGroupId, chunk, { parse_mode: "Markdown" });
  }
}

async function sendAsB(text) {
  if (!detectedGroupId) return;
  const clean = stripStopTokens(text);
  if (!clean.trim()) return;
  for (const chunk of chunkText(clean)) {
    await botB.sendMessage(detectedGroupId, chunk, { parse_mode: "Markdown" });
  }
}

async function sendSystem(text) {
  if (!detectedGroupId) return;
  // System messages sent by Bot A with an italic prefix
  await botA.sendMessage(detectedGroupId, `_${text}_`, { parse_mode: "Markdown" });
}

async function setTypingA() {
  if (!detectedGroupId) return;
  await botA.sendChatAction(detectedGroupId, "typing").catch(() => {});
}

async function setTypingB() {
  if (!detectedGroupId) return;
  await botB.sendChatAction(detectedGroupId, "typing").catch(() => {});
}

function stripStopTokens(text) {
  return text
    .split("\n")
    .filter(l => !["DONE", "FINAL", "HUMAN_NEEDED", "END_SESSION"].includes(l.trim().toUpperCase()))
    .join("\n")
    .trim();
}

function chunkText(text, size = 4000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function formatSessionSummary(result) {
  return [
    `✅ *Session complete*`,
    `Reason: ${result.reason}`,
    `Turns: ${result.turns}`,
    `Session ID: \`${result.sessionId}\``,
    `Log saved to: \`sessions/${result.sessionId}.json\``,
  ].join("\n");
}

// ── Message routing ──────────────────────────────────────────────────────────
// Detect group ID automatically on first message

function handleGroupDetection(msg) {
  if (msg.chat?.type === "group" || msg.chat?.type === "supergroup") {
    if (!detectedGroupId) {
      detectedGroupId = String(msg.chat.id);
      console.log(`✅ Auto-detected group ID: ${detectedGroupId}`);
      console.log(`   Add TELEGRAM_GROUP_ID=${detectedGroupId} to your .env to skip this step.`);
    }
  }
}

// Track human messages typed during a session
function isHumanMessage(msg) {
  if (!msg.from) return false;
  // Ignore messages from our own bots (bot A and B have their own from.is_bot = true)
  return !msg.from.is_bot;
}

botA.on("message", (msg) => {
  handleGroupDetection(msg);
  if (!running) return;
  if (isHumanMessage(msg) && !msg.text?.startsWith("/")) {
    humanQueue.push(msg.text);
  }
});

botB.on("message", (msg) => {
  handleGroupDetection(msg);
});

// ── Commands (handled by Bot A) ───────────────────────────────────────────

// /start <task>  — begin a relay session
botA.onText(/\/start (.+)/, async (msg, match) => {
  handleGroupDetection(msg);
  if (!detectedGroupId) detectedGroupId = String(msg.chat.id);

  if (running) {
    await sendSystem("⚠️ A session is already running. Use /stop to end it first.");
    return;
  }

  const task = match[1].trim();
  const preset = getPreset(PRESET_NAME);

  running = true;
  humanQueue = [];
  abortCtrl = new AbortController();

  await sendSystem(
    `🚀 *Bridge started*\n` +
    `Task: _${task}_\n` +
    `${preset.agentA.name} (${PROVIDER_A}) ↔ ${preset.agentB.name} (${PROVIDER_B})\n` +
    `Max turns: ${MAX_TURNS} · Preset: ${PRESET_NAME}\n\n` +
    `Type anything in this group to intervene. Use /stop to end early.`
  );

  const agentA = {
    provider: PROVIDER_A,
    name: preset.agentA.name,
    systemPrompt: preset.agentA.systemPrompt,
    model: process.env.MODEL_A || undefined,
    config: {},
  };

  const agentB = {
    provider: PROVIDER_B,
    name: preset.agentB.name,
    systemPrompt: preset.agentB.systemPrompt,
    model: process.env.MODEL_B || undefined,
    config: {},
  };

  try {
    await runBridge({
      agentA,
      agentB,
      task,
      maxTurns: MAX_TURNS,
      signal: abortCtrl.signal,

      onTyping: async ({ agent, name }) => {
        if (agent === "A") await setTypingA();
        else await setTypingB();
      },

      onMessage: async ({ agent, name, text }) => {
        if (agent === "HUMAN") {
          await sendSystem(`👤 *Human intervened:* ${text}`);
        } else if (agent === "A") {
          await sendAsA(text);
        } else {
          await sendAsB(text);
        }
      },

      onHumanInput: async () => {
        if (humanQueue.length > 0) return humanQueue.shift();
        return null;
      },

      onDone: async (result) => {
        running = false;
        await sendSystem(formatSessionSummary(result));
      },
    });
  } catch (err) {
    running = false;
    await sendSystem(`❌ Bridge error: ${err.message}`);
  }
});

// /stop — abort current session
botA.onText(/\/stop/, async (msg) => {
  handleGroupDetection(msg);
  if (!running) {
    await sendSystem("No session is currently running.");
    return;
  }
  abortCtrl?.abort();
  running = false;
  await sendSystem("🛑 Session stopped by user.");
});

// /status — show current state
botA.onText(/\/status/, async (msg) => {
  handleGroupDetection(msg);
  const status = running
    ? `🟢 *Running*\nProviders: ${PROVIDER_A} ↔ ${PROVIDER_B}\nPreset: ${PRESET_NAME}`
    : `⚪ *Idle* — use /start <task> to begin`;
  await sendSystem(status);
});

// /presets — list available presets
botA.onText(/\/presets/, async (msg) => {
  handleGroupDetection(msg);
  const list = listPresets().map(p => `• \`${p.key}\` — ${p.label}`).join("\n");
  await sendSystem(`*Available presets:*\n${list}`);
});

// /history — replay last session summary
botA.onText(/\/history/, async (msg) => {
  handleGroupDetection(msg);
  const { readdirSync, readFileSync } = await import("fs");
  const dir = resolve("sessions");
  if (!existsSync(dir)) { await sendSystem("No sessions saved yet."); return; }

  const files = readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();

  if (!files.length) { await sendSystem("No sessions saved yet."); return; }

  const latest = JSON.parse(readFileSync(resolve(dir, files[0]), "utf8"));
  const summary = [
    `📋 *Last session:* \`${latest.id}\``,
    `Task: _${latest.task}_`,
    `Started: ${latest.startedAt}`,
    `Ended: ${latest.endedAt || "incomplete"}`,
    `Turns: ${latest.totalTurns || 0}`,
    `Stop reason: ${latest.stopReason || "unknown"}`,
    `Messages: ${latest.messages?.length || 0}`,
  ].join("\n");
  await sendSystem(summary);
});

// /help
botA.onText(/\/help/, async (msg) => {
  handleGroupDetection(msg);
  await sendSystem(
    `*Agent Bridge Commands*\n\n` +
    `/start <task> — Begin a relay session\n` +
    `/stop — Stop the current session\n` +
    `/status — Show current state\n` +
    `/presets — List agent role presets\n` +
    `/history — Show last session summary\n` +
    `/help — Show this message\n\n` +
    `💡 Type anything (not a command) during a session to intervene.`
  );
});

// ── Startup ──────────────────────────────────────────────────────────────────

console.log("🤖 Agent Bridge — Telegram mode");
console.log(`   Provider A : ${PROVIDER_A}`);
console.log(`   Provider B : ${PROVIDER_B}`);
console.log(`   Preset     : ${PRESET_NAME}`);
console.log(`   Max turns  : ${MAX_TURNS}`);

if (!detectedGroupId) {
  console.log("\n⚠️  No TELEGRAM_GROUP_ID set.");
  console.log("   Add both bots to a Telegram group and send any message.");
  console.log("   The group ID will be auto-detected and printed here.\n");
} else {
  console.log(`   Group ID   : ${detectedGroupId}`);
  console.log("\n✅ Ready — send /start <task> in your Telegram group.\n");
}

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  botA.stopPolling();
  botB.stopPolling();
  process.exit(0);
});
