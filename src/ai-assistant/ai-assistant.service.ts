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
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

      // Build context prompt
      const contextPrompt = this.buildContextPrompt(context);

      // Build history
      const historyText = history
        .slice(-10) // Last 10 messages
        .map((h) => `${h.messageType}: ${h.message}`)
        .join('\n');

      const prompt = `You are an expert AI recruitment assistant for Falcon AI Recruiter, a comprehensive talent acquisition platform. Your role is to help recruiters, hiring managers, and talent acquisition professionals with all aspects of the recruitment process.

**Your Expertise:**
- Recruitment best practices and industry standards
- Interview techniques and candidate evaluation
- Talent sourcing strategies
- Market intelligence and salary benchmarking
- Candidate assessment and screening
- Hiring metrics and analytics
- Platform features and workflows
- Compliance and legal considerations in hiring

**Platform Features You Can Help With:**
1. **Job Management**: Creating job postings, managing job pipelines, using role specifications
2. **Candidate Sourcing**: Finding candidates, using sourcing platforms, candidate matching
3. **Interview Management**: Scheduling interviews, conducting AI-powered interviews, evaluating candidates
4. **Analytics**: Understanding metrics like time-to-hire, cost-per-hire, quality-of-hire, source effectiveness
5. **Market Intelligence**: Salary benchmarking, skills demand, market trends by location
6. **Automation**: Setting up automation rules for workflow optimization
7. **Evaluation**: Using evaluation policies, blueprints, and role specs
8. **Assessments**: Coding assessments, technical evaluations
9. **Pipeline Management**: Managing candidate stages, status updates, workflow optimization

**Your Communication Style:**
- Be professional, helpful, and concise
- Provide actionable advice specific to recruitment
- Reference platform features when relevant
- Use recruitment industry terminology appropriately
- Offer step-by-step guidance when needed
- Be empathetic to recruiter challenges

**Context Information:**
${contextPrompt}

${historyText ? `**Previous Conversation:**\n${historyText}\n\n` : ''}

**User Question:** ${message}

**Your Response (be specific, actionable, and recruitment-focused):**`;

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
      prompt += `**Recruiter Statistics:**
- Total Jobs Posted: ${context.stats.totalJobs || 0}
- Total Candidates: ${context.stats.totalCandidates || 0}
- Total Interviews Conducted: ${context.stats.totalInterviews || 0}
- Active Job Postings: ${context.stats.activeJobs || 0}
- Completed Interviews: ${context.stats.completedInterviews || 0}
- Advanced Candidates: ${context.stats.advancedCandidates || 0}
- Conversion Rate: ${context.stats.conversionRate || 0}%

`;
    }

    if (context.recentJobs && context.recentJobs.length > 0) {
      prompt += `**Recent Job Postings:**
${context.recentJobs.map((job: any) => `- ${job.title} (${job.status})`).join('\n')}

`;
    }

    if (context.topSkills && context.topSkills.length > 0) {
      prompt += `**Most Sought Skills in Pipeline:**
${context.topSkills.slice(0, 5).join(', ')}

`;
    }

    if (context.recentActivity) {
      prompt += `**Recent Activity:**
${context.recentActivity.map((a: string) => `- ${a}`).join('\n')}

`;
    }

    return prompt || 'No specific context available. Provide general recruitment advice.';
  }

  /**
   * Get user context
   */
  private async getUserContext(userId: string, providedContext?: any) {
    if (providedContext) {
      return providedContext;
    }

    // Fetch comprehensive user stats
    const [
      totalJobs,
      totalCandidates,
      totalInterviews,
      activeJobs,
      completedInterviews,
      advancedCandidates,
      recentJobs,
      topSkills,
    ] = await Promise.all([
      this.prisma.job.count({ where: { clientId: userId } }),
      this.prisma.candidate.count({
        where: { job: { clientId: userId } },
      }),
      this.prisma.interview.count({ where: { clientId: userId } }),
      this.prisma.job.count({
        where: { clientId: userId, status: 'published' },
      }),
      this.prisma.interview.count({
        where: { clientId: userId, status: 'completed' },
      }),
      this.prisma.candidate.count({
        where: { job: { clientId: userId }, status: 'advanced' },
      }),
      this.prisma.job.findMany({
        where: { clientId: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, status: true },
      }),
      this.prisma.candidate.findMany({
        where: { job: { clientId: userId } },
        select: { skills: true },
        take: 100,
      }),
    ]);

    // Extract top skills
    const skillCounts: Record<string, number> = {};
    topSkills.forEach((candidate) => {
      candidate.skills.forEach((skill: string) => {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    });
    const topSkillsList = Object.entries(skillCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([skill]) => skill);

    return {
      stats: {
        totalJobs,
        totalCandidates,
        totalInterviews,
        activeJobs,
        completedInterviews,
        advancedCandidates,
        conversionRate: totalCandidates > 0 
          ? ((advancedCandidates / totalCandidates) * 100).toFixed(1) 
          : '0',
      },
      recentJobs: recentJobs.map((job) => ({
        title: job.title,
        status: job.status,
      })),
      topSkills: topSkillsList,
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

    if (lowerMessage.includes('interview') || lowerMessage.includes('conduct')) {
      return 'For interview preparation, I recommend:\n\n1. Review the candidate\'s profile and resume thoroughly\n2. Prepare questions based on the job requirements and role specifications\n3. Use our AI-powered interview templates for structured evaluations\n4. Set up evaluation blueprints to ensure consistent scoring\n5. Review the candidate\'s skills against the must-have and nice-to-have requirements\n\nWould you like help with interview questions, evaluation criteria, or scheduling?';
    }

    if (lowerMessage.includes('candidate') || lowerMessage.includes('search') || lowerMessage.includes('source')) {
      return 'To find and source candidates effectively:\n\n1. Use the Candidates page with filters for skills, experience level, location, and status\n2. Leverage our AI matching algorithm that scores candidates against job requirements\n3. Check Market Intelligence for skills demand and salary benchmarks\n4. Use automation rules to automatically advance high-scoring candidates\n5. Review candidate insights for success probability and team fit\n\nWould you like help with specific sourcing strategies or candidate evaluation?';
    }

    if (lowerMessage.includes('analytics') || lowerMessage.includes('metric') || lowerMessage.includes('kpi')) {
      return 'Key recruitment metrics to track:\n\n1. **Time-to-Hire**: Average days from job posting to offer acceptance\n2. **Cost-per-Hire**: Total recruitment costs divided by number of hires\n3. **Quality-of-Hire**: Average interview scores and candidate performance\n4. **Interview-to-Offer Rate**: Percentage of interviews that result in offers\n5. **Source Effectiveness**: Which channels bring the best candidates\n\nYou can view these on the Analytics Dashboard. Would you like help improving any specific metric?';
    }

    if (lowerMessage.includes('job') || lowerMessage.includes('posting') || lowerMessage.includes('role')) {
      return 'For creating effective job postings:\n\n1. Use Role Specifications to define clear requirements\n2. Include must-have and nice-to-have skills\n3. Set appropriate seniority level and work mode\n4. Link evaluation policies for consistent candidate assessment\n5. Use Market Intelligence to set competitive salary ranges\n\nWould you like help creating a role spec or optimizing a job posting?';
    }

    if (lowerMessage.includes('salary') || lowerMessage.includes('compensation') || lowerMessage.includes('market')) {
      return 'For salary benchmarking and market intelligence:\n\n1. Use the Market Intelligence feature with job title and location\n2. Review salary ranges (min, avg, max) for your market\n3. Check skills demand percentages to prioritize requirements\n4. Analyze market trends and opportunities\n5. Consider cost-of-living differences by location\n\nWould you like help with salary negotiations or market analysis?';
    }

    if (lowerMessage.includes('automation') || lowerMessage.includes('workflow')) {
      return 'Automation can streamline your recruitment:\n\n1. Auto-advance high-scoring candidates (e.g., interview score > 85)\n2. Send automated emails when status changes\n3. Notify team members of important updates\n4. Create activity logs for tracking\n\nSet up rules in the Automation tab. Would you like help creating a specific automation rule?';
    }

    return 'I\'m your AI recruitment assistant! I can help with:\n\n• Interview preparation and candidate evaluation\n• Sourcing strategies and candidate search\n• Analytics and hiring metrics\n• Job posting optimization\n• Salary benchmarking and market intelligence\n• Automation and workflow optimization\n• Platform features and best practices\n\nWhat would you like help with today?';
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
