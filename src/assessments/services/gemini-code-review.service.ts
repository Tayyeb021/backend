import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface CodeReviewResult {
  overallScore: number; // 0-100
  qualityScore: number; // Code quality (0-100)
  efficiencyScore: number; // Algorithm efficiency (0-100)
  readabilityScore: number; // Code readability (0-100)
  bestPracticesScore: number; // Best practices adherence (0-100)
  strengths: string[]; // What the candidate did well
  weaknesses: string[]; // Areas for improvement
  suggestions: string[]; // Specific suggestions
  review: string; // Detailed review text
  complexity: 'low' | 'medium' | 'high'; // Code complexity assessment
  timeComplexity?: string; // Time complexity analysis
  spaceComplexity?: string; // Space complexity analysis
}

@Injectable()
export class GeminiCodeReviewService {
  private readonly logger = new Logger(GeminiCodeReviewService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.logger.warn('GEMINI_API_KEY not configured, code review will be disabled');
    }
  }

  /**
   * Review code using Gemini AI
   */
  async reviewCode(
    code: string,
    language: string,
    question: string,
    testResults: Array<{ name: string; passed: boolean; error?: string }>,
  ): Promise<CodeReviewResult> {
    if (!this.genAI) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

      const prompt = this.buildReviewPrompt(code, language, question, testResults);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the JSON response from Gemini
      return this.parseReviewResponse(text);
    } catch (error: any) {
      this.logger.error('Gemini code review failed', error);
      // Return a fallback review if Gemini fails
      return this.getFallbackReview(code, testResults);
    }
  }

  /**
   * Build the prompt for code review
   */
  private buildReviewPrompt(
    code: string,
    language: string,
    question: string,
    testResults: Array<{ name: string; passed: boolean; error?: string }>,
  ): string {
    const passedTests = testResults.filter((t) => t.passed).length;
    const totalTests = testResults.length;
    const testSummary = `${passedTests}/${totalTests} tests passed`;

    return `You are an expert code reviewer evaluating a coding assessment submission. Analyze the following code and provide a comprehensive review.

**Question/Problem:**
${question}

**Programming Language:** ${language}

**Test Results:** ${testSummary}
${testResults.map((t) => `- ${t.name}: ${t.passed ? 'PASSED' : 'FAILED'}${t.error ? ` (${t.error})` : ''}`).join('\n')}

**Candidate's Code:**
\`\`\`${language}
${code}
\`\`\`

**Review Requirements:**
1. Evaluate code quality (correctness, efficiency, readability)
2. Assess algorithm efficiency (time/space complexity)
3. Check adherence to best practices and coding standards
4. Identify strengths and weaknesses
5. Provide actionable suggestions for improvement
6. Assess code complexity (low/medium/high)

**Output Format (JSON only, no markdown):**
{
  "overallScore": <0-100>,
  "qualityScore": <0-100>,
  "efficiencyScore": <0-100>,
  "readabilityScore": <0-100>,
  "bestPracticesScore": <0-100>,
  "strengths": ["strength1", "strength2", ...],
  "weaknesses": ["weakness1", "weakness2", ...],
  "suggestions": ["suggestion1", "suggestion2", ...],
  "review": "Detailed review text explaining the evaluation",
  "complexity": "low|medium|high",
  "timeComplexity": "O(n) analysis if applicable",
  "spaceComplexity": "O(n) analysis if applicable"
}

Provide only valid JSON, no additional text or markdown formatting.`;
  }

  /**
   * Parse Gemini's response into structured review
   */
  private parseReviewResponse(text: string): CodeReviewResult {
    try {
      // Extract JSON from response (handle markdown code blocks if present)
      let jsonText = text.trim();
      
      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(jsonText);

      // Validate and return structured review
      return {
        overallScore: this.clampScore(parsed.overallScore || 0),
        qualityScore: this.clampScore(parsed.qualityScore || 0),
        efficiencyScore: this.clampScore(parsed.efficiencyScore || 0),
        readabilityScore: this.clampScore(parsed.readabilityScore || 0),
        bestPracticesScore: this.clampScore(parsed.bestPracticesScore || 0),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        review: parsed.review || 'No detailed review provided',
        complexity: ['low', 'medium', 'high'].includes(parsed.complexity) 
          ? parsed.complexity 
          : 'medium',
        timeComplexity: parsed.timeComplexity,
        spaceComplexity: parsed.spaceComplexity,
      };
    } catch (error) {
      this.logger.error('Failed to parse Gemini response', error);
      throw new Error('Failed to parse code review response');
    }
  }

  /**
   * Clamp score to 0-100 range
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Fallback review when Gemini is unavailable
   */
  private getFallbackReview(
    code: string,
    testResults: Array<{ name: string; passed: boolean }>,
  ): CodeReviewResult {
    const passedTests = testResults.filter((t) => t.passed).length;
    const totalTests = testResults.length;
    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return {
      overallScore: passRate,
      qualityScore: passRate,
      efficiencyScore: 50,
      readabilityScore: 50,
      bestPracticesScore: 50,
      strengths: passedTests > 0 ? ['Code passes test cases'] : [],
      weaknesses: passedTests < totalTests ? ['Some test cases failed'] : [],
      suggestions: ['Consider code review for detailed feedback'],
      review: `Code execution results: ${passedTests}/${totalTests} tests passed. Detailed AI review unavailable.`,
      complexity: 'medium',
    };
  }
}
