#!/usr/bin/env node
// Explicit env before any imports
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1);
}

import { runBridge } from './src/bridge.js';
import { getPreset } from './src/presets.js';

const task = 'Explain why an auto repair shop website should be mobile-first in one short paragraph';
const preset = getPreset('builder-reviewer');

const agentA = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  name: preset.agentA.name,
  systemPrompt: preset.agentA.systemPrompt,
};

const agentB = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  name: preset.agentB.name,
  systemPrompt: preset.agentB.systemPrompt,
};

console.log(`\nStarting bridge: ${agentA.name} ↔ ${agentB.name}`);
console.log(`OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL}`);
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY?.slice(0, 15)}...\n`);

runBridge({
  agentA,
  agentB,
  task,
  maxTurns: 4,
  onMessage({ agent, name, text, turn }) {
    const done = text.toUpperCase().includes('DONE') || text.toUpperCase().includes('FINAL');
    console.log(`[${name}] turn ${turn}${done ? ' ✓' : ''}:`);
    console.log('  ' + text.replace(/DONE|FINAL/gi, '').trim().split('\n').join('\n  '));
    console.log();
  },
  onDone({ reason, turns }) {
    console.log(`Done — ${reason} (${turns} turns)`);
    process.exit(0);
  },
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
