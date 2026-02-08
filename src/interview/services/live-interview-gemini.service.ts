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
    // Use generation config for faster responses
    const model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
      },
    });

    // Format questions for prompt
    const questionsText = context.questions
      .map(q => `${q.order + 1}. ${q.question}`)
      .join('\n');

    // Optimized shorter prompt for faster processing
    const skills = context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'General technical skills';
    
    // Simplified prompt structure
    const prompt = `${this.systemPrompt}

Context: ${context.jobTitle} | Skills: ${skills}
Questions: ${questionsText.substring(0, 300)}...

Task: Greet warmly (2-3 sentences). Ask for introduction. Don't mention job title or skills in greeting.

Greeting:`;

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
    // Use generation config for faster responses
    const model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7, // Balanced creativity
        topP: 0.9,
        topK: 40,
      },
    });

    // Reduce conversation history from 10 to 5 messages for faster processing
    // Only include the most recent context needed
    const historyText = conversationHistory
      .slice(-5) // Last 5 messages for context (reduced from 10)
      .map(msg => `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`)
      .join('\n');

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

    // Optimized shorter prompt for faster processing
    const skills = context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : 'General technical skills';
    const recentAsked = askedQuestions.length > 0 ? askedQuestions.slice(-2).join('; ') : 'none';
    
    // Simplified prompt structure - remove verbose formatting
    const prompt = `${this.systemPrompt}

Context: ${context.jobTitle} | Skills: ${skills}
${availableQuestions.length > 0 ? `Next questions: ${questionsText.substring(0, 200)}` : 'All template questions asked - generate new technical questions'}
Recent conversation:
${historyText}

Task: Ask ONE question (1-2 sentences, max 30 words). ${availableQuestions.length > 0 ? 'Use template questions in order.' : 'Generate new technical question based on job requirements and candidate answers.'} Don't repeat: ${recentAsked}

Question:`;

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
    // Use generation config for faster responses
    const model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
      },
    });

    // Reduce conversation history from 10 to 5 messages for faster processing
    const historyText = conversationHistory
      .slice(-5) // Last 5 messages for context (reduced from 10)
      .map(msg => `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`)
      .join('\n');

    // Get recently asked questions to avoid duplicates
    const recentQuestions = askedQuestions.slice(-5).join('; ');

    // Optimized shorter prompt for faster processing
    const skills = context.requiredSkills.length > 0 ? context.requiredSkills.join(', ') : context.jobTitle;
    
    // Simplified prompt structure
    const prompt = `${this.systemPrompt}

Context: ${context.jobTitle} | Skills: ${skills}
Recent conversation:
${historyText}

Task: Generate NEW technical question (1-2 sentences, max 30 words) about ${skills}. Base on candidate's answers. Don't repeat: ${recentQuestions || 'none'}

Question:`;

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
    // Use generation config for faster responses
    const model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
      },
    });

    // More specific prompt to generate a proper closing message
    const prompt = `${this.systemPrompt}

The interview is now complete. Generate a professional closing message that:
1. Acknowledges the interview has ended (e.g., "That brings us to the end of the interview")
2. Thanks the candidate for their time and sharing their experience
3. Mentions that next steps will be communicated by the team if applicable
4. Ends with appreciation and well wishes
5. Keep it to 3-4 sentences maximum
6. Do NOT provide feedback, results, or evaluation
7. Do NOT mention specific details from the interview

Generate a warm, professional closing message:`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating closing:', error);
      // Fallback to a proper closing message
      return 'That brings us to the end of the interview. Thank you for taking the time to share your experience with us. If there are next steps, someone from the team will be in touch. We appreciate your interest and wish you the best.';
    }
  }
}
