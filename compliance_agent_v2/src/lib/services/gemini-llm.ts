const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }
  return {
    apiKey,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  };
}

export async function geminiChatJson(
  system: string,
  user: string,
  options?: { maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<string> {
  const { apiKey, model } = getGeminiConfig();
  const maxTokens = options?.maxTokens ?? 1200;
  const temperature = options?.temperature ?? 0.25;
  const timeoutMs = options?.timeoutMs ?? 90_000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: user }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gemini API timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${raw.slice(0, 400)}`);
  }

  let parsed: {
    candidates?: {
      content?: {
        parts?: { text?: string }[];
      };
      finishReason?: string;
    }[];
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("Gemini API returned non-JSON response");
  }

  const content = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!content) {
    throw new Error("Gemini API returned empty completion");
  }
  return content;
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    return fenced;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}
