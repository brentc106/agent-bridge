// src/providers/minimax.js
// Provider for MiniMax models — requires both API key AND GroupId

export const meta = {
  name: "minimax",
  label: "MiniMax",
  defaultModel: "MiniMax-Text-01",
  models: ["MiniMax-Text-01", "abab6.5s-chat", "abab5.5-chat"],
  envKeys: ["MINIMAX_API_KEY", "MINIMAX_GROUP_ID"],
};

export async function chat({ model, systemPrompt, messages, apiKey, groupId }) {
  const key = apiKey || process.env.MINIMAX_API_KEY;
  const gid = groupId || process.env.MINIMAX_GROUP_ID;

  if (!key) throw new Error("Missing MINIMAX_API_KEY");
  if (!gid) throw new Error("Missing MINIMAX_GROUP_ID");

  // MiniMax uses OpenAI-compatible format but with their endpoint
  const mmMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const res = await fetch(
    `https://api.minimaxi.chat/v1/text/chatcompletion_v2?GroupId=${gid}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || meta.defaultModel,
        max_tokens: 1024,
        messages: mmMessages,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`MiniMax API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();

  // MiniMax wraps the response differently
  const choice = data.choices?.[0];
  return choice?.message?.content || choice?.text || JSON.stringify(data);
}
