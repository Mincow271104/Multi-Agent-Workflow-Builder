// ===================================================================
// Groq Provider — Cloud LLM API
// ===================================================================
// Communicates with the Groq cloud API.
// Requires GROQ_API_KEY in .env.
// Groq uses an OpenAI-compatible chat-completions endpoint.
// ===================================================================

import { AIRequestConfig, AIResponse } from '../../models/types';
import { IAIProvider } from './types';
import { logger } from '../../utils';

export class GroqProvider implements IAIProvider {
  readonly name = 'Groq';
  private readonly baseUrl = 'https://api.groq.com/openai/v1';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('[Groq] GROQ_API_KEY is not set — provider will not work.');
    }
  }

  // ── Chat Completion ─────────────────────────────────────────────

  async chat(config: AIRequestConfig): Promise<AIResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: config.model,
      messages: config.messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1024,
    };

    logger.debug(`[Groq] POST ${url} — model: ${config.model}`);

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
      throw new Error(`Groq request failed (${response.status}): ${errorText}`);
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

  // ── Health Check ────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      // Groq doesn't have a dedicated health endpoint; try listing models.
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default GroqProvider;
