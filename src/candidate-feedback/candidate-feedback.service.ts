import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackStatus, FeedbackDeliveryMethod, FeedbackOutcomeType } from '@prisma/client';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { SendFeedbackDto } from './dto/send-feedback.dto';
import { RequestFeedbackDto } from './dto/request-feedback.dto';
import { FeedbackGeneratorService } from './services/feedback-generator.service';
import { EmailService } from '../email/email.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class CandidateFeedbackService {
  constructor(
    private prisma: PrismaService,
    private feedbackGenerator: FeedbackGeneratorService,
    private emailService: EmailService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  async createFeedback(
    data: CreateFeedbackDto,
    createdBy: string,
  ) {
    // Verify candidate exists
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: data.candidateId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Verify related entities if provided
    if (data.jobId) {
      const job = await this.prisma.job.findUnique({ where: { id: data.jobId } });
      if (!job) throw new NotFoundException('Job not found');
    }

    if (data.interviewId) {
      const interview = await this.prisma.interview.findUnique({ where: { id: data.interviewId } });
      if (!interview) throw new NotFoundException('Interview not found');
    }

    if (data.hiringDecisionId) {
      const decision = await this.prisma.hiringDecision.findUnique({
        where: { id: data.hiringDecisionId },
      });
      if (!decision) throw new NotFoundException('Hiring decision not found');
    }

    // Generate content from template if templateId provided
    let content = data.content;
    let includeScores = data.includeScores || false;
    let scores: any = null;

    if (data.templateId) {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: data.candidateId },
        include: {
          job: data.jobId ? undefined : true,
        },
      });

      const job = data.jobId
        ? await this.prisma.job.findUnique({ where: { id: data.jobId } })
        : candidate?.job;

      const variables: Record<string, any> = {
        candidateName: `${candidate?.firstName} ${candidate?.lastName}`,
        jobTitle: job?.title || 'the position',
      };

      // Add scores if interview provided
      if (data.interviewId) {
        const interview = await this.prisma.interview.findUnique({
          where: { id: data.interviewId },
          select: { scores: true },
        });
        if (interview?.scores) {
          scores = interview.scores;
          const scoreData = interview.scores as any;
          variables.technicalScore = scoreData.technical || 0;
          variables.communicationScore = scoreData.communication || 0;
          variables.problemSolvingScore = scoreData.problemSolving || 0;
          variables.culturalFitScore = scoreData.culturalFit || 0;
          variables.overallScore = scoreData.overall || 0;
        }
      }

      content = await this.feedbackGenerator.generateFeedbackFromTemplate(
        data.templateId,
        data.candidateId,
        variables,
      );

      const template = await this.prisma.feedbackTemplate.findUnique({
        where: { id: data.templateId },
      });
      includeScores = template?.includeScores || false;
    }

    return this.prisma.candidateFeedback.create({
      data: {
        candidateId: data.candidateId,
        jobId: data.jobId,
        interviewId: data.interviewId,
        hiringDecisionId: data.hiringDecisionId,
        templateId: data.templateId,
        outcomeType: data.outcomeType,
        content,
        includeScores,
        scores: includeScores && scores ? scores : null,
        deliveryMethod: data.deliveryMethod || [FeedbackDeliveryMethod.email],
        status: FeedbackStatus.draft,
        createdBy,
      },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        job: {
          select: { id: true, title: true },
        },
        template: true,
      },
    });
  }

  async getFeedbackForCandidate(candidateId: string) {
    return this.prisma.candidateFeedback.findMany({
      where: { candidateId },
      include: {
        job: {
          select: { id: true, title: true },
        },
        template: true,
        createdByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFeedbackForJob(jobId: string) {
    return this.prisma.candidateFeedback.findMany({
      where: { jobId },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        template: true,
        createdByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFeedbackForInterview(interviewId: string) {
    return this.prisma.candidateFeedback.findMany({
      where: { interviewId },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        job: {
          select: { id: true, title: true },
        },
        template: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFeedbackForHiringDecision(decisionId: string) {
    return this.prisma.candidateFeedback.findMany({
      where: { hiringDecisionId: decisionId },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        job: {
          select: { id: true, title: true },
        },
        template: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFeedbackById(id: string) {
    const feedback = await this.prisma.candidateFeedback.findUnique({
      where: { id },
      include: {
        candidate: true,
        job: true,
        interview: true,
        hiringDecision: true,
        template: true,
        createdByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return feedback;
  }

  async sendFeedback(id: string, sendDto: SendFeedbackDto, userId: string) {
    const feedback = await this.getFeedbackById(id);

    // Check permissions
    if (feedback.createdBy !== userId && feedback.status !== FeedbackStatus.approved) {
      throw new ForbiddenException('You can only send feedback you created or approved feedback');
    }

    if (feedback.status === FeedbackStatus.sent) {
      throw new BadRequestException('Feedback has already been sent');
    }

    const deliveryMethods = sendDto.deliveryMethod || feedback.deliveryMethod || [FeedbackDeliveryMethod.email];
    const updates: any = {
      status: FeedbackStatus.sent,
      sentAt: new Date(),
      deliveryMethod: deliveryMethods,
    };

    // Send via email
    if (deliveryMethods.includes(FeedbackDeliveryMethod.email) || deliveryMethods.includes(FeedbackDeliveryMethod.both)) {
      await this.emailService.sendFeedbackEmail(
        feedback.candidate.email,
        `${feedback.candidate.firstName} ${feedback.candidate.lastName}`,
        feedback.content,
        feedback.job?.title,
        feedback.includeScores ? (feedback.scores as any) : null,
      );
      updates.sentViaEmail = true;
      updates.emailSentAt = new Date();
    }

    // Send via in-app notification
    if (deliveryMethods.includes(FeedbackDeliveryMethod.in_app) || deliveryMethods.includes(FeedbackDeliveryMethod.both)) {
      this.notificationsGateway.notifyUser(feedback.candidateId, {
        title: 'Feedback Received',
        description: `You have received feedback for ${feedback.job?.title || 'your application'}`,
        type: 'info',
        href: `/my-application/feedback/${id}`,
      });
      updates.sentViaInApp = true;
      updates.inAppSentAt = new Date();
    }

    return this.prisma.candidateFeedback.update({
      where: { id },
      data: updates,
    });
  }

  async approveFeedback(id: string, userId: string) {
    const feedback = await this.getFeedbackById(id);

    if (feedback.status !== FeedbackStatus.pending_review) {
      throw new BadRequestException('Feedback is not pending review');
    }

    return this.prisma.candidateFeedback.update({
      where: { id },
      data: { status: FeedbackStatus.approved },
    });
  }

  async rejectFeedback(id: string, userId: string, reason?: string) {
    const feedback = await this.getFeedbackById(id);

    if (feedback.status !== FeedbackStatus.pending_review) {
      throw new BadRequestException('Feedback is not pending review');
    }

    return this.prisma.candidateFeedback.update({
      where: { id },
      data: { status: FeedbackStatus.rejected },
    });
  }

  async requestFeedback(data: RequestFeedbackDto, candidateId: string) {
    // Verify candidate matches
    if (data.candidateId !== candidateId) {
      throw new ForbiddenException('You can only request feedback for yourself');
    }

    // Check if feedback already exists
    const existing = await this.prisma.candidateFeedback.findFirst({
      where: {
        candidateId: data.candidateId,
        jobId: data.jobId || undefined,
        interviewId: data.interviewId || undefined,
        status: { not: FeedbackStatus.rejected },
      },
    });

    if (existing) {
      throw new BadRequestException('Feedback already exists for this candidate');
    }

    // Create feedback request (status: pending_review)
    return this.prisma.candidateFeedback.create({
      data: {
        candidateId: data.candidateId,
        jobId: data.jobId,
        interviewId: data.interviewId,
        outcomeType: FeedbackOutcomeType.hold, // Default for requests
        content: data.message || 'Candidate has requested feedback',
        status: FeedbackStatus.pending_review,
        requestedByCandidate: true,
        requestedAt: new Date(),
        createdBy: candidateId, // Will be updated by admin/recruiter
        deliveryMethod: [],
      },
    });
  }

  async getFeedbackRequests(userId: string, companyId?: string) {
    const where: any = {
      requestedByCandidate: true,
      status: FeedbackStatus.pending_review,
    };

    // If user is admin, show all requests
    // Otherwise, show requests for their jobs/candidates
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'admin') {
      where.OR = [
        { job: { clientId: userId } },
        { candidate: { job: { clientId: userId } } },
      ];
    }

    return this.prisma.candidateFeedback.findMany({
      where,
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        job: {
          select: { id: true, title: true, clientId: true },
        },
        interview: {
          select: { id: true, status: true },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }
}
