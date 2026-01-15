import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateInterviewQuestions(
    jobDescription: string,
    language: string = 'en',
  ): Promise<string[]> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Generate 5 interview questions for the following job description. 
    Questions should be in ${language} language and cover technical skills, experience, and cultural fit.
    
    Job Description:
    ${jobDescription}
    
    Return only the questions, one per line, without numbering.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse questions from response
      const questions = text
        .split('\n')
        .map((q) => q.trim())
        .filter((q) => q.length > 0 && !q.match(/^\d+[\.\)]/))
        .slice(0, 5);

      return questions;
    } catch (error: any) {
      throw new Error(
        `Failed to generate interview questions: ${error.message}`,
      );
    }
  }

  async evaluateResponse(
    question: string,
    answer: string,
    jobDescription: string,
    language: string = 'en',
  ): Promise<{
    score: number;
    feedback: string;
    strengths: string[];
    weaknesses: string[];
  }> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Evaluate the candidate's answer to an interview question.
    
    Question: ${question}
    Answer: ${answer}
    Job Description: ${jobDescription}
    
    Provide evaluation in ${language} language.
    Return a JSON object with:
    - score: number (0-100)
    - feedback: string (brief feedback)
    - strengths: string[] (list of strengths)
    - weaknesses: string[] (list of weaknesses)
    
    Return only valid JSON, no markdown formatting.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Clean JSON response
      const jsonText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const evaluation = JSON.parse(jsonText);

      return {
        score: evaluation.score || 0,
        feedback: evaluation.feedback || '',
        strengths: evaluation.strengths || [],
        weaknesses: evaluation.weaknesses || [],
      };
    } catch (error: any) {
      throw new Error(`Failed to evaluate response: ${error.message}`);
    }
  }

  async generateInterviewSummary(
    transcript: string,
    scores: any,
    language: string = 'en',
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Generate a professional interview summary in ${language} language.
    
    Transcript:
    ${transcript}
    
    Scores:
    Technical: ${scores.technical}/100
    Communication: ${scores.communication}/100
    Cultural Fit: ${scores.culturalFit}/100
    Overall: ${scores.overall}/100
    
    Provide a 2-3 paragraph summary highlighting key points, strengths, and areas for consideration.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      throw new Error(`Failed to generate interview summary: ${error.message}`);
    }
  }
}
