import type { AiProvider } from "./provider";
import { GeminiProvider } from "./gemini-provider";
import { OpenAiProvider } from "./openai-provider";

interface AiEnvironment {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

/** Server-only provider choice. Gemini takes precedence when both optional keys exist. */
export function configuredAiProvider(environment?: AiEnvironment): AiProvider | null {
  const configured = environment ?? {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  };
  const geminiKey = configured.GEMINI_API_KEY?.trim();
  if (geminiKey) return new GeminiProvider(geminiKey, configured.GEMINI_MODEL?.trim() || undefined);
  const openAiKey = configured.OPENAI_API_KEY?.trim();
  if (openAiKey) return new OpenAiProvider(openAiKey, configured.OPENAI_MODEL?.trim() || undefined);
  return null;
}
