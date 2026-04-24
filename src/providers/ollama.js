// src/providers/ollama.js
// Provider for local Ollama models — no API key needed

export const meta = {
  name: "ollama",
  label: "Ollama (Local)",
  defaultModel: "llama3",
  models: [], // dynamically populated at runtime
  envKeys: [], // no keys required
};

export async function chat({ model, systemPrompt, messages, host }) {
  const base = host || process.env.OLLAMA_HOST || "http://localhost:11434";

  // Convert to Ollama chat format
  const ollamaMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || meta.defaultModel,
      messages: ollamaMessages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.message?.content || data.response || JSON.stringify(data);
}

// Helper: list available models on this Ollama instance
export async function listModels(host) {
  const base = host || process.env.OLLAMA_HOST || "http://localhost:11434";
  try {
    const res = await fetch(`${base}/api/tags`);
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}
