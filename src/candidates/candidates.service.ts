import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Candidate, CandidateStatus, Prisma } from '@prisma/client';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { WebhookCandidateDto } from './dto/webhook-candidate.dto';
import { AutomationService } from '../automation/automation.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { ResumeParserService } from './services/resume-parser.service';
import {
  normalizeEmail,
  normalizePhone,
  normalizeSkills,
  mergeSkills,
  calculateProfileCompleteness,
  calculateSimilarity,
  isValidEmail,
} from './utils/validation.utils';

@Injectable()
export class CandidatesService {
  constructor(
    private prisma: PrismaService,
    private automationService: AutomationService,
    private r2Service: CloudflareR2Service,
    private resumeParser: ResumeParserService,
  ) {}

  async createCandidate(
    createCandidateDto: CreateCandidateDto,
  ): Promise<Candidate> {
    // Normalize and validate data
    const normalizedData = {
      ...createCandidateDto,
      email: normalizeEmail(createCandidateDto.email),
      phone: createCandidateDto.phone ? normalizePhone(createCandidateDto.phone) : undefined,
      skills: normalizeSkills(createCandidateDto.skills || []),
    };

    // Validate email format
    if (!isValidEmail(normalizedData.email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Check for duplicate email
    const existing = await this.prisma.candidate.findUnique({
      where: { email: normalizedData.email },
    });

    if (existing) {
      throw new BadRequestException(`Candidate with email ${normalizedData.email} already exists`);
    }

    return await this.prisma.candidate.create({
      data: normalizedData,
    });
  }

  async getCandidatesByJob(jobId: string): Promise<Candidate[]> {
    return await this.prisma.candidate.findMany({
      where: { jobId },
      include: { interviews: true, job: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Advanced candidate search with filters
   */
  async searchCandidates(
    query: CandidateQueryDto,
    user?: { id: string; role: string },
  ): Promise<{
    data: Candidate[];
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
    const where: Prisma.CandidateWhereInput = {};

    // Role-based filtering: filter by user's jobs (except for admin)
    if (user && user.role !== 'admin') {
      // Get all job IDs for this user
      const userJobs = await this.prisma.job.findMany({
        where: { clientId: user.id },
        select: { id: true },
      });
      const jobIds = userJobs.map(j => j.id);
      
      // Only show candidates for user's jobs (if they have any jobs)
      if (jobIds.length > 0) {
        // If jobId filter is specified, verify it belongs to user
        if (query.jobId) {
          if (jobIds.includes(query.jobId)) {
            where.jobId = query.jobId;
          } else {
            // Job doesn't belong to user, return empty result
            return {
              data: [],
              meta: {
                total: 0,
                page,
                limit,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
              },
            };
          }
        } else {
          // Filter by all user's jobs
          where.jobId = { in: jobIds };
        }
      } else {
        // User has no jobs, return empty result
        return {
          data: [],
          meta: {
            total: 0,
            page,
            limit,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        };
      }
    } else if (query.jobId) {
      // Admin or no user context, but jobId filter specified
      where.jobId = query.jobId;
    }

    // Text search
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { skills: { hasSome: [query.search] } },
      ];
    }

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Skills filter
    if (query.skills && query.skills.length > 0) {
      where.skills = { hasSome: query.skills };
    }

    // Experience filters
    if (query.minExperienceYears !== undefined || query.maxExperienceYears !== undefined) {
      where.experienceYears = {};
      if (query.minExperienceYears !== undefined) {
        where.experienceYears.gte = query.minExperienceYears;
      }
      if (query.maxExperienceYears !== undefined) {
        where.experienceYears.lte = query.maxExperienceYears;
      }
    }

    // Location filter
    if (query.location) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }

    // Source platform filter
    if (query.sourcePlatform) {
      where.sourcePlatform = query.sourcePlatform;
    }

    // Date range filters
    if (query.createdAtFrom || query.createdAtTo) {
      where.createdAt = {};
      if (query.createdAtFrom) {
        where.createdAt.gte = new Date(query.createdAtFrom);
      }
      if (query.createdAtTo) {
        where.createdAt.lte = new Date(query.createdAtTo);
      }
    }

    // Has resume filter
    if (query.hasResume !== undefined) {
      where.resumeUrl = query.hasResume ? { not: null } : null;
    }

    // Has interview filter
    if (query.hasInterview !== undefined) {
      where.interviews = query.hasInterview
        ? { some: {} }
        : { none: {} };
    }

    const [candidates, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        include: { interviews: true, job: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.candidate.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: candidates,
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

  async getCandidate(id: string): Promise<Candidate> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: { interviews: true, job: true },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    return candidate;
  }

  async updateCandidateStatus(
    id: string,
    status: CandidateStatus,
    userId?: string,
  ): Promise<Candidate> {
    try {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id },
        include: { job: true },
      });

      if (!candidate) {
        throw new NotFoundException('Candidate not found');
      }

      const oldStatus = candidate.status;
      const updated = await this.prisma.candidate.update({
        where: { id },
        data: { status },
      });

      // Trigger automation for candidate_status_changed
      if (oldStatus !== status) {
        this.automationService.executeAutomation('candidate_status_changed', {
          candidateId: id,
          candidateEmail: candidate.email,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          jobId: candidate.jobId,
          jobTitle: candidate.job.title,
          userId: userId,
          oldStatus: oldStatus,
          newStatus: status,
        }).catch(error => {
          console.error('Error executing automation for candidate_status_changed:', error);
        });
      }

      return updated;
    } catch (error) {
      throw new NotFoundException('Candidate not found');
    }
  }

  async updateCandidate(
    id: string,
    updateCandidateDto: UpdateCandidateDto,
  ): Promise<Candidate> {
    try {
      // Normalize data if provided
      const normalizedData: any = { ...updateCandidateDto };
      
      if (normalizedData.email) {
        normalizedData.email = normalizeEmail(normalizedData.email);
      }
      if (normalizedData.phone) {
        normalizedData.phone = normalizePhone(normalizedData.phone);
      }
      if (normalizedData.skills) {
        normalizedData.skills = normalizeSkills(normalizedData.skills);
      }

      return await this.prisma.candidate.update({
        where: { id },
        data: normalizedData,
      });
    } catch (error) {
      throw new NotFoundException('Candidate not found');
    }
  }

  /**
   * Find duplicate candidates
   */
  async findDuplicates(email: string): Promise<Candidate[]> {
    // Find exact match
    const exactMatch = await this.prisma.candidate.findUnique({
      where: { email: normalizeEmail(email) },
    });

    const duplicates: Candidate[] = [];
    if (exactMatch) {
      duplicates.push(exactMatch);
    }

    // Find similar candidates by name/phone
    const normalizedEmail = normalizeEmail(email);
    const allCandidates = await this.prisma.candidate.findMany({
      where: {
        email: { not: normalizedEmail },
      },
    });

    // Check for similar emails (fuzzy matching)
    for (const candidate of allCandidates) {
      const similarity = calculateSimilarity(
        normalizeEmail(candidate.email),
        normalizedEmail,
      );
      if (similarity > 0.8) {
        duplicates.push(candidate);
      }
    }

    return duplicates;
  }

  /**
   * Upload and parse resume
   */
  async uploadResume(
    candidateId: string,
    file: {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<Candidate> {
    const candidate = await this.getCandidate(candidateId);

    // Upload resume to R2
    const resumeUrl = await this.r2Service.uploadResume(
      candidateId,
      file.buffer,
      file.mimetype,
    );

    // Extract text from resume
    const text = await this.resumeParser.extractTextFromResume(
      file.buffer,
      file.mimetype,
    );

    // Parse resume with AI
    const parsedData = await this.resumeParser.parseResume(text);

    // Merge parsed data with existing candidate data
    const updatedData: any = {
      resumeUrl,
      skills: mergeSkills(candidate.skills, parsedData.skills),
      profileData: {
        ...(candidate.profileData as any || {}),
        ...parsedData,
        resumeParsedAt: new Date().toISOString(),
      },
    };

    // Update fields only if they're missing or empty
    if (parsedData.firstName && !candidate.firstName) {
      updatedData.firstName = parsedData.firstName;
    }
    if (parsedData.lastName && !candidate.lastName) {
      updatedData.lastName = parsedData.lastName;
    }
    if (parsedData.phone && !candidate.phone) {
      updatedData.phone = normalizePhone(parsedData.phone);
    }
    if (parsedData.location && !candidate.location) {
      updatedData.location = parsedData.location;
    }
    if (parsedData.experienceYears && !candidate.experienceYears) {
      updatedData.experienceYears = parsedData.experienceYears;
    }

    return await this.prisma.candidate.update({
      where: { id: candidateId },
      data: updatedData,
    });
  }

  /**
   * Enroll candidate from webhook
   */
  async enrollFromWebhook(
    data: WebhookCandidateDto,
    webhookSecret?: string,
  ): Promise<Candidate> {
    // Verify webhook secret if provided
    if (webhookSecret && webhookSecret !== process.env.WEBHOOK_SECRET) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    // Validate email
    if (!isValidEmail(data.email)) {
      throw new BadRequestException('Invalid email format');
    }

    const normalizedEmail = normalizeEmail(data.email);

    // Find or create candidate
    let candidate = await this.prisma.candidate.findUnique({
      where: { email: normalizedEmail },
    });

    if (!candidate) {
      if (!data.jobId) {
        throw new BadRequestException('jobId is required for new candidates');
      }

      candidate = await this.prisma.candidate.create({
        data: {
          email: normalizedEmail,
          firstName: data.firstName || 'Candidate',
          lastName: data.lastName || '',
          phone: data.phone ? normalizePhone(data.phone) : undefined,
          jobId: data.jobId,
          skills: normalizeSkills(data.skills || []),
          experienceYears: data.experienceYears,
          location: data.location,
          sourcePlatform: data.sourcePlatform || 'webhook',
          status: CandidateStatus.sourced,
          resumeUrl: data.resumeUrl,
        },
      });
    } else {
      // Update existing candidate
      const updateData: any = {};
      if (data.firstName) updateData.firstName = data.firstName;
      if (data.lastName) updateData.lastName = data.lastName;
      if (data.phone) updateData.phone = normalizePhone(data.phone);
      if (data.location) updateData.location = data.location;
      if (data.skills) {
        updateData.skills = mergeSkills(candidate.skills, data.skills);
      }
      if (data.experienceYears) updateData.experienceYears = data.experienceYears;
      if (data.jobId && candidate.jobId !== data.jobId) {
        updateData.jobId = data.jobId;
      }
      if (data.resumeUrl) updateData.resumeUrl = data.resumeUrl;

      if (Object.keys(updateData).length > 0) {
        candidate = await this.prisma.candidate.update({
          where: { id: candidate.id },
          data: updateData,
        });
      }
    }

    // Handle resume file if provided
    if (data.resumeFile) {
      try {
        const buffer = Buffer.from(data.resumeFile, 'base64');
        const resumeUrl = await this.r2Service.uploadResume(
          candidate.id,
          buffer,
          'application/pdf',
        );

        // Parse resume
        const text = await this.resumeParser.extractTextFromResume(
          buffer,
          'application/pdf',
        );
        const parsedData = await this.resumeParser.parseResume(text);

        // Update candidate with parsed data
        candidate = await this.prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            resumeUrl,
            skills: mergeSkills(candidate.skills, parsedData.skills),
            experienceYears: parsedData.experienceYears || candidate.experienceYears,
            location: parsedData.location || candidate.location,
            profileData: {
              ...(candidate.profileData as any || {}),
              ...parsedData,
              resumeParsedAt: new Date().toISOString(),
            },
          },
        });
      } catch (error: any) {
        console.error('Failed to process resume file:', error);
        // Don't throw - candidate was created successfully
      }
    }

    return candidate;
  }

  /**
   * Calculate profile completeness score
   */
  async getProfileCompleteness(candidateId: string): Promise<number> {
    const candidate = await this.getCandidate(candidateId);
    return calculateProfileCompleteness(candidate);
  }

  /**
   * Generate secure token for resume upload (public access)
   */
  async generateResumeUploadToken(candidateId: string, interviewId: string): Promise<string> {
    const crypto = require('crypto');
    const data = `${candidateId}:${interviewId}:${Date.now()}`;
    const secret = process.env.RESUME_UPLOAD_SECRET || process.env.JWT_SECRET || 'default-secret';
    const token = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
    
    // Store token in candidate profileData with expiry (24 hours)
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        profileData: {
          ...(candidate.profileData as any || {}),
          resumeUploadToken: token,
          resumeUploadTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          resumeUploadInterviewId: interviewId,
        },
      },
    });
    
    return token;
  }

  /**
   * Verify resume upload token and return candidate
   * Note: Since Prisma doesn't support efficient JSON field queries,
   * we fetch candidates and filter. For better performance with large datasets,
   * consider storing tokens in a separate table.
   */
  async verifyResumeUploadToken(token: string) {
    // Find candidate by token in profileData
    // We need to fetch candidates and filter since Prisma JSON queries are limited
    const candidates = await this.prisma.candidate.findMany({
      include: {
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        interviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
          },
        },
      },
      take: 1000, // Limit to prevent performance issues
    });

    // Filter candidates with matching token
    const candidate = candidates.find((c) => {
      const profileData = c.profileData as any;
      return profileData?.resumeUploadToken === token;
    });

    if (!candidate) {
      throw new NotFoundException('Invalid or expired token');
    }

    // Check expiry
    const profileData = candidate.profileData as any;
    const expiry = profileData?.resumeUploadTokenExpiry;
    if (expiry && new Date(expiry) < new Date()) {
      throw new BadRequestException('Token has expired. Please request a new invitation.');
    }

    return candidate;
  }

  /**
   * Upload resume using token (public endpoint)
   */
  async getCandidateStatusByEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);
    
    const candidate = await this.prisma.candidate.findFirst({
      where: { email: normalizedEmail },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
        interviews: {
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            completedAt: true,
            type: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        assessments: {
          select: {
            id: true,
            status: true,
            score: true,
            question: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!candidate) {
      throw new NotFoundException('No application found for this email');
    }

    return candidate;
  }

  async uploadResumeByToken(token: string, file: Express.Multer.File) {
    const candidate = await this.verifyResumeUploadToken(token);
    
    // Upload and parse resume
    const updatedCandidate = await this.uploadResume(candidate.id, file);
    
    // Get interview ID from token data
    const profileData = candidate.profileData as any;
    const interviewId = profileData?.resumeUploadInterviewId;
    
    return {
      success: true,
      message: 'Resume uploaded successfully',
      candidateId: candidate.id,
      interviewId: interviewId,
      redirectUrl: interviewId 
        ? `/interview/schedule/${interviewId}`
        : null,
    };
  }
}
