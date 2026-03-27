// ===================================================================
// Unified AI Providers — Streaming Multi-Provider System
// ===================================================================
// This module provides a clean, unified interface to interact with
// three AI providers: Ollama (local), Groq (cloud), and Gemini (Google).
//
// KEY FEATURES:
// - Streaming chat completion (real-time token-by-token output)
// - Non-streaming chat completion (full response at once)
// - System prompt + user message support
// - Factory function with automatic fallback to Ollama if API keys missing
// - Detailed error handling and logging
//
// USAGE:
//   import { getAIProvider } from './aiProviders';
//   const provider = getAIProvider('groq');
//   // Streaming:
//   for await (const chunk of provider.chatStream({ model: 'llama3', messages: [...] })) {
//     process.stdout.write(chunk);
//   }
//   // Non-streaming:
//   const result = await provider.chat({ model: 'llama3', messages: [...] });
// ===================================================================

import { logger } from '../utils';

// ─── Types ────────────────────────────────────────────────────────

/** Supported provider names */
export type ProviderName = 'ollama' | 'groq' | 'gemini';

/** Message format used across all providers */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Configuration for chat completion requests */
export interface ChatCompletionConfig {
  /** Model identifier (e.g. "llama3", "gemma2", "gemini-pro") */
  model: string;
  /** Array of messages forming the conversation */
  messages: ChatMessage[];
  /** Sampling temperature (0.0 - 2.0). Lower = more deterministic */
  temperature?: number;
  /** Maximum number of tokens to generate */
  maxTokens?: number;
}

/** Full response from non-streaming chat completion */
export interface ChatCompletionResponse {
  content: string;
  model: string;
  provider: ProviderName;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Contract every streaming provider must implement */
export interface IStreamingAIProvider {
  /** Human-readable provider name */
  readonly name: ProviderName;

  /**
   * Streaming chat completion — yields content chunks as they arrive.
   * Use with `for await...of` for real-time output.
   */
  chatStream(config: ChatCompletionConfig): AsyncGenerator<string, void, unknown>;

  /**
   * Non-streaming chat completion — returns the full response at once.
   * Internally uses the streaming endpoint and accumulates the result.
   */
  chat(config: ChatCompletionConfig): Promise<ChatCompletionResponse>;

  /** Check if the provider is reachable */
  isAvailable(): Promise<boolean>;
}

// =====================================================================
// ██  OLLAMA PROVIDER (Local LLM)
// =====================================================================
// Communicates with Ollama via its REST API.
// Default: http://localhost:11434
// No API key required — runs locally.
// =====================================================================

class OllamaStreamingProvider implements IStreamingAIProvider {
  readonly name: ProviderName = 'ollama';
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    logger.info(`[Ollama] Initialized — host: ${this.baseUrl}`);
  }

  // ── Streaming Chat ────────────────────────────────────────────

  async *chatStream(config: ChatCompletionConfig): AsyncGenerator<string, void, unknown> {
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model: config.model,
      messages: config.messages,
      stream: true, // Enable streaming
      options: {
        temperature: config.temperature ?? 0.7,
        num_predict: config.maxTokens ?? 1024,
      },
    };

    logger.debug(`[Ollama] Streaming POST ${url} — model: ${config.model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Ollama] Request failed (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('[Ollama] Response body is null — streaming not supported');
    }

    // Ollama streams newline-delimited JSON objects.
    // Each line is a JSON object like: {"message":{"content":"Hello"},"done":false}
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (newline-delimited JSON)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);

            // Yield the content chunk
            if (parsed.message?.content) {
              yield parsed.message.content;
            }

            // Stop if Ollama signals completion
            if (parsed.done) return;
          } catch {
            // Skip malformed JSON lines
            logger.warn(`[Ollama] Skipping malformed JSON line: ${trimmed.slice(0, 100)}`);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Non-Streaming Chat (accumulates stream) ───────────────────

  async chat(config: ChatCompletionConfig): Promise<ChatCompletionResponse> {
    let fullContent = '';
    for await (const chunk of this.chatStream(config)) {
      fullContent += chunk;
    }

    return {
      content: fullContent,
      model: config.model,
      provider: this.name,
    };
  }

  // ── Health Check ──────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// =====================================================================
// ██  GROQ PROVIDER (Cloud — OpenAI-compatible API)
// =====================================================================
// Uses Groq's OpenAI-compatible endpoint for ultra-fast inference.
// Requires GROQ_API_KEY in .env.
// =====================================================================

class GroqStreamingProvider implements IStreamingAIProvider {
  readonly name: ProviderName = 'groq';
  private readonly baseUrl = 'https://api.groq.com/openai/v1';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    if (!this.apiKey || this.apiKey === 'your_groq_api_key_here') {
      logger.warn('[Groq] GROQ_API_KEY is not set — provider will be unavailable.');
    } else {
      logger.info('[Groq] Initialized — API key configured.');
    }
  }

  // ── Streaming Chat ────────────────────────────────────────────

  async *chatStream(config: ChatCompletionConfig): AsyncGenerator<string, void, unknown> {
    if (!this.apiKey || this.apiKey === 'your_groq_api_key_here') {
      throw new Error('[Groq] API key is not configured. Set GROQ_API_KEY in .env');
    }

    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: config.model,
      messages: config.messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1024,
      stream: true, // Enable SSE streaming
    };

    logger.debug(`[Groq] Streaming POST ${url} — model: ${config.model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Groq] Request failed (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('[Groq] Response body is null — streaming not supported');
    }

    // Groq uses Server-Sent Events (SSE) format:
    // data: {"choices":[{"delta":{"content":"Hello"}}]}
    // data: [DONE]
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          // Skip empty lines and SSE comments
          if (!trimmed || trimmed.startsWith(':')) continue;

          // Remove "data: " prefix
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);

          // Check for stream end signal
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            logger.warn(`[Groq] Skipping malformed SSE data: ${data.slice(0, 100)}`);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Non-Streaming Chat ────────────────────────────────────────

  async chat(config: ChatCompletionConfig): Promise<ChatCompletionResponse> {
    if (!this.apiKey || this.apiKey === 'your_groq_api_key_here') {
      throw new Error('[Groq] API key is not configured. Set GROQ_API_KEY in .env');
    }

    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: config.model,
      messages: config.messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1024,
      stream: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Groq] Request failed (${response.status}): ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      model: data.model ?? config.model,
      provider: this.name,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  // ── Health Check ──────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey || this.apiKey === 'your_groq_api_key_here') return false;
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// =====================================================================
// ██  GEMINI PROVIDER (Google Generative AI)
// =====================================================================
// Uses the Gemini REST API with streaming via SSE.
// Requires GEMINI_API_KEY in .env.
// =====================================================================

class GeminiStreamingProvider implements IStreamingAIProvider {
  readonly name: ProviderName = 'gemini';
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey || this.apiKey === 'your_gemini_api_key_here') {
      logger.warn('[Gemini] GEMINI_API_KEY is not set — provider will be unavailable.');
    } else {
      logger.info('[Gemini] Initialized — API key configured.');
    }
  }

  /**
   * Convert our standard ChatMessage[] to Gemini's format.
   * Gemini uses "contents" with "parts", and system prompts go
   * into a separate "systemInstruction" field.
   */
  private buildGeminiBody(config: ChatCompletionConfig): Record<string, unknown> {
    const systemMsg = config.messages.find((m) => m.role === 'system');
    const conversationMsgs = config.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      contents: conversationMsgs.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        maxOutputTokens: config.maxTokens ?? 1024,
      },
    };

    // Pass system instruction separately (Gemini's recommended approach)
    if (systemMsg) {
      body.systemInstruction = {
        parts: [{ text: systemMsg.content }],
      };
    }

    return body;
  }

  // ── Streaming Chat ────────────────────────────────────────────

  async *chatStream(config: ChatCompletionConfig): AsyncGenerator<string, void, unknown> {
    if (!this.apiKey || this.apiKey === 'your_gemini_api_key_here') {
      throw new Error('[Gemini] API key is not configured. Set GEMINI_API_KEY in .env');
    }

    const model = config.model || 'gemini-pro';
    // Gemini streaming uses streamGenerateContent with alt=sse
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const body = this.buildGeminiBody(config);

    logger.debug(`[Gemini] Streaming POST — model: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Gemini] Request failed (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('[Gemini] Response body is null — streaming not supported');
    }

    // Gemini streams SSE events with JSON payloads containing candidates
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || trimmed.startsWith(':')) continue;
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            // Extract text from Gemini's nested structure
            const parts = parsed.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  yield part.text;
                }
              }
            }
          } catch {
            logger.warn(`[Gemini] Skipping malformed SSE data: ${data.slice(0, 100)}`);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Non-Streaming Chat ────────────────────────────────────────

  async chat(config: ChatCompletionConfig): Promise<ChatCompletionResponse> {
    if (!this.apiKey || this.apiKey === 'your_gemini_api_key_here') {
      throw new Error('[Gemini] API key is not configured. Set GEMINI_API_KEY in .env');
    }

    const model = config.model || 'gemini-pro';
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const body = this.buildGeminiBody(config);

    logger.debug(`[Gemini] POST — model: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Gemini] Request failed (${response.status}): ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    const candidate = data.candidates?.[0];
    const content =
      candidate?.content?.parts?.map((p: { text: string }) => p.text).join('') ?? '';

    return {
      content,
      model,
      provider: this.name,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount ?? 0,
            completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: data.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
    };
  }

  // ── Health Check ──────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey || this.apiKey === 'your_gemini_api_key_here') return false;
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// =====================================================================
// ██  FACTORY — getAIProvider()
// =====================================================================
// Returns the correct provider instance, with automatic fallback
// to Ollama if the requested provider's API key is missing.
// Instances are cached (singleton per provider).
// =====================================================================

/** Cached provider instances — one per provider type */
const providerCache = new Map<ProviderName, IStreamingAIProvider>();

/**
 * Get a streaming AI provider by name.
 *
 * If the requested provider requires an API key that is not configured,
 * the factory logs a warning and falls back to Ollama (local).
 *
 * @param providerName  Which provider to use: 'ollama', 'groq', or 'gemini'
 * @returns             A cached IStreamingAIProvider instance
 *
 * @example
 *   const llm = getAIProvider('groq');
 *
 *   // Streaming usage (real-time output):
 *   for await (const chunk of llm.chatStream({
 *     model: 'llama-3.3-70b-versatile',
 *     messages: [
 *       { role: 'system', content: 'You are a helpful assistant.' },
 *       { role: 'user', content: 'Explain quantum computing.' },
 *     ],
 *   })) {
 *     process.stdout.write(chunk);
 *   }
 *
 *   // Non-streaming usage:
 *   const result = await llm.chat({
 *     model: 'llama-3.3-70b-versatile',
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *   });
 *   console.log(result.content);
 */
export function getAIProvider(providerName: ProviderName): IStreamingAIProvider {
  // Return cached instance if available
  if (providerCache.has(providerName)) {
    return providerCache.get(providerName)!;
  }

  let instance: IStreamingAIProvider;

  switch (providerName) {
    case 'ollama':
      instance = new OllamaStreamingProvider();
      break;

    case 'groq': {
      const groqKey = process.env.GROQ_API_KEY || '';
      if (!groqKey || groqKey === 'your_groq_api_key_here') {
        logger.warn('[Factory] Groq API key missing — falling back to Ollama.');
        return getAIProvider('ollama'); // Recursive call, will be cached
      }
      instance = new GroqStreamingProvider();
      break;
    }

    case 'gemini': {
      const geminiKey = process.env.GEMINI_API_KEY || '';
      if (!geminiKey || geminiKey === 'your_gemini_api_key_here') {
        logger.warn('[Factory] Gemini API key missing — falling back to Ollama.');
        return getAIProvider('ollama');
      }
      instance = new GeminiStreamingProvider();
      break;
    }

    default:
      logger.warn(`[Factory] Unknown provider "${providerName}" — falling back to Ollama.`);
      return getAIProvider('ollama');
  }

  providerCache.set(providerName, instance);
  return instance;
}

/**
 * Check health status of all providers.
 *
 * @returns  Object mapping provider names to their availability.
 *
 * @example
 *   const status = await checkProvidersHealth();
 *   // { ollama: true, groq: true, gemini: false }
 */
export async function checkProvidersHealth(): Promise<Record<ProviderName, boolean>> {
  const providers: ProviderName[] = ['ollama', 'groq', 'gemini'];
  const results = {} as Record<ProviderName, boolean>;

  await Promise.all(
    providers.map(async (name) => {
      try {
        const provider = getAIProvider(name);
        results[name] = await provider.isAvailable();
      } catch {
        results[name] = false;
      }
    }),
  );

  return results;
}

/**
 * List all available provider names whose API keys are configured.
 *
 * @returns  Array of available provider names.
 */
export function getConfiguredProviders(): ProviderName[] {
  const configured: ProviderName[] = ['ollama']; // Ollama is always available (local)

  const groqKey = process.env.GROQ_API_KEY || '';
  if (groqKey && groqKey !== 'your_groq_api_key_here') {
    configured.push('groq');
  }

  const geminiKey = process.env.GEMINI_API_KEY || '';
  if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
    configured.push('gemini');
  }

  return configured;
}

export default { getAIProvider, checkProvidersHealth, getConfiguredProviders };
