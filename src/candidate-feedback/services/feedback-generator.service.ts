import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackTemplatesService } from '../../feedback-templates/feedback-templates.service';
import { FeedbackOutcomeType } from '@prisma/client';

@Injectable()
export class FeedbackGeneratorService {
  constructor(
    private prisma: PrismaService,
    private feedbackTemplatesService: FeedbackTemplatesService,
  ) {}

  async generateFeedbackFromTemplate(
    templateId: string,
    candidateId: string,
    variables: Record<string, any>,
  ): Promise<string> {
    const template = await this.feedbackTemplatesService.getTemplateById(templateId);
    return this.feedbackTemplatesService.processTemplate(template.template, variables);
  }

  async generateFeedbackFromOutcome(
    outcomeType: FeedbackOutcomeType,
    candidateId: string,
    jobId?: string,
    interviewId?: string,
    hiringDecisionId?: string,
    clientId?: string,
    companyId?: string,
  ): Promise<{ content: string; templateId: string | null; includeScores: boolean }> {
    // Get candidate data
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        job: jobId ? undefined : true,
      },
    });

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    const job = jobId
      ? await this.prisma.job.findUnique({ where: { id: jobId } })
      : candidate.job;

    // Get default template for outcome type
    const template = await this.feedbackTemplatesService.getDefaultTemplate(
      outcomeType,
      clientId || '',
      companyId,
    );

    // Build variables for template
    const variables: Record<string, any> = {
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      jobTitle: job?.title || 'the position',
    };

    // Add scores if available
    let scores: any = null;
    if (interviewId) {
      const interview = await this.prisma.interview.findUnique({
        where: { id: interviewId },
        select: { scores: true },
      });
      if (interview?.scores) {
        scores = interview.scores;
        variables.technicalScore = (scores as any).technical || 0;
        variables.communicationScore = (scores as any).communication || 0;
        variables.problemSolvingScore = (scores as any).problemSolving || 0;
        variables.culturalFitScore = (scores as any).culturalFit || 0;
        variables.overallScore = (scores as any).overall || 0;
      }
    }

    // Generate content
    let content: string;
    let includeScores = false;

    if (template) {
      content = this.feedbackTemplatesService.processTemplate(template.template, variables);
      includeScores = template.includeScores;
    } else {
      // Fallback to basic feedback if no template
      content = this.generateBasicFeedback(outcomeType, variables);
    }

    return {
      content,
      templateId: template?.id || null,
      includeScores,
    };
  }

  private generateBasicFeedback(
    outcomeType: FeedbackOutcomeType,
    variables: Record<string, any>,
  ): string {
    const candidateName = variables.candidateName || 'Candidate';
    const jobTitle = variables.jobTitle || 'the position';

    switch (outcomeType) {
      case 'hire':
        return `Dear ${candidateName},\n\nWe are pleased to inform you that you have been selected for ${jobTitle}. We were impressed with your qualifications and performance during the interview process.\n\nWe look forward to welcoming you to our team.\n\nBest regards`;
      case 'reject':
        return `Dear ${candidateName},\n\nThank you for your interest in ${jobTitle} and for taking the time to interview with us. After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.\n\nWe appreciate your interest and wish you the best in your job search.\n\nBest regards`;
      case 'hold':
        return `Dear ${candidateName},\n\nThank you for your interest in ${jobTitle}. We are still in the process of reviewing candidates and will keep your application under consideration. We will be in touch as soon as we have an update.\n\nThank you for your patience.\n\nBest regards`;
      case 'offer_pending':
        return `Dear ${candidateName},\n\nWe are pleased to inform you that we would like to extend an offer for ${jobTitle}. Our team will be in touch shortly with the details.\n\nWe look forward to potentially welcoming you to our team.\n\nBest regards`;
      default:
        return `Dear ${candidateName},\n\nThank you for your interest in ${jobTitle}. We will be in touch with an update soon.\n\nBest regards`;
    }
  }
}
