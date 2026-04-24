// src/bridge.js
// Core relay loop — provider-agnostic agent collaboration engine

import { getProvider } from "./providers/index.js";
import { appendSessionLog } from "./logger.js";

const DEFAULT_STOP_TOKENS = ["DONE", "FINAL", "HUMAN_NEEDED", "END_SESSION"];
const RETRY_LIMIT = 2;
const RETRY_DELAY_MS = 2000;

async function withRetry(fn, retries = RETRY_LIMIT, delayMs = RETRY_DELAY_MS) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Run a relay loop between two AI agents.
 *
 * @param {object}   opts.agentA        { provider, model, systemPrompt, name, config }
 * @param {object}   opts.agentB        { provider, model, systemPrompt, name, config }
 * @param {string}   opts.task          Initial task to kick off the conversation
 * @param {number}   opts.maxTurns      Max total messages (default 8)
 * @param {string[]} opts.stopTokens    Tokens that end the loop
 * @param {function} opts.onMessage     Called after each message: ({ agent, name, text, turn })
 * @param {function} opts.onDone        Called when loop ends: ({ reason, turns, messages, sessionId })
 * @param {function} opts.onTyping      Called when an agent starts generating: ({ agent, name })
 * @param {function} opts.onHumanInput  Async fn — returns string if human intervened, else null
 * @param {object}   opts.signal        AbortSignal to cancel mid-run
 * @param {string}   opts.sessionId     Optional ID for log file naming
 */
export async function runBridge({
  agentA,
  agentB,
  task,
  maxTurns = 8,
  stopTokens = DEFAULT_STOP_TOKENS,
  onMessage = () => {},
  onDone = () => {},
  onTyping = () => {},
  onHumanInput = async () => null,
  signal = null,
  sessionId = null,
}) {
  const providerA = getProvider(agentA.provider);
  const providerB = getProvider(agentB.provider);

  const historyA = [];
  const historyB = [];
  const log = [];
  let turn = 0;
  let stopReason = null;
  const sid = sessionId || `session-${Date.now()}`;

  const sessionMeta = {
    id: sid,
    task,
    agentA: { name: agentA.name, provider: agentA.provider, model: agentA.model },
    agentB: { name: agentB.name, provider: agentB.provider, model: agentB.model },
    startedAt: new Date().toISOString(),
    messages: log,
  };

  const isAborted = () => signal?.aborted === true;
  const hasStopToken = (text) =>
    stopTokens.some(t => text.toUpperCase().includes(t.toUpperCase()));

  let lastMessage = `Begin working on this task:\n\n${task}`;

  while (turn < maxTurns && !stopReason && !isAborted()) {

    // ── Human interruption check ─────────────────────────────────
    const humanMsg = await onHumanInput();
    if (humanMsg) {
      const entry = { agent: "HUMAN", name: "Human", text: humanMsg, turn };
      log.push(entry);
      onMessage(entry);
      historyA.push({ role: "user", content: `[Human]: ${humanMsg}` });
      historyB.push({ role: "user", content: `[Human]: ${humanMsg}` });
      lastMessage = `[Human intervened]: ${humanMsg}\n\nPlease continue with this in mind.`;
    }

    // ── Agent A turn ─────────────────────────────────────────────
    onTyping({ agent: "A", name: agentA.name });
    historyA.push({ role: "user", content: lastMessage });

    let replyA;
    try {
      replyA = await withRetry(() => providerA.chat({
        model: agentA.model,
        systemPrompt: agentA.systemPrompt,
        messages: historyA,
        ...agentA.config,
      }));
    } catch (err) {
      stopReason = `${agentA.name} failed after ${RETRY_LIMIT} retries: ${err.message}`;
      break;
    }

    historyA.push({ role: "assistant", content: replyA });
    turn++;

    const msgA = { agent: "A", name: agentA.name, provider: agentA.provider, text: replyA, turn };
    log.push(msgA);
    onMessage(msgA);
    appendSessionLog(sid, sessionMeta);

    if (hasStopToken(replyA)) { stopReason = `${agentA.name} signalled completion`; break; }
    if (isAborted()) break;

    // ── Agent B turn ─────────────────────────────────────────────
    onTyping({ agent: "B", name: agentB.name });
    historyB.push({ role: "user", content: `${agentA.name} says:\n\n${replyA}` });

    let replyB;
    try {
      replyB = await withRetry(() => providerB.chat({
        model: agentB.model,
        systemPrompt: agentB.systemPrompt,
        messages: historyB,
        ...agentB.config,
      }));
    } catch (err) {
      stopReason = `${agentB.name} failed after ${RETRY_LIMIT} retries: ${err.message}`;
      break;
    }

    historyB.push({ role: "assistant", content: replyB });
    historyA.push({ role: "user", content: `${agentB.name} says:\n\n${replyB}` });
    lastMessage = `${agentB.name} says:\n\n${replyB}`;
    turn++;

    const msgB = { agent: "B", name: agentB.name, provider: agentB.provider, text: replyB, turn };
    log.push(msgB);
    onMessage(msgB);
    appendSessionLog(sid, sessionMeta);

    if (hasStopToken(replyB)) { stopReason = `${agentB.name} signalled completion`; break; }
  }

  if (!stopReason) {
    stopReason = isAborted() ? "Manually stopped" : `Max turns (${maxTurns}) reached`;
  }

  sessionMeta.endedAt = new Date().toISOString();
  sessionMeta.stopReason = stopReason;
  sessionMeta.totalTurns = turn;
  appendSessionLog(sid, sessionMeta);

  const result = { reason: stopReason, turns: turn, messages: log, sessionId: sid };
  onDone(result);
  return result;
}
