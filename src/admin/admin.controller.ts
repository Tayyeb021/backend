import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get('users')
  async listUsers(
    @Query('role') role?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const where: any = {};

    if (role && role !== 'all') {
      where.role = role as UserRole;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === 'active';
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            jobs: true,
            interviews: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users;
  }

  @Patch('users/:userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body() body: { isActive?: boolean; role?: string },
  ) {
    const updateData: any = {};

    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive;
    }

    if (body.role) {
      updateData.role = body.role as UserRole;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  @Get('clients')
  async listClients(
    @Query('year') year?: string,
    @Query('search') search?: string,
  ) {
    const yearNum = year ? parseInt(year, 10) : new Date().getFullYear();
    const startDate = new Date(yearNum, 0, 1);
    const endDate = new Date(yearNum + 1, 0, 1);

    const where: any = {
      role: UserRole.client,
    };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const clients = await this.prisma.user.findMany({
      where,
      include: {
        company: true,
        _count: {
          select: {
            jobs: {
              where: {
                createdAt: {
                  gte: startDate,
                  lt: endDate,
                },
              },
            },
            interviews: {
              where: {
                createdAt: {
                  gte: startDate,
                  lt: endDate,
                },
                status: 'completed',
              },
            },
          },
        },
      },
    });

    const clientsWithStats = clients.map((client) => {
      const openJobs = client._count.jobs;
      const closedJobs = 0; // You may need to calculate this based on job status
      const completedInterviews = client._count.interviews;

      return {
        id: client.id,
        email: client.email,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        isActive: client.isActive,
        createdAt: client.createdAt,
        company: client.company,
        stats: {
          openJobsThisYear: openJobs,
          closedJobsThisYear: closedJobs,
          completedInterviewsThisYear: completedInterviews,
        },
      };
    });

    return {
      year: yearNum,
      clients: clientsWithStats,
    };
  }

  @Get('clients/:clientId/summary')
  async getClientSummary(
    @Param('clientId') clientId: string,
    @Query('year') year?: string,
  ) {
    const yearNum = year ? parseInt(year, 10) : new Date().getFullYear();
    const startDate = new Date(yearNum, 0, 1);
    const endDate = new Date(yearNum + 1, 0, 1);

    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
      include: {
        company: true,
        jobs: {
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          },
          include: {
            _count: {
              select: {
                candidates: true,
                interviews: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new Error('Client not found');
    }

    const openJobs = client.jobs.filter((j) => j.status === 'published').length;
    const closedJobs = client.jobs.filter((j) => j.status === 'closed').length;
    const totalJobs = client.jobs.length;

    const allCandidates = await this.prisma.candidate.findMany({
      where: {
        jobId: {
          in: client.jobs.map((j) => j.id),
        },
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const candidates = allCandidates.length;

    const completedInterviews = await this.prisma.interview.count({
      where: {
        clientId: client.id,
        status: 'completed',
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const candidatesByStatus = await this.prisma.candidate.groupBy({
      by: ['status'],
      where: {
        jobId: {
          in: client.jobs.map((j) => j.id),
        },
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _count: true,
    });

    const candidatesByStatusMap: Record<string, number> = {};
    candidatesByStatus.forEach((item) => {
      candidatesByStatusMap[item.status] = item._count;
    });

    const openJobsWithStats = client.jobs
      .filter((j) => j.status === 'published')
      .map((job) => {
        const interviewsByStatus = job._count.interviews;
        return {
          id: job.id,
          title: job.title,
          status: job.status,
          openings: job.openings || 1,
          createdAt: job.createdAt,
          publishedAt: job.publishedAt,
          candidatesByStatusThisYear: {
            sourced: job._count.candidates || 0,
          },
          interviewsByStatusThisYear: {
            completed: interviewsByStatus || 0,
          },
        };
      });

    return {
      year: yearNum,
      client: {
        id: client.id,
        email: client.email,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        isActive: client.isActive,
        createdAt: client.createdAt,
        company: client.company,
      },
      stats: {
        totalJobsThisYear: totalJobs,
        openJobsThisYear: openJobs,
        closedJobsThisYear: closedJobs,
        totalCandidatesThisYear: candidates,
        completedInterviewsThisYear: completedInterviews,
        candidatesByStatusThisYear: candidatesByStatusMap,
      },
      openJobs: openJobsWithStats,
    };
  }

  @Get('activity')
  async getRecentActivity(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;

    const auditLogs = await this.prisma.auditLog.findMany({
      take: limitNum,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return auditLogs;
  }

  @Get('growth')
  async getGrowthMetrics() {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);
    const lastYear = new Date(now.getFullYear() - 1, 0, 1);

    const [
      usersThisMonth,
      usersLastMonth,
      usersThisYear,
      usersLastYear,
      jobsThisMonth,
      jobsLastMonth,
      interviewsThisMonth,
      interviewsLastMonth,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { createdAt: { gte: thisMonth } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: lastMonth, lt: thisMonth },
        },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: thisYear } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: lastYear, lt: thisYear },
        },
      }),
      this.prisma.job.count({
        where: { createdAt: { gte: thisMonth } },
      }),
      this.prisma.job.count({
        where: {
          createdAt: { gte: lastMonth, lt: thisMonth },
        },
      }),
      this.prisma.interview.count({
        where: { createdAt: { gte: thisMonth } },
      }),
      this.prisma.interview.count({
        where: {
          createdAt: { gte: lastMonth, lt: thisMonth },
        },
      }),
    ]);

    return {
      users: {
        thisMonth: usersThisMonth,
        lastMonth: usersLastMonth,
        thisYear: usersThisYear,
        lastYear: usersLastYear,
        growth: usersLastMonth > 0 ? ((usersThisMonth - usersLastMonth) / usersLastMonth) * 100 : 0,
      },
      jobs: {
        thisMonth: jobsThisMonth,
        lastMonth: jobsLastMonth,
        growth: jobsLastMonth > 0 ? ((jobsThisMonth - jobsLastMonth) / jobsLastMonth) * 100 : 0,
      },
      interviews: {
        thisMonth: interviewsThisMonth,
        lastMonth: interviewsLastMonth,
        growth: interviewsLastMonth > 0 ? ((interviewsThisMonth - interviewsLastMonth) / interviewsLastMonth) * 100 : 0,
      },
    };
  }
}
