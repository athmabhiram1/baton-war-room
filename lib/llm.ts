// T4: LLM generation via Vercel AI SDK (Gemini Flash-Lite default, G1 caps).
// Env keys are read from process.env at call time — never printed, never committed.
// Docs:
// - generateText + google provider: https://github.com/vercel/ai/blob/main/content/providers/01-ai-sdk-providers/15-google.mdx (Context7 /vercel/ai)
// - generation settings (maxOutputTokens/temperature/maxRetries/timeout): https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/25-settings.mdx (Context7 /vercel/ai)
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import { truncate } from "./answer";

/** Default model: Gemini Flash-Lite (G1 budget: 15 RPM / 1000 RPD). */
export const WORKER_MODEL_ID = "gemini-2.5-flash-lite";

/** Max output tokens ≈ ≤1k chars out (G1 cap). */
export const WORKER_MAX_OUTPUT_TOKENS = 256;

/** Prompt budget: ≤6k chars in (G1 cap). */
export const WORKER_MAX_PROMPT_CHARS = 6000;

export function isLlmDisabled(): boolean {
  return process.env.DISABLE_LLM === "1";
}

/**
 * Generate a grounded answer from validation citations.
 * Throws when DISABLE_LLM=1 (caller must use extractiveFallback instead —
 * zero generation spend) or when no key is configured.
 */
export async function generateAnswer(prompt: string): Promise<string> {
  if (isLlmDisabled()) throw new Error("LLM disabled (DISABLE_LLM=1)");
  const slim = truncate(prompt, WORKER_MAX_PROMPT_CHARS);
  const { text } = await generateText({
    model: google(WORKER_MODEL_ID),
    prompt: slim,
    maxOutputTokens: WORKER_MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    maxRetries: 2,
  });
  return text;
}
