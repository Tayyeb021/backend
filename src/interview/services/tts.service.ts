import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TTSService {
  private readonly logger = new Logger(TTSService.name);

  /**
   * Generate speech audio from text using Google Text-to-Speech API
   * Uses the free Google TTS API endpoint (no API key required for basic usage)
   * @param text Text to convert to speech
   * @param language Language code (en, ar, ur, etc.)
   * @returns Audio buffer (MP3 format)
   */
  async generateSpeech(text: string, language: string = 'en'): Promise<Buffer> {
    try {
      // Map language codes to Google TTS language codes
      const langMap: Record<string, string> = {
        en: 'en',
        ar: 'ar',
        ur: 'ur',
      };

      const ttsLang = langMap[language] || 'en';

      // Split long text into chunks (Google TTS has character limits)
      const maxChunkLength = 200; // Safe limit for Google TTS
      const textChunks = this.splitTextIntoChunks(text, maxChunkLength);

      if (textChunks.length === 0) {
        throw new Error('Text is empty');
      }

      // Generate audio for each chunk and combine
      const audioBuffers: Buffer[] = [];

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        this.logger.debug(`Generating TTS for chunk ${i + 1}/${textChunks.length} (${chunk.length} chars)`);

        // Use Google Translate TTS (free, no API key needed)
        // Note: This is an unofficial API and may have rate limits
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${ttsLang}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
        
        try {
          const response = await axios.get(ttsUrl, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'audio/mpeg, audio/*;q=0.9',
              'Referer': 'https://translate.google.com/',
            },
            timeout: 10000, // 10 second timeout
          });

          if (response.data && response.data.byteLength > 0) {
            audioBuffers.push(Buffer.from(response.data));
            
            // Add small delay between chunks to avoid rate limiting
            if (i < textChunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        } catch (error: any) {
          this.logger.warn(`Failed to generate TTS for chunk ${i + 1}: ${error.message}`);
          // Continue with other chunks
        }
      }

      if (audioBuffers.length === 0) {
        throw new Error('Failed to generate any audio chunks');
      }

      // Combine all audio buffers
      const combinedBuffer = Buffer.concat(audioBuffers);
      this.logger.log(`Generated TTS audio: ${combinedBuffer.length} bytes from ${textChunks.length} chunks`);

      return combinedBuffer;
    } catch (error: any) {
      this.logger.error(`Failed to generate TTS audio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Split text into chunks for TTS (respects word boundaries)
   */
  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    // Split by sentences first, then by words
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
      if (sentence.length <= maxLength) {
        if (currentChunk.length + sentence.length <= maxLength) {
          currentChunk += sentence;
        } else {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = sentence;
        }
      } else {
        // Sentence is too long, split by words
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        const words = sentence.split(/\s+/);
        for (const word of words) {
          if (currentChunk.length + word.length + 1 <= maxLength) {
            currentChunk += (currentChunk ? ' ' : '') + word;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = word;
          }
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Generate speech using Google Cloud Text-to-Speech API (requires API key)
   * This is the recommended approach for production
   */
  async generateSpeechWithGoogleCloud(
    text: string,
    language: string = 'en',
  ): Promise<Buffer> {
    // This would require @google-cloud/text-to-speech package
    // For now, we'll use the free alternative above
    // To implement this properly:
    // 1. Install: npm install @google-cloud/text-to-speech
    // 2. Set GOOGLE_APPLICATION_CREDENTIALS or use API key
    // 3. Use TextToSpeechClient to synthesize speech
    
    throw new Error('Google Cloud TTS not yet configured. Using free TTS alternative.');
  }
}
