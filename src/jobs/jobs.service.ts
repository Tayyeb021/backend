import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Job, JobStatus, Prisma, CandidateStatus, InterviewLanguage, InterviewType, UserRole } from '@prisma/client';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobQueryDto } from './dto/job-query.dto';
import { JobsAutoInviteService } from './jobs-auto-invite.service';
import { InterviewService } from '../interview/interview.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { generateSecurePassword } from '../candidates/utils/password.utils';

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private autoInviteService: JobsAutoInviteService,
    @Inject(forwardRef(() => InterviewService))
    private interviewService: InterviewService,
    private emailService: EmailService,
  ) {}

  async createJob(createJobDto: CreateJobDto, clientId: string): Promise<Job> {
    // Validate salary range
    if (createJobDto.minSalary !== undefined && createJobDto.maxSalary !== undefined) {
      if (createJobDto.minSalary > createJobDto.maxSalary) {
        throw new BadRequestException('minSalary cannot be greater than maxSalary');
      }
    }

    // Automatically set status to published if not specified
    const data: any = {
      ...createJobDto,
      clientId,
      status: createJobDto.status || JobStatus.published, // Default to published
    };

    // Set publishedAt if status is published (or defaulting to published)
    if (data.status === JobStatus.published && !createJobDto.publishedAt) {
      data.publishedAt = new Date();
    }

    // Convert date strings to Date objects
    if (createJobDto.hiringDeadline) {
      data.hiringDeadline = new Date(createJobDto.hiringDeadline);
    }
    if (createJobDto.publishedAt) {
      data.publishedAt = new Date(createJobDto.publishedAt);
    }
    if (createJobDto.expiresAt) {
      data.expiresAt = new Date(createJobDto.expiresAt);
    }

    // Create the job
    const job = await this.prisma.job.create({
      data,
    });

    // Automatically invite top 10 matched candidates (jobs are always published by default)
    if (job.status === JobStatus.published) {
      // Run auto-invite in background (don't wait for it to complete)
      this.autoInviteCandidates(job.id, clientId, {
        language: 'en',
        type: 'live',
        daysAhead: [3, 5, 7],
        maxCandidates: 10,
      }).catch((error) => {
        console.error('Failed to auto-invite candidates:', error);
        // Don't throw - job creation should succeed even if invitations fail
      });
    }

    return job;
  }

  async getJobsByClient(
    clientId: string,
    query: JobQueryDto,
  ): Promise<{
    data: Job[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.JobWhereInput = {
      clientId,
    };

    const andConditions: Prisma.JobWhereInput[] = [];

    // Text search (searches in title, description, and requiredSkills)
    if (query.search) {
      andConditions.push({
        OR: [
          {
            title: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            requiredSkills: {
              hasSome: [query.search],
            },
          },
        ],
      });
    }

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Job type filters
    if (query.jobType) {
      where.jobType = query.jobType;
    }

    if (query.workMode) {
      where.workMode = query.workMode;
    }

    if (query.engagementLength) {
      where.engagementLength = query.engagementLength;
    }

    // Experience and seniority filters
    if (query.experienceLevel) {
      where.experienceLevel = query.experienceLevel;
    }

    if (query.seniorityLevel) {
      where.seniorityLevel = query.seniorityLevel;
    }

    // Location filters
    if (query.country) {
      where.country = {
        contains: query.country,
        mode: 'insensitive',
      };
    }

    if (query.timezone) {
      where.timezone = {
        contains: query.timezone,
        mode: 'insensitive',
      };
    }

    // Compensation filters - salary range
    if (query.minSalary !== undefined || query.maxSalary !== undefined) {
      const salaryConditions: Prisma.JobWhereInput[] = [];
      
      if (query.minSalary !== undefined) {
        salaryConditions.push({
          OR: [
            { minSalary: { gte: query.minSalary } },
            { minSalary: null },
          ],
        });
      }
      
      if (query.maxSalary !== undefined) {
        salaryConditions.push({
          OR: [
            { maxSalary: { lte: query.maxSalary } },
            { maxSalary: null },
          ],
        });
      }
      
      if (salaryConditions.length > 0) {
        andConditions.push(...salaryConditions);
      }
    }

    if (query.currency) {
      where.currency = {
        equals: query.currency,
        mode: 'insensitive',
      };
    }

    if (query.billingType) {
      where.billingType = query.billingType;
    }

    // Hiring info filters
    if (query.openings !== undefined) {
      where.openings = query.openings;
    }

    if (query.hiringDeadlineFrom || query.hiringDeadlineTo) {
      where.hiringDeadline = {};
      if (query.hiringDeadlineFrom) {
        where.hiringDeadline.gte = new Date(query.hiringDeadlineFrom);
      }
      if (query.hiringDeadlineTo) {
        where.hiringDeadline.lte = new Date(query.hiringDeadlineTo);
      }
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    // Date range filters
    if (query.publishedAtFrom || query.publishedAtTo) {
      where.publishedAt = {};
      if (query.publishedAtFrom) {
        where.publishedAt.gte = new Date(query.publishedAtFrom);
      }
      if (query.publishedAtTo) {
        where.publishedAt.lte = new Date(query.publishedAtTo);
      }
    }

    if (query.expiresAtFrom || query.expiresAtTo) {
      where.expiresAt = {};
      if (query.expiresAtFrom) {
        where.expiresAt.gte = new Date(query.expiresAtFrom);
      }
      if (query.expiresAtTo) {
        where.expiresAt.lte = new Date(query.expiresAtTo);
      }
    }

    // Created date range filters
    if (query.createdAtFrom || query.createdAtTo) {
      where.createdAt = {};
      if (query.createdAtFrom) {
        where.createdAt.gte = new Date(query.createdAtFrom);
      }
      if (query.createdAtTo) {
        where.createdAt.lte = new Date(query.createdAtTo);
      }
    }

    // Add all AND conditions if any exist
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        include: { candidates: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.job.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: jobs,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getJob(id: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        client: true,
        interviews: {
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                skills: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async updateJob(id: string, updateJobDto: UpdateJobDto, clientId: string): Promise<Job> {
    // Get current job to check status changes and ownership
    const currentJob = await this.prisma.job.findUnique({
      where: { id },
    });

    if (!currentJob) {
      throw new NotFoundException('Job not found');
    }

    // Check if the client owns this job
    if (currentJob.clientId !== clientId) {
      throw new ForbiddenException('You do not have permission to update this job');
    }

    // Validate salary range
    const minSalary = updateJobDto.minSalary ?? currentJob.minSalary;
    const maxSalary = updateJobDto.maxSalary ?? currentJob.maxSalary;
    if (minSalary !== null && maxSalary !== null && minSalary > maxSalary) {
      throw new BadRequestException('minSalary cannot be greater than maxSalary');
    }

    // Handle status transitions
    const data: any = { ...updateJobDto };

    // Track if status is changing to published
    const isChangingToPublished =
      updateJobDto.status === JobStatus.published &&
      currentJob.status !== JobStatus.published;

    // Set publishedAt when status changes to published
    if (isChangingToPublished && !updateJobDto.publishedAt) {
      data.publishedAt = new Date();
    }

    // Clear publishedAt if status changes away from published
    if (
      updateJobDto.status &&
      updateJobDto.status !== JobStatus.published &&
      currentJob.status === JobStatus.published
    ) {
      data.publishedAt = null;
    }

    // Convert date strings to Date objects
    if (updateJobDto.hiringDeadline !== undefined) {
      data.hiringDeadline = updateJobDto.hiringDeadline
        ? new Date(updateJobDto.hiringDeadline)
        : null;
    }
    if (updateJobDto.publishedAt !== undefined) {
      data.publishedAt = updateJobDto.publishedAt
        ? new Date(updateJobDto.publishedAt)
        : null;
    }
    if (updateJobDto.expiresAt !== undefined) {
      data.expiresAt = updateJobDto.expiresAt
        ? new Date(updateJobDto.expiresAt)
        : null;
    }

    try {
      const updatedJob = await this.prisma.job.update({
        where: { id },
        data,
      });

      // Automatically invite candidates if status changed to published
      if (isChangingToPublished) {
        // Run auto-invite in background (don't wait for it to complete)
        this.autoInviteCandidates(updatedJob.id, clientId, {
          language: 'en',
          type: 'live',
          daysAhead: [3, 5, 7],
          maxCandidates: 10,
        }).catch((error) => {
          console.error('Failed to auto-invite candidates:', error);
          // Don't throw - job update should succeed even if invitations fail
        });
      }

      return updatedJob;
    } catch (error) {
      throw new NotFoundException('Job not found');
    }
  }

  async deleteJob(id: string, clientId: string): Promise<void> {
    // Check if job exists and client owns it
    const job = await this.prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Check if the client owns this job
    if (job.clientId !== clientId) {
      throw new ForbiddenException('You do not have permission to delete this job');
    }

    try {
      await this.prisma.job.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException('Job not found');
    }
  }

  async autoInviteCandidates(
    jobId: string,
    clientId: string,
    options: {
      language?: string;
      type?: string;
      templateId?: string;
      daysAhead?: number[];
      maxCandidates?: number;
    } = {},
  ) {
    return this.autoInviteService.autoInviteCandidates(jobId, clientId, {
      language: options.language as any,
      type: options.type as any,
      templateId: options.templateId,
      daysAhead: options.daysAhead,
      maxCandidates: options.maxCandidates,
    });
  }

  async inviteByEmail(
    jobId: string,
    clientId: string,
    body: {
      email: string;
      firstName?: string;
      lastName?: string;
      externalMeetingUrl?: string;
      language?: string;
      type?: string;
    },
  ) {
    // Validate job exists and user has access
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.clientId !== clientId) {
      throw new ForbiddenException('You do not have permission to invite candidates for this job');
    }

    // Find candidate by email (email is unique globally)
    let candidate = await this.prisma.candidate.findUnique({
      where: {
        email: body.email,
      },
    });

    // Check if User account exists for this email
    let user = await this.prisma.user.findUnique({
      where: { email: body.email },
    });

    let generatedPassword: string | undefined;

    // If no User account exists, create one with auto-generated password
    if (!user) {
      generatedPassword = generateSecurePassword();
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);
      
      user = await this.prisma.user.create({
        data: {
          email: body.email,
          password: hashedPassword,
          firstName: body.firstName || 'Candidate',
          lastName: body.lastName || '',
          phone: null,
          role: UserRole.interviewee,
          isActive: true,
        },
      });
    }

    if (!candidate) {
      // Create new candidate for this job
      candidate = await this.prisma.candidate.create({
        data: {
          email: body.email,
          firstName: body.firstName || 'Candidate',
          lastName: body.lastName || '',
          jobId: jobId,
          skills: [],
          status: CandidateStatus.sourced,
        },
      });
    } else {
      // Candidate exists - update their info and jobId if needed
      const updateData: any = {};
      
      if (body.firstName) {
        updateData.firstName = body.firstName;
      }
      if (body.lastName) {
        updateData.lastName = body.lastName;
      }
      
      // Update jobId if candidate is not already associated with this job
      if (candidate.jobId !== jobId) {
        updateData.jobId = jobId;
      }

      if (Object.keys(updateData).length > 0) {
        candidate = await this.prisma.candidate.update({
          where: { id: candidate.id },
          data: updateData,
        });
      }
    }

    // Generate date options (3, 5, 7 days from now)
    const daysAhead = [3, 5, 7];
    const dateOptions: Array<{ date: string; selected: boolean }> = daysAhead.map((days) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      date.setHours(10, 0, 0, 0); // Set to 10 AM
      return {
        date: date.toISOString(),
        selected: false,
      };
    });

    // Create interview
    const interview = await this.interviewService.createInterview(
      {
        candidateId: candidate.id,
        jobId: job.id,
        language: (body.language as InterviewLanguage) || InterviewLanguage.en,
        type: (body.type as InterviewType) || InterviewType.live,
        allowSelfScheduling: true,
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        externalMeetingUrl: body.externalMeetingUrl,
      },
      clientId,
    );

    // Update interview with date options
    await this.prisma.interview.update({
      where: { id: interview.id },
      data: {
        dateOptions: dateOptions as any,
        invitationSentAt: new Date(),
      },
    });

    // Send email invitation with date options
    const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim() || 'Candidate';
    
    // Check if candidate has resume
    const hasResume = !!candidate.resumeUrl;
    
    await this.emailService.sendInterviewInvitationWithDates(
      candidate.email,
      candidateName,
      job.title,
      interview.id,
      dateOptions.map((opt) => opt.date),
      candidate.id, // Pass candidateId for token generation
      candidate.resumeUrl, // Pass resumeUrl to check if resume exists
      generatedPassword, // Pass generated password if user was just created
    );

    // Update candidate status
    await this.prisma.candidate.update({
      where: { id: candidate.id },
      data: { status: CandidateStatus.contacted },
    });

    return {
      message: 'Invitation sent successfully',
      candidateId: candidate.id,
      interviewId: interview.id,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
    };
  }
}
