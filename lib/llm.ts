// T4: LLM generation via Vercel AI SDK (Gemini Flash-Lite default, G1 caps).
// Env keys are read from process.env at call time — never printed, never committed.
// Docs:
// - generateText + google provider: https://github.com/vercel/ai/blob/main/content/providers/01-ai-sdk-providers/15-google.mdx (Context7 /vercel/ai)
// - generation settings (maxOutputTokens/temperature/maxRetries/timeout): https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/25-settings.mdx (Context7 /vercel/ai)
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { readFileSync } from "node:fs";

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

export type VertexConfig = {
  project: string;
  location: string;
  credentials: { client_email: string; private_key: string };
};

function parseServiceAccount(raw: string): VertexConfig["credentials"] | null {
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as {
      client_email?: unknown;
      private_key?: unknown;
      project_id?: unknown;
    };
    if (typeof json.client_email !== "string" || typeof json.private_key !== "string") return null;
    return { client_email: json.client_email, private_key: json.private_key };
  } catch {
    return null;
  }
}

/**
 * Resolve Vertex AI credentials without touching the network.
 * Precedence: GOOGLE_SERVICE_ACCOUNT_JSON (raw or base64) >
 * GOOGLE_APPLICATION_CREDENTIALS file > null (AI Studio key path).
 * Values are never logged.
 */
export function resolveVertexConfig(): VertexConfig | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const project =
    process.env.GOOGLE_VERTEX_PROJECT ??
    (inline ? (JSON.parse(inline.startsWith("{") ? inline : Buffer.from(inline, "base64").toString("utf8")) as { project_id?: string }).project_id : undefined);
  if (inline) {
    const credentials = parseServiceAccount(inline);
    if (credentials && project) {
      return { project, location: process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1", credentials };
    }
    return null;
  }
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) {
    try {
      const raw = readFileSync(file, "utf8");
      const credentials = parseServiceAccount(raw);
      const pid = (JSON.parse(raw) as { project_id?: string }).project_id ?? process.env.GOOGLE_VERTEX_PROJECT;
      if (credentials && pid) {
        return { project: pid, location: process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1", credentials };
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Generate a grounded answer from validation citations.
 * Throws when DISABLE_LLM=1 (caller must use extractiveFallback instead —
 * zero generation spend) or when no key is configured.
 * Prefers Vertex AI service-account auth when configured, else the
 * AI Studio GOOGLE_GENERATIVE_AI_API_KEY path.
 */
export async function generateAnswer(prompt: string): Promise<string> {
  if (isLlmDisabled()) throw new Error("LLM disabled (DISABLE_LLM=1)");
  const slim = truncate(prompt, WORKER_MAX_PROMPT_CHARS);
  const vertex = resolveVertexConfig();
  const model = vertex
    ? createVertex({
        project: vertex.project,
        location: vertex.location,
        googleAuthOptions: { credentials: vertex.credentials },
      })(WORKER_MODEL_ID)
    : google(WORKER_MODEL_ID);
  const { text } = await generateText({
    model,
    prompt: slim,
    maxOutputTokens: WORKER_MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    maxRetries: 2,
  });
  return text;
}
