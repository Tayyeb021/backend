import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackPolicy, FeedbackOutcomeType } from '@prisma/client';

@Injectable()
export class HiringDecisionsService {
  constructor(
    private prisma: PrismaService,
  ) {}

  /**
   * Create hiring decision
   */
  async createDecision(data: {
    candidateId: string;
    jobId: string;
    decisionType: 'hire' | 'reject' | 'hold' | 'offer_pending';
    rationale: string;
    madeBy: string;
    overridesAI?: boolean;
  }) {
    // Validate rationale is not empty
    if (!data.rationale || data.rationale.trim().length === 0) {
      throw new BadRequestException('Rationale is mandatory for hiring decisions');
    }

    // Check if decision already exists
    const existing = await this.prisma.hiringDecision.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: data.candidateId,
          jobId: data.jobId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Hiring decision already exists for this candidate and job');
    }

    // Determine status based on decision type
    let status: 'pending' | 'approved' | 'rejected' | 'on_hold' = 'pending';
    if (data.decisionType === 'hire' || data.decisionType === 'offer_pending') {
      status = 'approved';
    } else if (data.decisionType === 'reject') {
      status = 'rejected';
    } else if (data.decisionType === 'hold') {
      status = 'on_hold';
    }

    // Create decision
    const decision = await this.prisma.hiringDecision.create({
      data: {
        candidateId: data.candidateId,
        jobId: data.jobId,
        decisionType: data.decisionType,
        status,
        rationale: data.rationale,
        madeBy: data.madeBy,
        overridesAI: data.overridesAI || false,
      },
      include: {
        candidate: true,
        job: true,
        madeByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    // Update candidate status if decision is final
    if (status === 'approved' || status === 'rejected') {
      await this.prisma.candidate.update({
        where: { id: data.candidateId },
        data: {
          status: status === 'approved' ? 'advanced' : 'rejected',
        },
      });
    }

    // Auto-generate feedback if policy allows (async, don't block)
    this.generateFeedbackForDecision(decision, data.madeBy).catch((error) => {
      console.error('Error generating feedback for hiring decision:', error);
      // Don't throw - decision creation succeeded, feedback is optional
    });

    return decision;
  }

  private async generateFeedbackForDecision(decision: any, madeBy: string) {
    try {
      // Get job with feedback policy
      const job = await this.prisma.job.findUnique({
        where: { id: decision.jobId },
        include: {
          client: {
            select: { companyId: true },
          },
        },
      });

      if (!job || !job.feedbackEnabled || job.feedbackPolicy === FeedbackPolicy.disabled) {
        return; // Feedback disabled
      }

      // Lazy load services to avoid circular dependency
      try {
        // Dynamic import - with nodenext module resolution, use .js extension
        const feedbackTemplatesModule = await import('../feedback-templates/feedback-templates.service.js') as {
          FeedbackTemplatesService: new (prisma: PrismaService) => {
            getDefaultTemplate: (outcomeType: FeedbackOutcomeType, clientId: string, companyId?: string) => Promise<any>;
            processTemplate: (template: string, variables: Record<string, any>) => string;
          };
        };
        const FeedbackTemplatesService = feedbackTemplatesModule.FeedbackTemplatesService;
        
        const feedbackTemplatesService = new FeedbackTemplatesService(this.prisma);
        const candidate = await this.prisma.candidate.findUnique({
          where: { id: decision.candidateId },
        });

        if (!candidate) {
          return;
        }

        const outcomeType: FeedbackOutcomeType = decision.decisionType as FeedbackOutcomeType;

        // Get interviews for scores (needed regardless of template)
        const interviews = await this.prisma.interview.findMany({
          where: {
            candidateId: decision.candidateId,
            jobId: decision.jobId,
          },
          orderBy: { completedAt: 'desc' },
          take: 1,
        });

        // Get default template for outcome type
        const template = await feedbackTemplatesService.getDefaultTemplate(
          outcomeType,
          madeBy,
          job.client?.companyId || undefined,
        );

        // Generate feedback content
        let content: string;
        let includeScores = false;
        let templateId: string | null = null;

        if (template) {
          const variables: Record<string, any> = {
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            jobTitle: job.title,
          };

          // Add scores if available from interviews
          if (interviews.length > 0 && interviews[0].scores) {
            const scores = interviews[0].scores as any;
            variables.technicalScore = scores.technical || 0;
            variables.communicationScore = scores.communication || 0;
            variables.problemSolvingScore = scores.problemSolving || 0;
            variables.culturalFitScore = scores.culturalFit || 0;
            variables.overallScore = scores.overall || 0;
          }

          content = feedbackTemplatesService.processTemplate(template.template, variables);
          includeScores = template.includeScores;
          templateId = template.id;
        } else {
          // Fallback to basic feedback
          content = `Dear ${candidate.firstName} ${candidate.lastName},\n\nThank you for your interest in ${job.title}. After careful consideration, we have decided to ${outcomeType === 'hire' ? 'move forward with your application' : outcomeType === 'reject' ? 'pursue other candidates' : 'keep your application under consideration'}.\n\nBest regards`;
        }

        // Create feedback
        const feedback = await this.prisma.candidateFeedback.create({
          data: {
            candidateId: decision.candidateId,
            jobId: decision.jobId,
            hiringDecisionId: decision.id,
            templateId: templateId || undefined,
            outcomeType,
            content,
            includeScores,
            scores: includeScores && interviews.length > 0 && interviews[0].scores 
              ? interviews[0].scores 
              : undefined,
            deliveryMethod: [],
            status: 'draft',
            createdBy: madeBy,
          },
        });

        // Auto-send if policy is automatic
        if (job.feedbackPolicy === FeedbackPolicy.automatic && feedback) {
          // Use SendGrid directly to avoid circular dependency
          try {
            const sendgrid = require('@sendgrid/mail');
            const apiKey = process.env.SENDGRID_API_KEY || '';
            if (apiKey) {
              sendgrid.setApiKey(apiKey);
            }

            let scoresHtml = '';
            if (includeScores && interviews.length > 0) {
              const scores = interviews[0].scores as any;
              scoresHtml = `
                <div style="margin: 20px 0; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                  <h3 style="margin-top: 0; color: #1f2937;">Interview Scores</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    ${scores.technical !== undefined ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Technical:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.technical}%</td></tr>` : ''}
                    ${scores.communication !== undefined ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Communication:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.communication}%</td></tr>` : ''}
                    ${scores.problemSolving !== undefined ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Problem Solving:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.problemSolving}%</td></tr>` : ''}
                    ${scores.culturalFit !== undefined ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Cultural Fit:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.culturalFit}%</td></tr>` : ''}
                    ${scores.overall !== undefined ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Overall Score:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>${scores.overall}%</strong></td></tr>` : ''}
                  </table>
                </div>
              `;
            }

            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const msg = {
              to: candidate.email,
              from: process.env.SENDGRID_FROM_EMAIL || 'noreply@falconrecruiter.com',
              subject: job.title ? `Feedback - ${job.title}` : 'Interview Feedback',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #1f2937; margin-bottom: 20px;">Interview Feedback</h2>
                  <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
                  <div style="margin: 20px 0; padding: 15px; background-color: #ffffff; border-left: 4px solid #4F46E5; border-radius: 4px;">
                    ${content.split('\n').map(para => `<p style="margin: 10px 0; line-height: 1.6; color: #374151;">${para || '<br>'}</p>`).join('')}
                  </div>
                  ${scoresHtml}
                  <p style="margin-top: 30px;">You can view this feedback and your application status by logging into your candidate portal.</p>
                  <p style="margin-top: 20px;">
                    <a href="${frontendUrl}/my-application" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                      View Application
                    </a>
                  </p>
                  <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
                    Best regards,<br>
                    Falcon AI Recruiter Team
                  </p>
                </div>
              `,
            };

            await sendgrid.send(msg);

            // Update feedback as sent
            await this.prisma.candidateFeedback.update({
              where: { id: feedback.id },
              data: {
                status: 'sent',
                sentAt: new Date(),
                sentViaEmail: true,
                emailSentAt: new Date(),
                deliveryMethod: ['email'],
              },
            });
          } catch (emailError) {
            console.error('Error sending feedback email:', emailError);
            // Don't throw - feedback was created successfully
          }
        }
      } catch (error) {
        // If feedback generation fails, log but don't break decision creation
        console.error('Error generating feedback for hiring decision:', error);
      }
    } catch (error) {
      console.error('Error in generateFeedbackForDecision:', error);
      // Don't throw - this is async and shouldn't break decision creation
    }
  }

  /**
   * Get decision for candidate and job
   */
  async getDecision(candidateId: string, jobId: string) {
    return this.prisma.hiringDecision.findUnique({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId,
        },
      },
      include: {
        candidate: true,
        job: true,
        madeByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Get all decisions for a job
   */
  async getDecisionsForJob(jobId: string) {
    return this.prisma.hiringDecision.findMany({
      where: { jobId },
      include: {
        candidate: true,
        madeByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { madeAt: 'desc' },
    });
  }

  /**
   * Update decision (only if status is pending or on_hold)
   */
  async updateDecision(
    id: string,
    updates: {
      decisionType?: 'hire' | 'reject' | 'hold' | 'offer_pending';
      rationale?: string;
      status?: 'pending' | 'approved' | 'rejected' | 'on_hold';
    },
    userId: string,
  ) {
    const decision = await this.prisma.hiringDecision.findUnique({
      where: { id },
    });

    if (!decision) {
      throw new BadRequestException('Hiring decision not found');
    }

    if (decision.status !== 'pending' && decision.status !== 'on_hold') {
      throw new BadRequestException('Cannot update finalized decisions');
    }

    if (decision.madeBy !== userId) {
      throw new BadRequestException('You can only update your own decisions');
    }

    // Validate rationale if updating
    if (updates.rationale && updates.rationale.trim().length === 0) {
      throw new BadRequestException('Rationale cannot be empty');
    }

    return this.prisma.hiringDecision.update({
      where: { id },
      data: updates,
    });
  }
}
