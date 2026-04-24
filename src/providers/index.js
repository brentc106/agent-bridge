// src/providers/index.js
// Central registry — add new providers here

import * as anthropic from "./anthropic.js";
import * as openai from "./openai.js";
import * as minimax from "./minimax.js";
import * as ollama from "./ollama.js";
import * as gemini from "./gemini.js";

export const providers = {
  anthropic,
  openai,
  minimax,
  ollama,
  gemini,
};

export function getProvider(name) {
  const p = providers[name.toLowerCase()];
  if (!p) {
    const available = Object.keys(providers).join(", ");
    throw new Error(`Unknown provider "${name}". Available: ${available}`);
  }
  return p;
}

export function listProviders() {
  return Object.values(providers).map((p) => ({
    name: p.meta.name,
    label: p.meta.label,
    defaultModel: p.meta.defaultModel,
    envKeys: p.meta.envKeys,
  }));
}
