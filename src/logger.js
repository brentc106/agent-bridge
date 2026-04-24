// src/logger.js
// Saves session logs to ./sessions/ as JSON

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const SESSIONS_DIR = resolve("sessions");

function ensureDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function appendSessionLog(sessionId, data) {
  try {
    ensureDir();
    const path = resolve(SESSIONS_DIR, `${sessionId}.json`);
    writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (err) {
    // Non-fatal — don't crash the bridge over a logging error
    console.error("[logger] Failed to write session log:", err.message);
  }
}

export function getSessionPath(sessionId) {
  return resolve(SESSIONS_DIR, `${sessionId}.json`);
}

export function listSessions() {
  ensureDir();
  return readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""))
    .sort()
    .reverse();
}
