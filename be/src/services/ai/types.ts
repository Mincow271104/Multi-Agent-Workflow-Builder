// ===================================================================
// AI Provider — Interface & Base Types
// ===================================================================
// Every AI provider (Ollama, Groq, Gemini) must implement this
// interface. The factory (ai-provider.factory.ts) returns the
// correct implementation based on the AIProvider enum.
// ===================================================================

import { AIRequestConfig, AIResponse } from '../../models/types';

/**
 * Contract every AI provider must fulfil.
 */
export interface IAIProvider {
  /** Human-readable name of the provider (e.g. "Ollama"). */
  readonly name: string;

  /**
   * Send a chat-completion request to the provider.
   *
   * @param config  Model, messages, and optional parameters.
   * @returns       Standardized AI response.
   */
  chat(config: AIRequestConfig): Promise<AIResponse>;

  /**
   * Check whether the provider is currently reachable.
   *
   * @returns  `true` if the provider responded to a health-check.
   */
  isAvailable(): Promise<boolean>;
}
