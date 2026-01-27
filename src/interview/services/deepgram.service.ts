import { Injectable } from '@nestjs/common';
import { LiveClient, createClient } from '@deepgram/sdk';

@Injectable()
export class DeepgramService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
  }

  createLiveConnection(
    onTranscript: (text: string, isFinal: boolean, timestamp: number) => void,
    onError?: (error: Error) => void,
  ): LiveClient {
    const deepgram = createClient(this.apiKey);
    
    const connection = deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: true,
    });

    connection.on('open', () => {
      console.log('Deepgram connection opened');
    });

    connection.on('results', (data) => {
      if (data.channel?.alternatives?.[0]?.transcript) {
        const transcript = data.channel.alternatives[0].transcript;
        const isFinal = data.is_final || false;
        const timestamp = Date.now();
        onTranscript(transcript, isFinal, timestamp);
      }
    });

    connection.on('error', (error) => {
      console.error('Deepgram connection error:', error);
      if (onError) {
        onError(error as Error);
      }
    });

    connection.on('close', () => {
      console.log('Deepgram connection closed');
    });

    return connection;
  }

  sendAudio(connection: LiveClient, audioBuffer: Buffer): void {
    try {
      // Convert Buffer to Uint8Array for Deepgram
      const uint8Array = new Uint8Array(audioBuffer);
      connection.send(uint8Array.buffer);
    } catch (error) {
      console.error('Error sending audio to Deepgram:', error);
    }
  }

  closeConnection(connection: LiveClient): void {
    try {
      connection.finish();
    } catch (error) {
      console.error('Error closing Deepgram connection:', error);
    }
  }
}
