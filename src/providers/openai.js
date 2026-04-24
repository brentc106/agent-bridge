// src/providers/openai.js
// Provider for OpenAI models (GPT-4o, GPT-4, etc.)

export const meta = {
  name: "openai",
  label: "GPT (OpenAI)",
  defaultModel: "gpt-4o",
  models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  envKeys: ["OPENAI_API_KEY"],
};

export async function chat({ model, systemPrompt, messages, apiKey }) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");

  // Convert Anthropic-style messages to OpenAI format
  const oaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || meta.defaultModel,
      max_tokens: 1024,
      messages: oaiMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI API error ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}
