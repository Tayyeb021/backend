import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AIAssistantService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Chat with AI assistant
   */
  async chat(
    userId: string,
    message: string,
    sessionId?: string,
    context?: any,
  ): Promise<{ response: string; sessionId: string }> {
    const finalSessionId = sessionId || this.generateSessionId();

    // Get conversation history
    const history = await this.getConversationHistory(userId, finalSessionId);

    // Get user context
    const userContext = await this.getUserContext(userId, context);

    // Generate response using AI
    const response = await this.generateResponse(
      message,
      history,
      userContext,
    );

    // Save conversation
    await this.saveMessage(userId, finalSessionId, message, 'user', context);
    await this.saveMessage(
      userId,
      finalSessionId,
      response,
      'assistant',
      null,
    );

    return { response, sessionId: finalSessionId };
  }

  /**
   * Generate AI response
   */
  private async generateResponse(
    message: string,
    history: any[],
    context: any,
  ): Promise<string> {
    if (!this.genAI) {
      return this.getDefaultResponse(message);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

      // Build context prompt
      const contextPrompt = this.buildContextPrompt(context);

      // Build history
      const historyText = history
        .slice(-10) // Last 10 messages
        .map((h) => `${h.messageType}: ${h.message}`)
        .join('\n');

      const prompt = `You are an AI assistant for a recruitment platform (Falcon AI Recruiter). Help recruiters with:

1. Interview preparation tips
2. Candidate search and filtering
3. Analytics and metrics questions
4. Best practices for hiring
5. Platform usage guidance

${contextPrompt}

${historyText ? `Previous conversation:\n${historyText}\n\n` : ''}

User: ${message}
Assistant:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error('AI assistant error:', error);
      return this.getDefaultResponse(message);
    }
  }

  /**
   * Build context prompt from user data
   */
  private buildContextPrompt(context: any): string {
    let prompt = '';

    if (context.stats) {
      prompt += `User Statistics:
- Total Jobs: ${context.stats.totalJobs || 0}
- Total Candidates: ${context.stats.totalCandidates || 0}
- Total Interviews: ${context.stats.totalInterviews || 0}
- Active Jobs: ${context.stats.activeJobs || 0}

`;
    }

    if (context.recentActivity) {
      prompt += `Recent Activity:
${context.recentActivity.map((a: string) => `- ${a}`).join('\n')}

`;
    }

    return prompt;
  }

  /**
   * Get user context
   */
  private async getUserContext(userId: string, providedContext?: any) {
    if (providedContext) {
      return providedContext;
    }

    // Fetch user stats
    const [totalJobs, totalCandidates, totalInterviews, activeJobs] =
      await Promise.all([
        this.prisma.job.count({ where: { clientId: userId } }),
        this.prisma.candidate.count({
          where: { job: { clientId: userId } },
        }),
        this.prisma.interview.count({ where: { clientId: userId } }),
        this.prisma.job.count({
          where: { clientId: userId, status: 'published' },
        }),
      ]);

    return {
      stats: {
        totalJobs,
        totalCandidates,
        totalInterviews,
        activeJobs,
      },
    };
  }

  /**
   * Get conversation history
   */
  private async getConversationHistory(
    userId: string,
    sessionId: string,
  ): Promise<any[]> {
    return this.prisma.aIAssistantChat.findMany({
      where: {
        userId,
        sessionId,
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }

  /**
   * Save message
   */
  private async saveMessage(
    userId: string,
    sessionId: string,
    message: string,
    messageType: string,
    context: any,
  ) {
    return this.prisma.aIAssistantChat.create({
      data: {
        userId,
        sessionId,
        message,
        response: messageType === 'assistant' ? message : null,
        messageType,
        context: context as any,
      },
    });
  }

  /**
   * Get default response when AI unavailable
   */
  private getDefaultResponse(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('interview')) {
      return 'For interview preparation, I recommend reviewing the candidate\'s profile, preparing questions based on the job requirements, and using our AI interview templates. Would you like help with a specific aspect?';
    }

    if (lowerMessage.includes('candidate') || lowerMessage.includes('search')) {
      return 'To search for candidates, use the Candidates page and apply filters by skills, experience, or location. You can also use our AI matching algorithm to find the best fits for your jobs.';
    }

    if (lowerMessage.includes('analytics') || lowerMessage.includes('metric')) {
      return 'You can view analytics on the Analytics Dashboard. Key metrics include time-to-hire, cost-per-hire, and quality-of-hire. Would you like help interpreting any specific metric?';
    }

    return 'I\'m here to help with your recruitment needs. You can ask me about interviews, candidates, analytics, or platform features. How can I assist you today?';
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get chat sessions for user
   */
  async getChatSessions(userId: string) {
    const sessions = await this.prisma.aIAssistantChat.findMany({
      where: { userId },
      select: { sessionId: true, createdAt: true },
      distinct: ['sessionId'],
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return sessions.map((s) => ({
      sessionId: s.sessionId,
      createdAt: s.createdAt,
    }));
  }

  /**
   * Get messages for a session
   */
  async getSessionMessages(userId: string, sessionId: string) {
    return this.prisma.aIAssistantChat.findMany({
      where: {
        userId,
        sessionId,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
