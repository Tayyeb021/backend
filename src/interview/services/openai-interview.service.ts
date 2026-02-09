import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenaiInterviewService {
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = process.env.OPENAI_INTERVIEW_MODEL || 'gpt-4o';
  }

  /**
   * Get next interviewer reply (acknowledge + next question or conclude).
   * Used as primary AI for conversation when language is supported by OpenAI.
   */
  async getNextReply(
    prompt: string,
    _language?: string,
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const systemContent = `You are an AI interviewer conducting a professional interview.
Your role is to assess the candidate's skills, problem-solving, and communication.
Guidelines: Speak naturally; ask clear questions; keep responses concise (1-3 sentences for acknowledgment, then the question); maintain a professional, friendly tone.
When asked to acknowledge an answer and ask the next question, do exactly that. When asked to conclude, thank the candidate and wrap up briefly.`;

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt },
      ],
      max_tokens: 512,
      temperature: 0.7,
    });

    const content = completion.choices?.[0]?.message?.content?.trim();
    return content ?? '';
  }

  /**
   * Evaluate candidate response (completeness, relevance, clarity) using GPT-4.
   */
  async evaluateResponse(
    question: string,
    response: string,
  ): Promise<{ completeness: number; relevance: number; clarity: number; suggestions?: string[] }> {
    if (!this.openai) {
      return this.fallbackEvaluateResponse(response, question);
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You evaluate interview answers. Respond with a JSON object only, no markdown:
{ "completeness": number 0-100, "relevance": number 0-100, "clarity": number 0-100, "suggestions": string[] }
completeness=how complete the answer is; relevance=how well it addresses the question; clarity=how clear and structured. suggestions=optional short tips if any score < 70.`,
          },
          {
            role: 'user',
            content: `Question: ${question}\n\nCandidate answer: ${response}`,
          },
        ],
        max_tokens: 256,
        temperature: 0.3,
      });

      const raw = completion.choices?.[0]?.message?.content?.trim() ?? '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          completeness?: number;
          relevance?: number;
          clarity?: number;
          suggestions?: string[];
        };
        return {
          completeness: Math.min(100, Math.max(0, Number(parsed.completeness) || 0)),
          relevance: Math.min(100, Math.max(0, Number(parsed.relevance) || 0)),
          clarity: Math.min(100, Math.max(0, Number(parsed.clarity) || 0)),
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined,
        };
      }
    } catch (_e) {
      // fallback to heuristic
    }
    return this.fallbackEvaluateResponse(response, question);
  }

  private fallbackEvaluateResponse(
    response: string,
    question: string,
  ): { completeness: number; relevance: number; clarity: number; suggestions?: string[] } {
    const words = response.split(/\s+/).length;
    const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    const completeness = Math.min(
      100,
      Math.max(0, (words > 20 ? 30 : 0) + (sentences > 2 ? 30 : 0) + (response.length > 100 ? 40 : 0)),
    );
    const questionKeywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const responseLower = response.toLowerCase();
    const matchingKeywords = questionKeywords.filter((kw) => responseLower.includes(kw)).length;
    const relevance = Math.min(
      100,
      (matchingKeywords / Math.max(1, questionKeywords.length)) * 100,
    );
    const avgSentenceLength = words / Math.max(1, sentences);
    const clarity = Math.min(100, Math.max(0, 100 - Math.abs(avgSentenceLength - 15) * 2));
    const suggestions: string[] = [];
    if (completeness < 50) suggestions.push('Try to provide more detail in your answer');
    if (relevance < 50) suggestions.push('Focus more on directly addressing the question');
    if (clarity < 50) suggestions.push('Try to structure your answer more clearly');
    return { completeness, relevance, clarity, suggestions };
  }
}
