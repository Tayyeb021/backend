import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface TestCase {
  name: string;
  input: string;
  expected: string;
}

export interface TestResult {
  name: string;
  input: string;
  expected: string;
  output?: string;
  passed: boolean;
  error?: string;
  executionTime?: string;
}

@Injectable()
export class CodeExecutionService {
  private readonly logger = new Logger(CodeExecutionService.name);
  private readonly judge0ApiUrl = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
  private readonly judge0ApiKey = process.env.JUDGE0_API_KEY;

  /**
   * Execute code and run test cases
   * Uses Judge0 API for safe code execution
   */
  async executeCode(
    code: string,
    language: string,
    testCases: TestCase[],
  ): Promise<TestResult[]> {
    const languageId = this.getLanguageId(language);

    if (!languageId) {
      throw new Error(`Unsupported language: ${language}`);
    }

    // If Judge0 is not configured, use fallback evaluation
    if (!this.judge0ApiKey) {
      this.logger.warn('Judge0 API key not configured, using fallback evaluation');
      return this.fallbackEvaluation(code, language, testCases);
    }

    try {
      return await this.executeWithJudge0(code, languageId, testCases);
    } catch (error) {
      this.logger.error('Judge0 execution failed, using fallback', error);
      return this.fallbackEvaluation(code, language, testCases);
    }
  }

  /**
   * Execute code using Judge0 API
   */
  private async executeWithJudge0(
    code: string,
    languageId: number,
    testCases: TestCase[],
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      try {
        // Prepare code with test case input
        const codeWithInput = this.prepareCodeWithInput(code, testCase.input);

        // Submit to Judge0
        const submission = await axios.post(
          `${this.judge0ApiUrl}/submissions`,
          {
            source_code: codeWithInput,
            language_id: languageId,
            stdin: testCase.input,
          },
          {
            headers: {
              'X-RapidAPI-Key': this.judge0ApiKey,
              'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
              'Content-Type': 'application/json',
            },
            params: {
              base64_encoded: 'false',
              wait: 'true',
            },
          },
        );

        const token = submission.data.token;

        // Get result
        const result = await axios.get(`${this.judge0ApiUrl}/submissions/${token}`, {
          headers: {
            'X-RapidAPI-Key': this.judge0ApiKey,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
          },
          params: {
            base64_encoded: 'false',
          },
        });

        const output = result.data.stdout?.trim() || '';
        const error = result.data.stderr || result.data.compile_output || '';
        const passed = output === testCase.expected && !error;
        const executionTime = result.data.time ? `${result.data.time * 1000}ms` : undefined;

        results.push({
          name: testCase.name,
          input: testCase.input,
          expected: testCase.expected,
          output: output || undefined,
          passed,
          error: error || undefined,
          executionTime,
        });
      } catch (error: any) {
        results.push({
          name: testCase.name,
          input: testCase.input,
          expected: testCase.expected,
          passed: false,
          error: error.message || 'Execution failed',
        });
      }
    }

    return results;
  }

  /**
   * Fallback evaluation for when Judge0 is not available
   * This is a simple client-side evaluation (limited functionality)
   */
  private fallbackEvaluation(
    code: string,
    language: string,
    testCases: TestCase[],
  ): TestResult[] {
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      try {
        if (language === 'javascript' || language === 'typescript') {
          // Simple JavaScript evaluation (very limited)
          // In production, this should be replaced with proper sandboxed execution
          const result = this.evaluateJavaScript(code, testCase.input);
          const passed = result === testCase.expected;
          
          results.push({
            name: testCase.name,
            input: testCase.input,
            expected: testCase.expected,
            output: result,
            passed,
            executionTime: '<1ms',
          });
        } else {
          // For other languages, mark as not supported
          results.push({
            name: testCase.name,
            input: testCase.input,
            expected: testCase.expected,
            passed: false,
            error: `Language ${language} requires Judge0 API configuration`,
          });
        }
      } catch (error: any) {
        results.push({
          name: testCase.name,
          input: testCase.input,
          expected: testCase.expected,
          passed: false,
          error: error.message || 'Evaluation failed',
        });
      }
    }

    return results;
  }

  /**
   * Simple JavaScript evaluation (for fallback only)
   * WARNING: This is not secure and should only be used as a fallback
   */
  private evaluateJavaScript(code: string, input: string): string {
    try {
      // Extract function name and call it with input
      // This is a very basic implementation
      const func = new Function('input', `
        ${code}
        // Try to find and call the main function
        if (typeof solution !== 'undefined') {
          return JSON.stringify(solution(${input}));
        }
        if (typeof main !== 'undefined') {
          return JSON.stringify(main(${input}));
        }
        // If no function found, try to execute the code directly
        return JSON.stringify(eval(${input}));
      `);
      
      return func(input);
    } catch (error: any) {
      throw new Error(`Evaluation error: ${error.message}`);
    }
  }

  /**
   * Prepare code with input for execution
   */
  private prepareCodeWithInput(code: string, input: string): string {
    // This is a simple implementation
    // In production, you might want to parse the input and inject it properly
    return code;
  }

  /**
   * Get Judge0 language ID
   */
  private getLanguageId(language: string): number | null {
    const languageMap: Record<string, number> = {
      javascript: 63, // Node.js
      typescript: 74, // TypeScript
      python: 71, // Python 3
      java: 62, // Java
      cpp: 54, // C++17
      c: 50, // C
      csharp: 51, // C#
      go: 60, // Go
      rust: 73, // Rust
      php: 68, // PHP
      ruby: 72, // Ruby
      swift: 83, // Swift
      kotlin: 78, // Kotlin
    };

    return languageMap[language.toLowerCase()] || null;
  }
}
