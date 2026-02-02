import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private readonly modelName: string;
  private readonly isAvailable: boolean;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.isAvailable = !!apiKey && apiKey.trim().length > 0;
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Use environment variable or default to gemini-2.5-flash
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  /**
   * Check if Gemini API is available
   */
  isGeminiAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Generate a personalized greeting for the interview
   */
  async generateGreeting(
    candidateName: string,
    jobTitle: string,
    totalQuestions: number,
    language: string = 'en',
  ): Promise<string> {
    if (!this.isAvailable) {
      // Fallback greeting if Gemini is not available
      return `Hello ${candidateName}! Welcome to your interview for ${jobTitle}. We'll ask you ${totalQuestions} question${totalQuestions > 1 ? 's' : ''}. Take your time and answer thoughtfully. Ready to begin?`;
    }

    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    const prompt = `Generate a warm, professional greeting message for a candidate starting an interview.

Candidate Name: ${candidateName}
Job Title: ${jobTitle}
Total Questions: ${totalQuestions}

Requirements:
- Be warm and welcoming
- Mention the candidate's name and the job title
- Briefly explain the interview format (${totalQuestions} question${totalQuestions > 1 ? 's' : ''})
- Keep it concise (2-3 sentences maximum)
- Language: ${language}
- End with "Ready to begin?" or similar call to action

Return only the greeting message, no additional formatting or explanations.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error: any) {
      console.error('Failed to generate greeting with Gemini, using fallback:', error);
      // Fallback to simple greeting
      return `Hello ${candidateName}! Welcome to your interview for ${jobTitle}. We'll ask you ${totalQuestions} question${totalQuestions > 1 ? 's' : ''}. Take your time and answer thoughtfully. Ready to begin?`;
    }
  }

  async generateInterviewQuestions(
    jobDescription: string,
    language: string = 'en',
  ): Promise<string[]> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

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

  /**
   * Generate next interview question using interviewer prompt
   */
  async generateNextQuestion(
    context: {
      jobDescription: string;
      jobTitle: string;
      requiredSkills: string[];
      candidateName: string;
      candidateResume?: string;
      candidateSkills: string[];
      previousQuestions: string[];
      previousAnswers: string[];
      currentQuestionIndex: number;
      totalQuestions: number;
    },
    language: string = 'en',
  ): Promise<{ question: string; shouldFollowUp: boolean }> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    const interviewerPrompt = `You are an AI interviewer conducting a professional interview.

Job Title: ${context.jobTitle}
Job Description: ${context.jobDescription}
Required Skills: ${context.requiredSkills.join(', ')}
Candidate Name: ${context.candidateName}
Candidate Skills: ${context.candidateSkills.join(', ')}
${context.candidateResume ? `Candidate Resume: ${context.candidateResume}` : ''}

Previous Questions Asked:
${context.previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Previous Answers:
${context.previousAnswers.map((a, i) => `Q${i + 1}: ${a}`).join('\n\n')}

Current Progress: Question ${context.currentQuestionIndex + 1} of ${context.totalQuestions}

Your task:
1. Generate the next appropriate interview question based on the job requirements and candidate's previous answers.
2. Questions should be in ${language} language.
3. If the candidate's previous answer was incomplete or unclear, you may ask a follow-up question.
4. Otherwise, move to the next question from the interview template.

Return a JSON object with:
- question: string (the next question to ask)
- shouldFollowUp: boolean (true if this is a follow-up to previous answer, false if moving to next question)

Return only valid JSON, no markdown formatting.`;

    try {
      const result = await model.generateContent(interviewerPrompt);
      const response = await result.response;
      const text = response.text();

      const jsonText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(jsonText);

      return {
        question: parsed.question || '',
        shouldFollowUp: parsed.shouldFollowUp || false,
      };
    } catch (error: any) {
      throw new Error(`Failed to generate next question: ${error.message}`);
    }
  }

  /**
   * Evaluate answer using evaluator prompt
   */
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
    technicalScore?: number;
    communicationScore?: number;
    relevanceScore?: number;
  }> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    const evaluatorPrompt = `You are an AI evaluator assessing a candidate's interview answer.

Question: ${question}
Answer: ${answer}
Job Description: ${jobDescription}

Provide evaluation in ${language} language.
Return a JSON object with:
- score: number (0-100) - overall score
- technicalScore: number (0-100) - technical knowledge and accuracy
- communicationScore: number (0-100) - clarity and articulation
- relevanceScore: number (0-100) - relevance to the question
- feedback: string (brief feedback)
- strengths: string[] (list of strengths)
- weaknesses: string[] (list of weaknesses)

Return only valid JSON, no markdown formatting.`;

    try {
      const result = await model.generateContent(evaluatorPrompt);
      const response = await result.response;
      const text = response.text();

      const jsonText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const evaluation = JSON.parse(jsonText);

      return {
        score: evaluation.score || 0,
        technicalScore: evaluation.technicalScore || evaluation.score || 0,
        communicationScore: evaluation.communicationScore || evaluation.score || 0,
        relevanceScore: evaluation.relevanceScore || evaluation.score || 0,
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
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

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
