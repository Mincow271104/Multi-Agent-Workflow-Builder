// ===================================================================
// Gemini Provider — Google AI API
// ===================================================================
// Communicates with the Google Gemini (Generative AI) REST API.
// Requires GEMINI_API_KEY in .env.
// ===================================================================

import { AIRequestConfig, AIResponse } from '../../models/types';
import { IAIProvider } from './types';
import { logger } from '../../utils';

export class GeminiProvider implements IAIProvider {
  readonly name = 'Gemini';
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('[Gemini] GEMINI_API_KEY is not set — provider will not work.');
    }
  }

  // ── Chat Completion ─────────────────────────────────────────────

  async chat(config: AIRequestConfig): Promise<AIResponse> {
    const model = config.model || 'gemini-pro';
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    // Convert the standard message format to Gemini's expected format.
    // Gemini uses "contents" with "parts" structure.
    const systemInstruction = config.messages.find((m) => m.role === 'system');
    const conversationMessages = config.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      contents: conversationMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        maxOutputTokens: config.maxTokens ?? 1024,
      },
    };

    // Add system instruction if present
    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction.content }],
      };
    }

    logger.debug(`[Gemini] POST — model: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.map((p: { text: string }) => p.text).join('') ?? '';

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

  // ── Health Check ────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default GeminiProvider;
