import { Injectable } from '@nestjs/common';
import { OpenaiInterviewService } from './openai-interview.service';
import { GeminiRealtimeService } from './gemini-realtime.service';

/** Languages where Gemini is preferred (e.g. OpenAI handles them less well). */
const GEMINI_PREFERRED_LANGUAGES = new Set([
  'hi', // Hindi
  'ar', // Arabic
  'ta', // Tamil
  'te', // Telugu
  'kn', // Kannada
  'ml', // Malayalam
  'bn', // Bengali
  'mr', // Marathi
  'gu', // Gujarati
  'pa', // Punjabi
]);

export interface NextReplyResult {
  text: string;
  provider: 'openai' | 'gemini';
}

@Injectable()
export class AiRouterService {
  constructor(
    private readonly openaiInterview: OpenaiInterviewService,
    private readonly geminiRealtime: GeminiRealtimeService,
  ) {}

  /**
   * Get next interviewer reply. Primary: OpenAI GPT-4. Secondary: Gemini for
   * preferred languages or when OpenAI fails.
   */
  async getNextReply(
    prompt: string,
    language: string,
    geminiSession: any,
  ): Promise<NextReplyResult> {
    const langCode = language?.slice(0, 2).toLowerCase() || 'en';

    // Prefer Gemini for specific languages
    if (GEMINI_PREFERRED_LANGUAGES.has(langCode)) {
      try {
        const text = await this.geminiRealtime.sendTextAndGetFullResponse(
          geminiSession,
          prompt,
        );
        if (text?.trim()) return { text: text.trim(), provider: 'gemini' };
      } catch (_e) {
        // Fall through to OpenAI
      }
    }

    // Primary: OpenAI
    try {
      const text = await this.openaiInterview.getNextReply(prompt, language);
      if (text?.trim()) return { text: text.trim(), provider: 'openai' };
    } catch (_e) {
      // Fallback to Gemini
    }

    // Fallback: Gemini
    try {
      const text = await this.geminiRealtime.sendTextAndGetFullResponse(
        geminiSession,
        prompt,
      );
      if (text?.trim()) return { text: text.trim(), provider: 'gemini' };
    } catch (e) {
      console.error('AI router: both OpenAI and Gemini failed', e);
      throw e;
    }

    return { text: 'Thank you for your answer. Let me ask the next question.', provider: 'gemini' };
  }

  /**
   * Evaluate response. Prefer OpenAI; no language-based routing for evaluation.
   */
  async evaluateResponse(
    question: string,
    response: string,
  ): Promise<{ completeness: number; relevance: number; clarity: number; suggestions?: string[] }> {
    return this.openaiInterview.evaluateResponse(question, response);
  }
}
