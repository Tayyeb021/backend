import { Injectable, Logger } from '@nestjs/common';
import { createClient, LiveClient } from '@deepgram/sdk';
import { CloudflareR2Service } from '../../storage/cloudflare-r2.service';

@Injectable()
export class LiveInterviewDeepgramService {
  private readonly logger = new Logger(LiveInterviewDeepgramService.name);
  private deepgramApiKey: string;
  private deepgram: ReturnType<typeof createClient> | null = null;

  constructor(private r2Service: CloudflareR2Service) {
    this.deepgramApiKey = process.env.DEEPGRAM_API_KEY || '';
    if (!this.deepgramApiKey) {
      this.logger.warn('❌ Deepgram API key not configured');
    } else {
      // Log partial key for debugging (first 8 and last 4 characters)
      const partialKey = this.deepgramApiKey.length > 12 
        ? `${this.deepgramApiKey.substring(0, 8)}...${this.deepgramApiKey.substring(this.deepgramApiKey.length - 4)}`
        : '***';
      this.logger.log(`✅ Deepgram API key loaded: ${partialKey} (length: ${this.deepgramApiKey.length})`);
      // Initialize client for file transcription
      this.deepgram = createClient(this.deepgramApiKey);
    }
  }

  /**
   * Create a new Deepgram live transcription connection
   * @param onTranscript Callback when transcript is received
   * @param onError Callback for errors
   * @returns Deepgram live client
   */
  createLiveConnection(
    onTranscript: (text: string, isFinal: boolean, timestamp?: number) => void,
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

    // Log partial key for debugging
    const partialKey = this.deepgramApiKey.length > 12 
      ? `${this.deepgramApiKey.substring(0, 8)}...${this.deepgramApiKey.substring(this.deepgramApiKey.length - 4)}`
      : '***';
    this.logger.log(`✅ Deepgram API key loaded: ${partialKey} (length: ${this.deepgramApiKey.length})`);

    try {
      this.logger.log('Creating Deepgram client...');
      const deepgram = createClient(this.deepgramApiKey);
      this.logger.log('✅ Deepgram client created successfully');

      // Create connection with audio format specification
      this.logger.log('Calling deepgram.listen.live()...');
      const connection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        interim_results: true,
        punctuate: true,
        // Specify audio format for PCM 16-bit, 16kHz, mono
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
      });
      
      this.logger.log('✅ Deepgram live connection object created, setting up event handlers...');

      // Set up event handlers BEFORE returning (critical for event registration)
      let openEventFired = false;
      
      connection.on('open', () => {
        openEventFired = true;
        this.logger.log('✅ Deepgram connection opened successfully');
        if (onOpen) {
          onOpen();
        }
      });

      connection.on('metadata', (metadata: any) => {
        this.logger.log('Deepgram metadata:', JSON.stringify(metadata));
      });

      connection.on('warning', (warning: any) => {
        this.logger.warn('Deepgram warning:', warning);
      });

      connection.on('results', (data: any) => {
        try {
          // Log all results to help debug transcription issues
          const transcript = data.channel?.alternatives?.[0]?.transcript;
          const isFinal = data.is_final || false;
          
          if (transcript && transcript.trim().length > 0) {
            const timestamp = Date.now();
            this.logger.log(`🎤 Deepgram transcript (${isFinal ? 'FINAL' : 'interim'}): "${transcript}"`);
            onTranscript(transcript, isFinal, timestamp);
          } else {
            // Log when we receive results but no transcript (could indicate audio quality issues)
            if (isFinal) {
              this.logger.debug('Deepgram final result received but no transcript found. This may indicate silence or audio quality issues.');
            }
            // Only log structure for debugging if needed
            if (Math.random() < 0.01) { // Log 1% of empty results
              this.logger.debug('Deepgram result structure:', {
                hasChannel: !!data.channel,
                hasAlternatives: !!data.channel?.alternatives,
                alternativesLength: data.channel?.alternatives?.length || 0,
                isFinal: isFinal,
              });
            }
          }
        } catch (error) {
          this.logger.error('❌ Error processing transcript:', error);
        }
      });

      connection.on('error', (error: any) => {
        this.logger.error('❌ Deepgram connection error:', error);
        this.logger.error('Deepgram error details:', JSON.stringify(error, null, 2));
        
        // Check if it's an authentication error
        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          this.logger.error('❌ Deepgram authentication failed - check API key');
        }
        
        if (onError) {
          onError(new Error(error.message || 'Deepgram transcription error'));
        }
      });

      connection.on('close', (event?: any) => {
        this.logger.warn('⚠️ Deepgram connection closed');
        if (event) {
          this.logger.warn('Close event details:', JSON.stringify(event, null, 2));
        }
        // Check if it was a clean close or an error
        if (event?.code) {
          // WebSocket close codes: 1000=normal, 1001=going away, 1006=abnormal
          if (event.code === 1000) {
            this.logger.log('Connection closed normally (code 1000)');
          } else {
            this.logger.error(`Connection closed with code ${event.code} - may indicate an error`);
          }
        }
        openEventFired = false;
      });

      // Some Deepgram SDK versions require explicit connection or open on first send
      // Connection typically opens within 1-3 seconds, which is normal
      setTimeout(() => {
        if (!openEventFired) {
          // Check if connection has a readyState property
          if (connection && typeof (connection as any).getReadyState === 'function') {
            const readyState = (connection as any).getReadyState();
            // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
            if (readyState === 0) {
              this.logger.debug('Deepgram connection still connecting (readyState: 0) - this is normal, waiting...');
            } else {
              this.logger.warn(`⚠️ Deepgram open event not fired after 1 second. readyState: ${readyState}`);
            }
          } else {
            this.logger.debug('Deepgram connection establishing... (open event may fire soon)');
          }
        }
      }, 1000);

      // Additional check after 5 seconds - if still not open, there's likely an issue
      setTimeout(() => {
        if (!openEventFired) {
          this.logger.error('❌ Deepgram open event STILL not fired after 5 seconds. Connection may have failed silently.');
          this.logger.error('Possible causes: Invalid API key, network issue, or Deepgram service unavailable.');
          // Check readyState one more time
          if (connection && typeof (connection as any).getReadyState === 'function') {
            const readyState = (connection as any).getReadyState();
            this.logger.error(`Final readyState check: ${readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
          }
          // Try to trigger onOpen manually as fallback (connection might be open but event didn't fire)
          this.logger.warn('Attempting to proceed as if connection is open (fallback mode)...');
          if (onOpen) {
            onOpen();
          }
        }
      }, 5000);

      // Return connection immediately - events will fire asynchronously
      return connection;
    } catch (error: any) {
      this.logger.error('❌ Error creating Deepgram connection:', error);
      this.logger.error('Error details:', JSON.stringify(error, null, 2));
      if (onError) {
        onError(new Error(`Failed to create Deepgram connection: ${error.message}`));
      }
      throw error;
    }
  }

  /**
   * Send audio data to Deepgram
   * @param connection Deepgram live client
   * @param audioBuffer Audio buffer to send
   */
  sendAudio(connection: LiveClient, audioBuffer: Buffer): void {
    try {
      // Ensure we have a valid buffer
      if (!audioBuffer || audioBuffer.length === 0) {
        this.logger.warn('⚠️ Attempted to send empty audio buffer to Deepgram');
        return;
      }

      // Validate buffer size (should be multiple of 2 for 16-bit PCM)
      if (audioBuffer.length % 2 !== 0) {
        this.logger.warn(`⚠️ Audio buffer size is not even (${audioBuffer.length} bytes) - may cause issues with PCM 16-bit`);
      }

      // Send exact buffer bytes (not uint8Array.buffer which may include extra memory)
      // Create a new ArrayBuffer with exact size and copy the data
      const exactBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      );
      
      connection.send(exactBuffer);
      
      // Log less frequently to avoid spam
      if (Math.random() < 0.02) { // Log ~2% of sends
        this.logger.debug(`📤 Sent ${audioBuffer.length} bytes to Deepgram (PCM 16-bit, 16kHz, mono)`);
      }
    } catch (error: any) {
      this.logger.error('❌ Error sending audio to Deepgram:', error);
      this.logger.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        bufferLength: audioBuffer?.length,
      });
    }
  }

  /**
   * Close Deepgram connection
   * @param connection Deepgram live client
   */
  closeConnection(connection: LiveClient): void {
    try {
      connection.finish();
    } catch (error) {
      this.logger.error('Error closing Deepgram connection:', error);
    }
  }

  /**
   * Transcribe audio file from R2 (async)
   * @param audioKey R2 key of the audio file
   * @param language Language code (e.g., 'en-US', 'ar', 'hi')
   * @returns Transcript text
   */
  async transcribeAudioFile(
    audioKey: string,
    language: string = 'en-US',
  ): Promise<string> {
    if (!this.deepgram) {
      throw new Error('Deepgram client not initialized');
    }

    try {
      // Get presigned download URL for audio
      const audioUrl = await this.r2Service.generatePresignedDownloadUrl(audioKey);

      // Transcribe using Deepgram file transcription API
      const { result, error } = await this.deepgram.listen.prerecorded.transcribeUrl(
        { url: audioUrl },
        {
          model: 'nova-2',
          language: this.mapLanguageCode(language),
          smart_format: true,
          punctuate: true,
        },
      );

      if (error) {
        throw new Error(`Deepgram transcription error: ${error.message}`);
      }

      // Extract transcript from result
      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      return transcript;
    } catch (error: any) {
      this.logger.error('Error transcribing audio file:', error);
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  /**
   * Map language codes to Deepgram format
   */
  private mapLanguageCode(language: string): string {
    const languageMap: Record<string, string> = {
      en: 'en-US',
      ar: 'ar',
      hi: 'hi',
      ur: 'ur',
      bn: 'bn',
    };
    return languageMap[language] || 'en-US';
  }
}
