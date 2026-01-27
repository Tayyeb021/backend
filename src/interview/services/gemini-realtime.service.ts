import { Injectable } from '@nestjs/common';
import axios from 'axios';

interface GeminiRealtimeSession {
  sessionId: string;
  ws: WebSocket;
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
  private readonly apiUrl: string =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent';

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
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
      ws: null as any, // Will be replaced with actual WebSocket connection
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

  private processGeminiResponse(
    response: any,
    session: GeminiRealtimeSession,
  ): void {
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];

      // Extract text transcript
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            session.onTranscript({
              text: part.text,
              timestamp: Date.now(),
              language: 'en', // Detect from response
            });
          }

          // Extract audio response
          if (part.inlineData?.data) {
            const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
            session.onAudioResponse(audioBuffer.buffer);
          }
        }
      }
    }
  }

  /**
   * Send text input to Gemini and get AI response
   * Used when Deepgram provides transcription
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
            responseModalities: ['AUDIO', 'TEXT'],
            languageCode: 'en-US',
          },
          systemInstruction: {
            parts: [
              {
                text: `You are an AI interviewer conducting a professional technical interview. 
                Your role is to assess the candidate's technical skills, problem-solving abilities, communication, and cultural fit.
                
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
