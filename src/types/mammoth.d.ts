declare module 'mammoth' {
  interface ExtractRawTextResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface ExtractRawTextOptions {
    buffer: Buffer;
  }

  export function extractRawText(options: ExtractRawTextOptions): Promise<ExtractRawTextResult>;
}
