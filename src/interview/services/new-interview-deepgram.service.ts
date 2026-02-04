import { Injectable, Logger } from '@nestjs/common';
import { LiveClient } from '@deepgram/sdk';
import WebSocket from 'ws';

// Custom wrapper to implement LiveClient interface using direct WebSocket
class DirectWebSocketConnection {
  private ws: WebSocket | null = null;
  private logger: Logger;
  private onTranscript: (text: string, isFinal: boolean) => void;
  private onError?: (error: Error) => void;
  private onOpen?: () => void;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(
    ws: WebSocket,
    logger: Logger,
    onTranscript: (text: string, isFinal: boolean) => void,
    onError?: (error: Error) => void,
    onOpen?: () => void,
  ) {
    this.ws = ws;
    this.logger = logger;
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.onOpen = onOpen;
    this.setupWebSocket();
  }

  private setupWebSocket() {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.logger.log('✅ Direct WebSocket connection opened to Deepgram');
      if (this.onOpen) {
        this.onOpen();
      }
      this.emit('open');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.logger.log('📨 Received message from Deepgram:', {
          type: message.type,
          hasChannel: !!message.channel,
          isFinal: message.is_final,
        });

        // Emit metadata events
        if (message.type === 'Metadata') {
          this.emit('metadata', message);
          return;
        }

        // Handle transcript results
        if (message.channel?.alternatives?.[0]?.transcript) {
          const transcript = message.channel.alternatives[0].transcript;
          const isFinal = message.is_final || false;

          this.logger.log(`🎤 Deepgram transcript (${isFinal ? 'FINAL' : 'interim'}): "${transcript}"`);

          if (transcript && transcript.trim().length > 0) {
            this.onTranscript(transcript, isFinal);
          }

          // Emit results event
          this.emit('results', message);
        } else if (message.type === 'SpeechStarted') {
          this.emit('speech_started');
        } else if (message.type === 'UtteranceEnd') {
          this.emit('utterance_end');
        }
      } catch (error) {
        this.logger.error('Error parsing Deepgram message:', error);
      }
    });

    this.ws.on('error', (error: Error) => {
      this.logger.error('WebSocket error:', error);
      this.emit('error', error);
      if (this.onError) {
        this.onError(error);
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.logger.log(`🔴 WebSocket closed - Code: ${code}, Reason: ${reason.toString()}`);
      this.emit('close', { code, reason: reason.toString() });
    });
  }

  private emit(event: string, ...args: any[]) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    return this;
  }

  send(data: ArrayBuffer | Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('⚠️ Cannot send: WebSocket not open');
      return;
    }

    try {
      if (data instanceof ArrayBuffer) {
        this.ws.send(Buffer.from(data));
      } else {
        this.ws.send(data);
      }
    } catch (error) {
      this.logger.error('Error sending to WebSocket:', error);
      throw error;
    }
  }

  getReadyState(): number {
    if (!this.ws) return 3; // CLOSED
    // Map WebSocket states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    return this.ws.readyState;
  }

  finish(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

@Injectable()
export class NewInterviewDeepgramService {
  private readonly logger = new Logger(NewInterviewDeepgramService.name);
  private deepgramApiKey: string;

  constructor() {
    this.deepgramApiKey = process.env.DEEPGRAM_API_KEY || '';
    if (!this.deepgramApiKey) {
      this.logger.warn('❌ Deepgram API key not configured');
    } else {
      const partialKey = this.deepgramApiKey.length > 12 
        ? `${this.deepgramApiKey.substring(0, 8)}...${this.deepgramApiKey.substring(this.deepgramApiKey.length - 4)}`
        : '***';
      this.logger.log(`✅ Deepgram API key loaded: ${partialKey} (length: ${this.deepgramApiKey.length})`);
    }
  }

  /**
   * Create a new Deepgram live transcription connection using direct WebSocket
   * This matches the working implementation that uses direct WebSocket instead of SDK
   */
  createConnection(
    onTranscript: (text: string, isFinal: boolean) => void,
    onError?: (error: Error) => void,
    onOpen?: () => void,
  ): LiveClient {
    if (!this.deepgramApiKey) {
      const error = new Error('Deepgram API key not configured');
      this.logger.error('❌ Cannot create Deepgram connection:', error.message);
      if (onError) {
        onError(error);
      }
      throw error;
    }

    try {
      // Use the exact same URL format as the working project
      // model=nova-2&language=en-US&punctuate=true&interim_results=true&endpointing=4000&vad_events=true&smart_format=true
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&punctuate=true&interim_results=true&endpointing=4000&vad_events=true&smart_format=true&encoding=linear16&sample_rate=16000&channels=1`;
      
      this.logger.log('Creating direct WebSocket connection to Deepgram...');
      this.logger.log(`URL: ${wsUrl}`);

      // Create WebSocket with API key as token in subprotocol (like the working project)
      // The working project uses: new WebSocket(url, ['token', token])
      const ws = new WebSocket(wsUrl, ['token', this.deepgramApiKey]);

      const connection = new DirectWebSocketConnection(
        ws,
        this.logger,
        onTranscript,
        onError,
        onOpen,
      );

      this.logger.log('✅ Direct WebSocket connection created');
      return connection as any as LiveClient;
    } catch (error: any) {
      this.logger.error('Error creating Deepgram connection:', error);
      const err = new Error(error.message || 'Failed to create Deepgram connection');
      if (onError) {
        onError(err);
      }
      throw err;
    }
  }

  /**
   * Send audio data to Deepgram connection
   */
  sendAudio(connection: LiveClient, audioBuffer: Buffer, isKeepalive: boolean = false): void {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        return;
      }

      const readyState = connection?.getReadyState();
      if (readyState !== 1) {
        if (Math.random() < 0.1) {
          this.logger.warn(`⚠️ Connection not ready, state: ${readyState}. Cannot send audio.`);
        }
        return;
      }

      // Convert Buffer to ArrayBuffer for WebSocket
      const arrayBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      );

      connection.send(arrayBuffer);

      if (!isKeepalive && Math.random() < 0.02) {
        const duration = (audioBuffer.length / 2) / 16000;
        this.logger.log(`📤 Sent audio to Deepgram: ${audioBuffer.length} bytes (${(duration * 1000).toFixed(1)}ms of audio)`);
      }
    } catch (error) {
      this.logger.error('Error sending audio to Deepgram:', error);
    }
  }

  /**
   * Close Deepgram connection
   */
  closeConnection(connection: LiveClient): void {
    try {
      if (connection) {
        connection.finish();
        this.logger.log('Deepgram connection closed');
      }
    } catch (error) {
      this.logger.error('Error closing Deepgram connection:', error);
    }
  }
}
