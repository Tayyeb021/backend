import { Injectable } from '@nestjs/common';
import axios from 'axios';

interface GeminiRealtimeSession {
  sessionId: string;
  ws: WebSocket;
  onTranscript: (transcript: { text: string; timestamp: number; language: string }) => void;
  onAudioResponse: (audioChunk: ArrayBuffer) => void;
}

@Injectable()
export class GeminiRealtimeService {
  private readonly apiKey: string;
  private readonly apiUrl: string = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent';

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
  }

  async createSession(
    language: string,
    onTranscript: (transcript: { text: string; timestamp: number; language: string }) => void,
    onAudioResponse: (audioChunk: ArrayBuffer) => void,
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
      onTranscript,
      onAudioResponse,
    };

    // Start streaming session
    await this.startStreamingSession(session, language);

    return session;
  }

  private async startStreamingSession(
    session: GeminiRealtimeSession,
    language: string,
  ): Promise<void> {
    // Configure Gemini for real-time audio processing
    const config = {
      generationConfig: {
        responseModalities: ['AUDIO', 'TEXT'],
        languageCode: language,
      },
      systemInstruction: {
        parts: [
          {
            text: `You are an AI interviewer conducting a professional interview. 
            Speak naturally in ${language}. Ask follow-up questions based on candidate responses.
            Keep responses concise and professional.`,
          },
        ],
      },
    };

    // For MVP, we'll use HTTP streaming
    // In production, this should use WebSocket for true real-time
    console.log('Starting Gemini streaming session:', session.sessionId);
  }

  async sendAudio(session: GeminiRealtimeSession, audioChunk: ArrayBuffer): Promise<void> {
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

  private processGeminiResponse(response: any, session: GeminiRealtimeSession): void {
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

  async closeSession(session: GeminiRealtimeSession): Promise<void> {
    if (session.ws) {
      session.ws.close();
    }
    console.log('Closed Gemini session:', session.sessionId);
  }
}
