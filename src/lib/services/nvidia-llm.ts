const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

/** Default: strong instruct model on NVIDIA integrate API. */
export const DEFAULT_NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";

export function getNvidiaConfig() {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not set in .env");
  }
  return {
    apiKey,
    model: process.env.NVIDIA_MODEL?.trim() || DEFAULT_NVIDIA_MODEL,
  };
}

export async function nvidiaChatJson(
  system: string,
  user: string,
  options?: { maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<string> {
  const { apiKey, model } = getNvidiaConfig();
  const maxTokens = options?.maxTokens ?? 1200;
  const temperature = options?.temperature ?? 0.25;
  const timeoutMs = options?.timeoutMs ?? 90_000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`NVIDIA API timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`NVIDIA API ${res.status}: ${raw.slice(0, 400)}`);
  }

  let parsed: { choices?: { message?: { content?: string } }[] };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("NVIDIA API returned non-JSON response");
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("NVIDIA API returned empty completion");
  }
  return content;
}
