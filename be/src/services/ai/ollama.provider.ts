// ===================================================================
// Ollama Provider — Local LLM
// ===================================================================
// Communicates with an Ollama instance running locally (or remotely)
// via its REST API.  Default host: http://localhost:11434
// ===================================================================

import { AIRequestConfig, AIResponse } from '../../models/types';
import { IAIProvider } from './types';
import { logger } from '../../utils';

export class OllamaProvider implements IAIProvider {
  readonly name = 'Ollama';
  private readonly baseUrl: string;

  constructor() {
    // OLLAMA_HOST can be overridden in .env
    this.baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  }

  // ── Chat Completion ─────────────────────────────────────────────

  async chat(config: AIRequestConfig): Promise<AIResponse> {
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model: config.model,
      messages: config.messages,
      stream: false, // Non-streaming for simplicity in the skeleton
      options: {
        temperature: config.temperature ?? 0.7,
        num_predict: config.maxTokens ?? 1024,
      },
    };

    logger.debug(`[Ollama] POST ${url} — model: ${config.model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();

    return {
      content: data.message?.content ?? '',
      model: config.model,
      provider: this.name,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  // ── Health Check ────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default OllamaProvider;
