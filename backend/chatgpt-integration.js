// ChatGPT Integration for Knowledge Base
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || "";

export async function queryOpenAI(message, history = []) {
  if (!OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "OpenAI API key not configured",
      answer: null,
    };
  }

  try {
    const messages = [
      ...history.map(h => ({
        role: h.role,
        content: h.content,
      })),
      {
        role: "user",
        content: message,
      },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
      return {
        ok: false,
        reason: errorMsg,
        answer: null,
      };
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content || null;

    return {
      ok: true,
      reason: "Success",
      answer,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "Unknown error",
      answer: null,
    };
  }
}
