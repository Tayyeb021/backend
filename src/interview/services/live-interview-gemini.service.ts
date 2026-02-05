import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

interface InterviewContext {
  jobTitle: string;
  requiredSkills: string[];
  questions: Array<{ id: string; question: string; type: string; order: number }>;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Injectable()
export class LiveInterviewGeminiService {
  private readonly logger = new Logger(LiveInterviewGeminiService.name);
  private genAI: GoogleGenerativeAI;
  private systemPrompt: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      this.logger.warn('Gemini API key not configured');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.loadSystemPrompt();
  }

  private loadSystemPrompt(): void {
    try {
      // Load the prompt from prompts.txt file in the backend root
      const promptsPath = path.join(process.cwd(), 'prompts.txt');
      
      if (fs.existsSync(promptsPath)) {
        this.systemPrompt = fs.readFileSync(promptsPath, 'utf-8');
        this.logger.log('✅ Loaded system prompt from prompts.txt');
      } else {
        // Fallback to default prompt if file doesn't exist
        this.logger.warn('⚠️ prompts.txt not found, using default prompt');
        this.systemPrompt = this.getDefaultPrompt();
      }
    } catch (error: any) {
      this.logger.error('❌ Error loading prompts.txt:', error);
      // Fallback to default prompt on error
      this.systemPrompt = this.getDefaultPrompt();
    }
  }

  private getDefaultPrompt(): string {
    // Default prompt as fallback
    return `You are a professional AI interviewer representing a hiring company. Your role is to conduct a natural, conversational technical interview that feels like a genuine human conversation, not a survey or interrogation.

You will receive dynamic inputs at runtime including:
- Interview title or role (e.g., Full-Stack Developer, Backend Engineer, Frontend Engineer)
- Interview focus areas (e.g., React, Node.js, Databases, System Design)
- Interview questions provided as dynamic text

Your task is to conduct the interview as if you are a real, engaged human interviewer having a natural conversation.`;
  }

  /**
   * Initialize interview context and generate greeting
   */
  async initializeInterview(context: InterviewContext): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Format questions for prompt
    const questionsText = context.questions
      .map(q => `${q.order + 1}. ${q.question}`)
      .join('\n');

    const prompt = `${this.systemPrompt}

====================
DYNAMIC INTERVIEW CONTEXT (Injected at Runtime)
====================
- Interview Title/Role: ${context.jobTitle}
- Interview Focus Areas (Required Skills): ${context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'General technical skills'}
- Interview Questions (from template):
${questionsText}

====================
CURRENT TASK: INITIALIZE INTERVIEW
====================
INSTRUCTIONS:
1. Greet the candidate warmly and professionally
2. Ask them to introduce themselves and tell you about their background
3. Wait for their introduction before proceeding
4. Keep your greeting to 2-3 sentences maximum
5. Do NOT mention the job title or skills in the greeting - just greet them warmly
6. Use the interview context above to guide your questions later, but don't mention it in the greeting

Generate a warm, professional greeting that asks for their introduction:`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating greeting:', error);
      throw new Error(`Failed to generate greeting: ${error.message}`);
    }
  }

  /**
   * Generate AI response based on conversation history
   */
  async generateResponse(
    context: InterviewContext,
    conversationHistory: ConversationMessage[],
    currentQuestionIndex: number,
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Format conversation history
    const historyText = conversationHistory
      .slice(-10) // Last 10 messages for context
      .map(msg => `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`)
      .join('\n\n');

    const availableQuestions = context.questions.slice(currentQuestionIndex);
    
    // Get already asked questions to prevent duplicates
    const askedQuestions = conversationHistory
      .filter(msg => msg.role === 'assistant')
      .map(msg => msg.content.toLowerCase().trim())
      .slice(-5); // Last 5 questions asked
    
    // Format questions for prompt
    const questionsText = availableQuestions.length > 0
      ? availableQuestions.map(q => `${q.order + 1}. ${q.question}`).join('\n')
      : 'All template questions have been asked.';

    const prompt = `${this.systemPrompt}

====================
DYNAMIC INTERVIEW CONTEXT (Injected at Runtime)
====================
- Interview Title/Role: ${context.jobTitle}
- Interview Focus Areas (Required Skills): ${context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'General technical skills'}
- Available Questions (from template):
${questionsText}

====================
CONVERSATION HISTORY
====================
${historyText}

====================
CURRENT STATE
====================
- You have asked ${currentQuestionIndex} questions so far
- You have ${availableQuestions.length} questions remaining from the template
- Current question index: ${currentQuestionIndex}

====================
CURRENT TASK: GENERATE NEXT RESPONSE
====================
${availableQuestions.length === 0 ? `
⚠️ ALL TEMPLATE QUESTIONS EXHAUSTED ⚠️
- You have asked all questions from the template
- You MUST now generate NEW follow-up or technical questions based on:
  * Job Title: ${context.jobTitle}
  * Required Skills: ${context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'General technical skills'}
  * Candidate's previous answers in the conversation
- Ask technical questions related to the job requirements and skills
- DO NOT repeat questions you've already asked
- DO NOT end the interview yet - keep asking relevant questions
` : ''}

INSTRUCTIONS:
1. If the candidate just introduced themselves, ask ONE follow-up question related to their introduction
2. ${availableQuestions.length > 0 ? `Proceed with the questions from the template in order, focusing on areas related to: ${context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'the job requirements'}` : 'Generate NEW technical questions based on the job requirements and candidate\'s previous answers'}
3. Ask only ONE question at a time
4. Keep your response to 1-2 sentences maximum (30 words)
5. Use natural, conversational language
6. Do NOT explain or elaborate on what the candidate said
7. Do NOT repeat questions you've already asked (recently asked: ${askedQuestions.length > 0 ? askedQuestions.slice(-2).join('; ') : 'none'})
8. ${availableQuestions.length === 0 ? 'Generate questions about: ' + (context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'technical skills relevant to ' + context.jobTitle) : 'Use the interview context (job title, focus areas, and questions) to guide your questions naturally'}

Generate your next response:`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating AI response:', error);
      throw new Error(`Failed to generate AI response: ${error.message}`);
    }
  }

  /**
   * Check if interview should end
   * @param currentQuestionIndex Current question index
   * @param totalQuestions Total number of questions
   * @param conversationLength Length of conversation
   * @param startedAt Interview start timestamp
   * @returns true if interview should end
   */
  shouldEndInterview(
    currentQuestionIndex: number,
    totalQuestions: number,
    conversationLength: number,
    startedAt?: Date,
  ): boolean {
    // Minimum interview duration: 5 minutes (300,000 milliseconds)
    const MIN_INTERVIEW_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    // Only allow ending in the last 30-60 seconds (4.5 to 5 minutes)
    const ENDING_WINDOW_START_MS = 4.5 * 60 * 1000; // 4.5 minutes
    const ENDING_WINDOW_END_MS = 5 * 60 * 1000; // 5 minutes
    
    if (startedAt) {
      const elapsedTime = Date.now() - startedAt.getTime();
      const elapsedMinutes = elapsedTime / (60 * 1000);
      
      // Don't end interview if minimum duration hasn't been reached
      if (elapsedTime < MIN_INTERVIEW_DURATION_MS) {
        this.logger.log(
          `⏱️ Interview duration: ${elapsedMinutes.toFixed(1)} minutes. ` +
          `Minimum 5 minutes required. Cannot end yet.`
        );
        return false;
      }
      
      // Only allow ending in the last 30-60 seconds window
      if (elapsedTime < ENDING_WINDOW_START_MS) {
        this.logger.log(
          `⏱️ Interview duration: ${elapsedMinutes.toFixed(1)} minutes. ` +
          `Must wait until ${(ENDING_WINDOW_START_MS / 60000).toFixed(1)} minutes to end. Cannot end yet.`
        );
        return false;
      }
      
      // If we're past the ending window, we should end
      if (elapsedTime >= ENDING_WINDOW_END_MS) {
        this.logger.log(
          `⏱️ Interview duration: ${elapsedMinutes.toFixed(1)} minutes. ` +
          `Past 5 minutes - should end now.`
        );
        return true;
      }
      
      // We're in the ending window (4.5-5 minutes) - check other conditions
      this.logger.log(
        `⏱️ Interview duration: ${elapsedMinutes.toFixed(1)} minutes. ` +
        `In ending window (4.5-5 min). Checking other end conditions...`
      );
    }
    
    // End if we've asked at least 5 questions and covered most of the template
    // BUT only if we're in the ending window (last 30-60 seconds)
    if (currentQuestionIndex >= totalQuestions) {
      if (startedAt) {
        const elapsedTime = Date.now() - startedAt.getTime();
        // Only end if we're in the ending window (4.5-5 minutes)
        if (elapsedTime >= ENDING_WINDOW_START_MS) {
          this.logger.log(
            `✅ Template questions exhausted (${currentQuestionIndex}/${totalQuestions}) ` +
            `and in ending window - can end interview`
          );
          return true;
        }
        // Continue with follow-up questions until ending window
        this.logger.log(
          `⏳ Template questions exhausted but not in ending window yet. ` +
          `Continue with follow-up questions until ${(ENDING_WINDOW_START_MS / 60000).toFixed(1)} minutes.`
        );
        return false;
      }
      // If no start time, allow ending (fallback)
      return true;
    }
    
    // End if we've asked at least 5 questions and had a good conversation
    // BUT only if we're in the ending window
    if (currentQuestionIndex >= 5 && conversationLength >= 10) {
      if (startedAt) {
        const elapsedTime = Date.now() - startedAt.getTime();
        // Only end if we're in the ending window (4.5-5 minutes)
        if (elapsedTime >= ENDING_WINDOW_START_MS) {
          this.logger.log(
            `✅ Good conversation (${conversationLength} messages, ${currentQuestionIndex} questions) ` +
            `and in ending window - can end interview`
          );
          return true;
        }
        // Continue until ending window
        return false;
      }
      // If no start time, allow ending (fallback)
      return true;
    }
    
    // Don't end yet - continue with questions
    return false;
  }

  /**
   * Generate follow-up question when template questions are exhausted
   */
  async generateFollowUpQuestion(
    context: InterviewContext,
    conversationHistory: ConversationMessage[],
    askedQuestions: string[],
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Format conversation history
    const historyText = conversationHistory
      .slice(-10) // Last 10 messages for context
      .map(msg => `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`)
      .join('\n\n');

    // Get recently asked questions to avoid duplicates
    const recentQuestions = askedQuestions.slice(-5).join('; ');

    const prompt = `${this.systemPrompt}

====================
DYNAMIC INTERVIEW CONTEXT (Injected at Runtime)
====================
- Interview Title/Role: ${context.jobTitle}
- Interview Focus Areas (Required Skills): ${context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'General technical skills'}

====================
CONVERSATION HISTORY
====================
${historyText}

====================
CURRENT STATE
====================
- All template questions have been asked
- You need to generate NEW technical questions based on the job requirements
- Recently asked questions (DO NOT repeat these): ${recentQuestions || 'none'}

====================
CURRENT TASK: GENERATE FOLLOW-UP QUESTION
====================
INSTRUCTIONS:
1. Generate a NEW technical question related to: ${context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : context.jobTitle}
2. Base the question on the candidate's previous answers and the job requirements
3. Ask about specific technologies, methodologies, or experiences relevant to the role
4. Keep your response to 1-2 sentences maximum (30 words)
5. Use natural, conversational language
6. Do NOT repeat questions you've already asked
7. Do NOT end the interview - keep asking relevant questions
8. Focus on areas that haven't been covered yet or need deeper exploration

Generate your next technical question:`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating follow-up question:', error);
      // Fallback question based on required skills
      const skill = context.requiredSkills.length > 0 
        ? context.requiredSkills[Math.floor(Math.random() * context.requiredSkills.length)]
        : 'technical skills';
      return `Can you tell me about your experience with ${skill}?`;
    }
  }

  /**
   * Generate closing message
   */
  async generateClosing(): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `${this.systemPrompt}

The interview is now complete. Generate a warm, professional closing message (2-3 sentences) thanking the candidate for their time. Do not provide feedback or results.`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating closing:', error);
      return 'Thank you for your time today. We appreciate you taking the time to speak with us.';
    }
  }
}
