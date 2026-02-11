import { Injectable } from '@nestjs/common';
import axios from 'axios';

interface GeminiRealtimeSession {
  sessionId: string;
  ws: WebSocket;
  candidateName?: string;
  onTranscript: (transcript: {
    text: string;
    timestamp: number;
    language: string;
  }) => void;
  onAudioResponse: (audioChunk: ArrayBuffer) => void;
}

@Injectable()
export class GeminiRealtimeService {
  private readonly apiKey: string;
  private readonly model: string;
  private get apiUrl(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent`;
  }

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  async createSession(
    language: string,
    context?: {
      jobDescription?: string;
      jobTitle?: string;
      requiredSkills?: string[];
      candidateName?: string;
      candidateResume?: string;
      candidateSkills?: string[];
    },
    onTranscript?: (transcript: {
      text: string;
      timestamp: number;
      language: string;
    }) => void,
    onAudioResponse?: (audioChunk: ArrayBuffer) => void,
  ): Promise<GeminiRealtimeSession> {
    // Note: Gemini Realtime API uses WebSocket-like streaming
    // For MVP, we'll use the streaming API with Server-Sent Events or implement WebSocket proxy

    // Create a session token
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize Gemini streaming session
    // This is a simplified implementation - actual Gemini Realtime API may differ
    const session: GeminiRealtimeSession = {
      sessionId,
      ws: null as any,
      candidateName: context?.candidateName,
      onTranscript: onTranscript || (() => {}),
      onAudioResponse: onAudioResponse || (() => {}),
    };

    // Start streaming session
    await this.startStreamingSession(session, language, context);

    return session;
  }

  private async startStreamingSession(
    session: GeminiRealtimeSession,
    language: string,
    context?: {
      jobDescription?: string;
      jobTitle?: string;
      requiredSkills?: string[];
      candidateName?: string;
      candidateResume?: string;
      candidateSkills?: string[];
    },
  ): Promise<void> {
    // Build enhanced system instruction with context
    let systemInstructionText = `You are an AI interviewer conducting a professional technical interview. 
Your role is to assess the candidate's technical skills, problem-solving abilities, communication, and cultural fit.

${context?.jobTitle ? `**Job Position:** ${context.jobTitle}` : ''}
${context?.jobDescription ? `**Job Description:**\n${context.jobDescription.substring(0, 500)}${context.jobDescription.length > 500 ? '...' : ''}` : ''}
${context?.requiredSkills && context.requiredSkills.length > 0 ? `**Required Skills:** ${context.requiredSkills.join(', ')}` : ''}

${context?.candidateName ? `**Candidate:** ${context.candidateName}` : ''}
${context?.candidateSkills && context.candidateSkills.length > 0 ? `**Candidate Skills:** ${context.candidateSkills.join(', ')}` : ''}
${context?.candidateResume ? `**Candidate Background:** ${context.candidateResume}` : ''}

**Naming:** When greeting or addressing the candidate, always use their actual name (${context?.candidateName ?? 'the candidate'}). Never use placeholders such as [Candidate Name], [Interviewer Name], or "I will use a generic name". Do not introduce yourself by name; say only "I'll be conducting your interview today" or similar. Never write or speak bracketed placeholders.

**Interview Strategy:**
- Start with warm-up questions to make the candidate comfortable
- Progress to technical depth questions based on job requirements
- Assess problem-solving approach with scenario-based questions
- Evaluate communication clarity and ability to explain complex concepts
- Check cultural fit through behavioral questions
- Ask follow-up questions based on candidate responses to dive deeper
- Adapt question difficulty based on candidate's performance

**Guidelines:**
- Speak naturally in ${language}
- Ask clear, specific questions related to the job requirements and candidate's background
- Listen actively and ask follow-up questions based on candidate responses
- Keep responses concise (30-60 seconds)
- Maintain a professional yet friendly tone
- If candidate struggles, provide hints or rephrase the question
- If answer is excellent, ask deeper follow-up questions
- Track topics covered to avoid repetition
- Adjust pace based on time remaining

**Evaluation Criteria:**
- Technical Skills (40%): Depth of knowledge, accuracy, relevant experience, alignment with required skills
- Communication (25%): Clarity, articulation, ability to explain complex concepts, structure of answers
- Problem Solving (20%): Analytical thinking, approach to challenges, creativity, methodology
- Cultural Fit (15%): Alignment with company values, teamwork, adaptability, work style

**Adaptive Behavior:**
- If candidate mentions skills from their background, ask for specific examples
- If candidate struggles with a question, provide gentle guidance
- If candidate excels, challenge them with more advanced questions
- Ensure all key job requirements are covered during the interview

Remember: You are representing the company, so be professional, respectful, and thorough in your assessment.`;

    // Configure Gemini for real-time audio processing
    const config = {
      generationConfig: {
        responseModalities: ['AUDIO', 'TEXT'],
        languageCode: language,
      },
      systemInstruction: {
        parts: [
          {
            text: systemInstructionText,
          },
        ],
      },
    };

    // For MVP, we'll use HTTP streaming
    // In production, this should use WebSocket for true real-time
    console.log('Starting Gemini streaming session:', session.sessionId);
  }

  async sendAudio(
    session: GeminiRealtimeSession,
    audioChunk: ArrayBuffer,
  ): Promise<void> {
    try {
      // Convert audio chunk to base64
      const base64Audio = Buffer.from(audioChunk).toString('base64');

      // Send to Gemini API
      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/webm',
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        },
      );

      // Process streaming response
      response.data.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        const lines = data.split('\n').filter((line: string) => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.substring(6));
              this.processGeminiResponse(json, session);
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });
    } catch (error: any) {
      console.error('Error sending audio to Gemini:', error);
      throw new Error(`Failed to process audio: ${error.message}`);
    }
  }

  /**
   * Process a Gemini stream chunk. If accumulator is provided, append text to it (for one emit at stream end).
   * Otherwise emit each part immediately (legacy).
   */
  private processGeminiResponse(
    response: any,
    session: GeminiRealtimeSession,
    accumulator?: string[],
  ): void {
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') return;

      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            if (accumulator) {
              accumulator.push(part.text);
            } else {
              console.log('[Gemini] Emitting AI text:', part.text.slice(0, 80) + (part.text.length > 80 ? '...' : ''));
              session.onTranscript({
                text: part.text,
                timestamp: Date.now(),
                language: 'en',
              });
            }
          }
          if (part.inlineData?.data) {
            const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
            session.onAudioResponse(audioBuffer.buffer);
          }
        }
      }
    }
  }

  private get generateUrl(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  /**
   * Send text to Gemini and return the full response text (no stream).
   * Used by AI router when Gemini is primary or fallback.
   */
  async sendTextAndGetFullResponse(
    session: GeminiRealtimeSession,
    text: string,
  ): Promise<string> {
    const response = await axios.post<{
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    }>(
      `${this.generateUrl}?key=${this.apiKey}`,
      {
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        systemInstruction: {
          parts: [{
            text: `You are an AI interviewer. Be concise. ${session.candidateName ? `Candidate name: ${session.candidateName}.` : ''} Respond with the interviewer's reply only.`,
          }],
        },
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    const part = response.data?.candidates?.[0]?.content?.parts?.[0];
    return part?.text?.trim() ?? '';
  }

  /**
   * Send text input to Gemini and stream AI response (transcript + audio)
   * Used when OpenAI provides text and we use Gemini for TTS, or for real-time flow
   */
  async sendText(
    session: GeminiRealtimeSession,
    text: string,
  ): Promise<void> {
    try {
      // Use Gemini API to generate response from text
      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: text,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
          },
          systemInstruction: {
            parts: [
              {
                text: `You are an AI interviewer conducting a professional technical interview. 
                Your role is to assess the candidate's technical skills, problem-solving abilities, communication, and cultural fit.
                ${session.candidateName ? `The candidate's name is ${session.candidateName}. Always use it when greeting or addressing them.` : ''}
                Do not use placeholders or bracketed text like [Interviewer Name] or [Candidate Name]. Do not say "I will use a generic name". Do not introduce yourself by name; say only "I'll be conducting your interview today" or similar.
                
                Guidelines:
                - Speak naturally in English
                - Ask clear, specific questions related to the job requirements
                - Listen actively and ask follow-up questions based on candidate responses
                - Keep responses concise (30-60 seconds)
                - Maintain a professional yet friendly tone
                - Evaluate responses on: technical accuracy, depth of knowledge, problem-solving approach, communication clarity
                - Provide constructive feedback when appropriate
                - Keep the interview on schedule (aim for 30-45 minutes total)
                
                Evaluation Criteria:
                - Technical Skills (40%): Depth of knowledge, accuracy, relevant experience
                - Communication (25%): Clarity, articulation, ability to explain complex concepts
                - Problem Solving (20%): Analytical thinking, approach to challenges, creativity
                - Cultural Fit (15%): Alignment with company values, teamwork, adaptability
                
                Remember: You are representing the company, so be professional, respectful, and thorough in your assessment.`,
              },
            ],
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        },
      );

      // Accumulate streamed text and emit one ai-message at end so frontend gets full reply (no stuck first chunk)
      const textAccumulator: string[] = [];
      let buffer = '';
      let chunkCount = 0;

      const tryParsePayload = (raw: string): any => {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        let jsonStr = trimmed;
        if (trimmed.startsWith('data: ')) {
          jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '' || jsonStr === '[DONE]') return null;
        } else if (!trimmed.startsWith('{')) return null;
        try {
          return JSON.parse(jsonStr);
        } catch {
          return null;
        }
      };

      const findBalancedJson = (s: string, start: number): number => {
        if (s[start] !== '{') return -1;
        let depth = 0;
        for (let i = start; i < s.length; i++) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}') {
            depth--;
            if (depth === 0) return i + 1;
          }
        }
        return -1;
      };

      const extractAndProcess = (s: string, acc: string[]): string => {
        let rest = s.trimStart();
        while (rest.length) {
          const dataIdx = rest.indexOf('data:');
          const braceIdx = rest.indexOf('{');
          let payloadStr: string | null = null;
          let skip = 0;
          if (dataIdx !== -1 && (braceIdx === -1 || dataIdx <= braceIdx)) {
            const afterData = rest.slice(dataIdx + 5).trimStart();
            if (afterData.startsWith('{')) {
              const openIdx = rest.indexOf('{', dataIdx);
              const end = findBalancedJson(rest, openIdx);
              if (end !== -1) {
                payloadStr = rest.slice(openIdx, end).trim();
                skip = end - dataIdx;
              }
            } else if (afterData === '' || afterData.startsWith('[DONE]')) {
              skip = rest.indexOf('\n', dataIdx) + 1 || rest.length;
            }
          }
          if (!payloadStr && braceIdx !== -1 && (dataIdx === -1 || braceIdx < dataIdx)) {
            const end = findBalancedJson(rest, braceIdx);
            if (end !== -1) {
              payloadStr = rest.slice(braceIdx, end);
              skip = end - braceIdx;
            }
          }
          if (payloadStr) {
            const payload = tryParsePayload(payloadStr);
            if (payload) this.processGeminiResponse(payload, session, acc);
            rest = rest.slice(skip).trimStart();
          } else if (skip > 0) {
            rest = rest.slice(skip).trimStart();
          } else {
            break;
          }
        }
        return rest;
      };

      response.data.on('data', (chunk: Buffer) => {
        chunkCount++;
        const str = chunk.toString();
        buffer += str;
        if (chunkCount <= 3) {
          console.log('[Gemini] stream chunk', chunkCount, 'length', str.length, 'bufferLen', buffer.length);
        }
        buffer = extractAndProcess(buffer, textAccumulator);
      });
      response.data.on('end', () => {
        if (buffer.trim()) extractAndProcess(buffer, textAccumulator);
        const fullText = textAccumulator.join('').trim();
        if (fullText) {
          session.onTranscript({
            text: fullText,
            timestamp: Date.now(),
            language: 'en',
          });
        }
        console.log('[Gemini] stream end, total chunks', chunkCount);
      });
      response.data.on('error', (err: Error) => {
        console.error('Gemini stream error:', err);
      });
    } catch (error: any) {
      console.error('Error sending text to Gemini:', error);
      throw new Error(`Failed to process text: ${error.message}`);
    }
  }

  async closeSession(session: GeminiRealtimeSession): Promise<void> {
    if (session.ws) {
      session.ws.close();
    }
    console.log('Closed Gemini session:', session.sessionId);
  }
}
