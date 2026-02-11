import { Injectable } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';

export interface WhisperTranscriptionResult {
  text: string;
  language?: string;
}

@Injectable()
export class WhisperService {
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Transcribe audio buffer using OpenAI Whisper.
   * Accepts webm, mp3, wav, etc. Buffer is sent as multipart to Whisper API.
   */
  async transcribe(
    audioBuffer: Buffer,
    options?: { language?: string },
  ): Promise<WhisperTranscriptionResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    if (!audioBuffer || audioBuffer.length === 0) {
      return { text: '' };
    }
    // Too little audio often causes 400 (invalid/empty); need at least ~0.5s of data
    const minBytes = 4000;
    if (audioBuffer.length < minBytes) {
      return { text: '' };
    }

    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.webm', contentType: 'audio/webm' });
    form.append('model', 'whisper-1');
    if (options?.language) {
      form.append('language', options.language);
    }

    try {
      const { data } = await axios.post<{ text: string }>(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...form.getHeaders(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );
      return { text: data?.text ?? '' };
    } catch (err: any) {
      const apiError = err.response?.data?.error;
      const message = apiError?.message ?? err.message;
      const code = err.response?.status;
      console.error('[Whisper] API error:', code, message, apiError ? JSON.stringify(apiError) : '');
      // 400 often means invalid/unsupported audio (e.g. concatenated webm chunks); return empty so interview continues
      if (code === 400) {
        return { text: '' };
      }
      throw err;
    }
  }
}
