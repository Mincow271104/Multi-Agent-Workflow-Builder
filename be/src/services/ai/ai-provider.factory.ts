// ===================================================================
// AI Provider Factory
// ===================================================================
// Returns the correct IAIProvider implementation based on the
// AIProvider enum, caching instances for reuse.
// ===================================================================

import { AIProvider } from '@prisma/client';
import { IAIProvider } from './types';
import { OllamaProvider } from './ollama.provider';
import { GroqProvider } from './groq.provider';
import { GeminiProvider } from './gemini.provider';

/**
 * Cache of provider instances — one per provider type.
 * Avoids creating a new instance on every call.
 */
const providerCache = new Map<AIProvider, IAIProvider>();

/**
 * Get (or create) the IAIProvider implementation for the given provider.
 *
 * @param provider  Prisma AIProvider enum value.
 * @returns         A concrete IAIProvider instance.
 *
 * @example
 *   const llm = getAIProvider(AIProvider.OLLAMA);
 *   const result = await llm.chat({ model: 'llama3', messages: [...] });
 */
export function getAIProvider(provider: AIProvider): IAIProvider {
  // Return cached instance if available
  if (providerCache.has(provider)) {
    return providerCache.get(provider)!;
  }

  let instance: IAIProvider;

  switch (provider) {
    case 'OLLAMA':
      instance = new OllamaProvider();
      break;
    case 'GROQ':
      instance = new GroqProvider();
      break;
    case 'GEMINI':
      instance = new GeminiProvider();
      break;
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }

  providerCache.set(provider, instance);
  return instance;
}

/**
 * Check the health of all registered providers.
 *
 * @returns  Map of provider name → availability status.
 */
export async function checkAllProviders(): Promise<Record<string, boolean>> {
  const providers: AIProvider[] = ['OLLAMA', 'GROQ', 'GEMINI'];
  const results: Record<string, boolean> = {};

  await Promise.all(
    providers.map(async (p) => {
      const instance = getAIProvider(p);
      results[p] = await instance.isAvailable();
    }),
  );

  return results;
}

export default { getAIProvider, checkAllProviders };
