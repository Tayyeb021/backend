import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentStatus, UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { RunCodeDto } from './dto/run-code.dto';
import { CodeExecutionService } from './services/code-execution.service';
import { GeminiCodeReviewService } from './services/gemini-code-review.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AssessmentsService {
  constructor(
    private prisma: PrismaService,
    private codeExecutionService: CodeExecutionService,
    private geminiCodeReviewService: GeminiCodeReviewService,
    private emailService: EmailService,
  ) {}

  /**
   * Create a new coding assessment
   */
  async createAssessment(
    recruiterId: string,
    createDto: CreateAssessmentDto,
  ) {
    // Verify candidate and job exist
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: createDto.candidateId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    const job = await this.prisma.job.findUnique({
      where: { id: createDto.jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Verify interview exists if provided
    if (createDto.interviewId) {
      const interview = await this.prisma.interview.findUnique({
        where: { id: createDto.interviewId },
      });

      if (!interview) {
        throw new NotFoundException('Interview not found');
      }
    }

    // Generate secure access token for candidate
    const accessToken = this.generateAccessToken(createDto.candidateId);

    // Create assessment
    const assessment = await this.prisma.codingAssessment.create({
      data: {
        candidateId: createDto.candidateId,
        jobId: createDto.jobId,
        interviewId: createDto.interviewId,
        recruiterId,
        question: createDto.question,
        language: createDto.language || 'javascript',
        testCases: createDto.testCases as any,
        maxScore: createDto.maxScore || 100,
        deadline: createDto.deadline ? new Date(createDto.deadline) : null,
        status: AssessmentStatus.pending,
        accessToken,
        tokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiry
      },
      include: {
        candidate: true,
        job: true,
        interview: true,
      },
    });

    // Send invitation email to candidate
    await this.sendAssessmentInvitation(assessment);

    return assessment;
  }

  /**
   * Get assessment by ID
   */
  async getAssessment(id: string, userId: string, userRole: UserRole) {
    const assessment = await this.prisma.codingAssessment.findUnique({
      where: { id },
      include: {
        candidate: true,
        job: true,
        interview: true,
        recruiter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    // Role-based access control
    if (userRole === UserRole.admin) {
      // Admin can see all assessments
      return assessment;
    } else if (userRole === UserRole.interviewee) {
      // Interviewees can only see their own assessments
      // Check if the candidate email matches user email
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      
      if (user && assessment.candidate.email !== user.email) {
        throw new ForbiddenException('You can only view your own assessments');
      }
    } else if (userRole === UserRole.client || userRole === UserRole.recruiter) {
      // Clients/Recruiters can see assessments they created
      if (assessment.recruiterId !== userId) {
        throw new ForbiddenException('You can only view assessments you created');
      }
    }

    return assessment;
  }

  /**
   * List assessments with filters (role-based)
   */
  async listAssessments(filters: {
    candidateId?: string;
    jobId?: string;
    interviewId?: string;
    userId?: string;
    userRole?: UserRole;
    status?: AssessmentStatus;
  }) {
    // Build role-based where clause
    const where: any = {
      ...(filters.candidateId && { candidateId: filters.candidateId }),
      ...(filters.jobId && { jobId: filters.jobId }),
      ...(filters.interviewId && { interviewId: filters.interviewId }),
      ...(filters.status && { status: filters.status }),
    };

    // Role-based filtering
    if (filters.userRole === UserRole.admin) {
      // Admin sees all assessments - no additional filter
    } else if (filters.userRole === UserRole.interviewee) {
      // Interviewees see only their own assessments
      if (filters.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: filters.userId },
          select: { email: true },
        });
        if (user) {
          where.candidate = { email: user.email };
        }
      }
    } else if (filters.userRole === UserRole.client || filters.userRole === UserRole.recruiter) {
      // Clients/Recruiters see assessments they created
      if (filters.userId) {
        where.recruiterId = filters.userId;
      }
    }

    return this.prisma.codingAssessment.findMany({
      where,
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Start assessment (candidate starts working on it)
   */
  async startAssessment(id: string, userId: string, userRole: UserRole) {
    const assessment = await this.prisma.codingAssessment.findUnique({
      where: { id },
      include: { candidate: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    // Only interviewees can start assessments
    if (userRole !== UserRole.interviewee) {
      throw new ForbiddenException('Only candidates can start assessments');
    }

    // Verify the user is the candidate
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || assessment.candidate.email !== user.email) {
      throw new ForbiddenException('You can only start your own assessments');
    }

    if (assessment.status !== AssessmentStatus.pending) {
      throw new BadRequestException('Assessment cannot be started');
    }

    // Check deadline
    if (assessment.deadline && new Date() > assessment.deadline) {
      await this.prisma.codingAssessment.update({
        where: { id },
        data: { status: AssessmentStatus.expired },
      });
      throw new BadRequestException('Assessment deadline has passed');
    }

    return this.prisma.codingAssessment.update({
      where: { id },
      data: {
        status: AssessmentStatus.in_progress,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Run code and test cases (without submitting)
   */
  async runCode(
    id: string,
    runCodeDto: RunCodeDto,
    userId: string,
    userRole: UserRole,
  ): Promise<{
    testResults: Array<{
      name: string;
      input: string;
      expected: string;
      output?: string;
      passed: boolean;
      error?: string;
      executionTime?: string;
    }>;
    passedCount: number;
    totalCount: number;
  }> {
    const assessment = await this.prisma.codingAssessment.findUnique({
      where: { id },
      include: { candidate: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    // Only interviewees can run tests
    if (userRole !== UserRole.interviewee) {
      throw new ForbiddenException('Only candidates can run tests');
    }

    // Verify the user is the candidate
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || assessment.candidate.email !== user.email) {
      throw new ForbiddenException('You can only run tests on your own assessments');
    }

    if (assessment.status === AssessmentStatus.submitted) {
      throw new BadRequestException('Assessment already submitted');
    }

    // Execute code
    const testResults = await this.codeExecutionService.executeCode(
      runCodeDto.code,
      runCodeDto.language,
      runCodeDto.testCases,
    );

    return {
      testResults,
      passedCount: testResults.filter((r) => r.passed).length,
      totalCount: testResults.length,
    };
  }

  /**
   * Submit assessment
   */
  async submitAssessment(id: string, submitDto: SubmitAssessmentDto, userId: string, userRole: UserRole) {
    const assessment = await this.prisma.codingAssessment.findUnique({
      where: { id },
      include: { candidate: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    // Only interviewees can submit assessments
    if (userRole !== UserRole.interviewee) {
      throw new ForbiddenException('Only candidates can submit assessments');
    }

    // Verify the user is the candidate
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || assessment.candidate.email !== user.email) {
      throw new ForbiddenException('You can only submit your own assessments');
    }

    if (assessment.status === AssessmentStatus.submitted) {
      throw new BadRequestException('Assessment already submitted');
    }

    // Calculate score
    const passedTests = submitDto.testResults.filter((r) => r.passed).length;
    const totalTests = submitDto.testResults.length;
    const score = totalTests > 0 
      ? Math.round((passedTests / totalTests) * assessment.maxScore)
      : 0;

    // Get AI code review from Gemini (async, don't block submission)
    let codeReview: any = null;
    try {
      codeReview = await this.geminiCodeReviewService.reviewCode(
        submitDto.codeSubmission,
        assessment.language,
        assessment.question,
        submitDto.testResults,
      );
    } catch (error) {
      console.error('Code review failed, continuing without review:', error);
      // Continue without code review if it fails
    }

    // Update assessment
    const updated = await this.prisma.codingAssessment.update({
      where: { id },
      data: {
        status: AssessmentStatus.submitted,
        codeSubmission: submitDto.codeSubmission,
        testResults: submitDto.testResults as any,
        score,
        timeSpent: submitDto.timeSpent,
        codeReview: codeReview as any,
        submittedAt: new Date(),
      },
      include: {
        candidate: true,
        job: true,
        recruiter: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send notification email to recruiter
    await this.sendSubmissionNotification(updated);

    return updated;
  }

  /**
   * Review code using Gemini AI (can be called separately)
   */
  async reviewCode(id: string): Promise<{
    codeReview: {
      overallScore: number;
      qualityScore: number;
      efficiencyScore: number;
      readabilityScore: number;
      bestPracticesScore: number;
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
      review: string;
      complexity: 'low' | 'medium' | 'high';
      timeComplexity?: string;
      spaceComplexity?: string;
    };
    assessment: any;
  }> {
    const assessment = await this.prisma.codingAssessment.findUnique({
      where: { id },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (!assessment.codeSubmission) {
      throw new BadRequestException('No code submission found');
    }

    if (!assessment.testResults) {
      throw new BadRequestException('No test results found');
    }

    const testResults = assessment.testResults as Array<{
      name: string;
      passed: boolean;
      error?: string;
    }>;

    const codeReview = await this.geminiCodeReviewService.reviewCode(
      assessment.codeSubmission,
      assessment.language,
      assessment.question,
      testResults,
    );

    // Update assessment with code review
    const updated = await this.prisma.codingAssessment.update({
      where: { id },
      data: {
        codeReview: codeReview as any,
      },
    });

    return { codeReview, assessment: updated };
  }

  /**
   * Start assessment by token (public access)
   */
  async startAssessmentByToken(token: string) {
    const assessment = await this.verifyAccessToken(token);

    if (assessment.status !== AssessmentStatus.pending) {
      throw new BadRequestException('Assessment cannot be started');
    }

    // Check deadline
    if (assessment.deadline && new Date() > assessment.deadline) {
      await this.prisma.codingAssessment.update({
        where: { id: assessment.id },
        data: { status: AssessmentStatus.expired },
      });
      throw new BadRequestException('Assessment deadline has passed');
    }

    return this.prisma.codingAssessment.update({
      where: { id: assessment.id },
      data: {
        status: AssessmentStatus.in_progress,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Run code by token (public access)
   */
  async runCodeByToken(
    token: string,
    runCodeDto: RunCodeDto,
  ): Promise<{
    testResults: Array<{
      name: string;
      input: string;
      expected: string;
      output?: string;
      passed: boolean;
      error?: string;
      executionTime?: string;
    }>;
    passedCount: number;
    totalCount: number;
  }> {
    const assessment = await this.verifyAccessToken(token);

    if (assessment.status === AssessmentStatus.submitted) {
      throw new BadRequestException('Assessment already submitted');
    }

    // Execute code
    const testResults = await this.codeExecutionService.executeCode(
      runCodeDto.code,
      runCodeDto.language,
      runCodeDto.testCases,
    );

    return {
      testResults,
      passedCount: testResults.filter((r) => r.passed).length,
      totalCount: testResults.length,
    };
  }

  /**
   * Submit assessment by token (public access)
   */
  async submitAssessmentByToken(token: string, submitDto: SubmitAssessmentDto) {
    const assessment = await this.verifyAccessToken(token);

    if (assessment.status === AssessmentStatus.submitted) {
      throw new BadRequestException('Assessment already submitted');
    }

    // Calculate score
    const passedTests = submitDto.testResults.filter((r) => r.passed).length;
    const totalTests = submitDto.testResults.length;
    const score = totalTests > 0 
      ? Math.round((passedTests / totalTests) * assessment.maxScore)
      : 0;

    // Get AI code review from Gemini
    let codeReview: any = null;
    try {
      codeReview = await this.geminiCodeReviewService.reviewCode(
        submitDto.codeSubmission,
        assessment.language,
        assessment.question,
        submitDto.testResults,
      );
    } catch (error) {
      console.error('Code review failed, continuing without review:', error);
    }

    // Update assessment
    const updated = await this.prisma.codingAssessment.update({
      where: { id: assessment.id },
      data: {
        status: AssessmentStatus.submitted,
        codeSubmission: submitDto.codeSubmission,
        testResults: submitDto.testResults as any,
        score,
        timeSpent: submitDto.timeSpent,
        codeReview: codeReview as any,
        submittedAt: new Date(),
      },
      include: {
        candidate: true,
        job: true,
        recruiter: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send notification email to recruiter
    await this.sendSubmissionNotification(updated);

    return updated;
  }

  /**
   * Delete assessment
   */
  async deleteAssessment(id: string, userId: string, userRole: UserRole) {
    const assessment = await this.prisma.codingAssessment.findUnique({
      where: { id },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    // Admin can delete any assessment
    if (userRole === UserRole.admin) {
      // Allow deletion
    } else if (assessment.recruiterId !== userId) {
      throw new ForbiddenException('You can only delete assessments you created');
    }

    return this.prisma.codingAssessment.delete({
      where: { id },
    });
  }

  /**
   * Generate secure access token for candidate
   */
  private generateAccessToken(candidateId: string): string {
    const secret = process.env.ASSESSMENT_TOKEN_SECRET || process.env.JWT_SECRET || 'default-secret';
    const data = `${candidateId}:${Date.now()}:${Math.random()}`;
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  /**
   * Verify assessment access token
   */
  async verifyAccessToken(token: string) {
    const assessment = await this.prisma.codingAssessment.findUnique({
      where: { accessToken: token },
      include: {
        candidate: true,
        job: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException('Invalid or expired assessment link');
    }

    // Check token expiry
    if (assessment.tokenExpiry && new Date() > assessment.tokenExpiry) {
      throw new BadRequestException('Assessment link has expired');
    }

    return assessment;
  }

  /**
   * Send assessment invitation email to candidate
   */
  private async sendAssessmentInvitation(assessment: any) {
    try {
      // Use public token link for candidates (no login required)
      const assessmentUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/candidate/assessment/${assessment.accessToken}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Coding Assessment Invitation</h2>
          <p>Hello ${assessment.candidate.firstName},</p>
          <p>You have been invited to complete a coding assessment for the position: <strong>${assessment.job.title}</strong></p>
          <p><strong>Question:</strong></p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            ${assessment.question.substring(0, 200)}${assessment.question.length > 200 ? '...' : ''}
          </div>
          ${assessment.deadline ? `<p><strong>Deadline:</strong> ${new Date(assessment.deadline).toLocaleString()}</p>` : ''}
          <p><strong>Language:</strong> ${assessment.language}</p>
          <div style="margin: 30px 0;">
            <a href="${assessmentUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Start Assessment
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
            This link will expire in 30 days. No login required to access your assessment.
          </p>
          <p>Good luck!</p>
        </div>
      `;
      
      await this.emailService.sendEmail(
        assessment.candidate.email,
        `Coding Assessment Invitation - ${assessment.job.title}`,
        htmlContent,
      );
    } catch (error) {
      console.error('Failed to send assessment invitation email:', error);
    }
  }

  /**
   * Send submission notification to recruiter
   */
  private async sendSubmissionNotification(assessment: any) {
    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Coding Assessment Submitted</h2>
          <p>Hello ${assessment.recruiter.firstName},</p>
          <p><strong>${assessment.candidate.firstName} ${assessment.candidate.lastName}</strong> has submitted their coding assessment for <strong>${assessment.job.title}</strong>.</p>
          <p><strong>Score:</strong> ${assessment.score}/${assessment.maxScore}</p>
          <p><strong>Time Spent:</strong> ${assessment.timeSpent ? `${Math.floor(assessment.timeSpent / 60)} minutes` : 'N/A'}</p>
          <p>You can review the submission in your dashboard.</p>
        </div>
      `;
      
      await this.emailService.sendEmail(
        assessment.recruiter.email,
        `Coding Assessment Submitted - ${assessment.candidate.firstName} ${assessment.candidate.lastName}`,
        htmlContent,
      );
    } catch (error) {
      console.error('Failed to send submission notification email:', error);
    }
  }
}
