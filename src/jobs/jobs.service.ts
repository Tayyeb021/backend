import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Job, JobStatus, Prisma } from '@prisma/client';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobQueryDto } from './dto/job-query.dto';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async createJob(createJobDto: CreateJobDto, clientId: string): Promise<Job> {
    // Validate salary range
    if (createJobDto.minSalary !== undefined && createJobDto.maxSalary !== undefined) {
      if (createJobDto.minSalary > createJobDto.maxSalary) {
        throw new BadRequestException('minSalary cannot be greater than maxSalary');
      }
    }

    // Set publishedAt if status is published
    const data: any = {
      ...createJobDto,
      clientId,
    };

    if (createJobDto.status === JobStatus.published && !createJobDto.publishedAt) {
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

    return await this.prisma.job.create({
      data,
    });
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
      include: { candidates: true, client: true },
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

    // Set publishedAt when status changes to published
    if (
      updateJobDto.status === JobStatus.published &&
      currentJob.status !== JobStatus.published &&
      !updateJobDto.publishedAt
    ) {
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
      return await this.prisma.job.update({
        where: { id },
        data,
      });
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
}
