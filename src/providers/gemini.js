// src/providers/gemini.js
// Provider for Google Gemini models

export const meta = {
  name: "gemini",
  label: "Gemini (Google)",
  defaultModel: "gemini-1.5-flash",
  models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  envKeys: ["GEMINI_API_KEY"],
};

export async function chat({ model, systemPrompt, messages, apiKey }) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");

  const selectedModel = model || meta.defaultModel;

  // Convert to Gemini format
  const geminiMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);
}
