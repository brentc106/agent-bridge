// src/providers/anthropic.js
// Provider for Anthropic Claude models

export const meta = {
  name: "anthropic",
  label: "Claude (Anthropic)",
  defaultModel: "claude-opus-4-5",
  models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  envKeys: ["ANTHROPIC_API_KEY"],
};

export async function chat({ model, systemPrompt, messages, apiKey }) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || meta.defaultModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.content[0].text;
}
