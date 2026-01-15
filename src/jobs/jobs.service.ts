import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Job, JobStatus } from '@prisma/client';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async createJob(createJobDto: CreateJobDto, clientId: string): Promise<Job> {
    return await this.prisma.job.create({
      data: {
        ...createJobDto,
        clientId,
      },
    });
  }

  async getJobsByClient(clientId: string): Promise<Job[]> {
    return await this.prisma.job.findMany({
      where: { clientId },
      include: { candidates: true },
      orderBy: { createdAt: 'desc' },
    });
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

  async updateJob(id: string, updateJobDto: UpdateJobDto): Promise<Job> {
    try {
      return await this.prisma.job.update({
        where: { id },
        data: updateJobDto,
      });
    } catch (error) {
      throw new NotFoundException('Job not found');
    }
  }

  async deleteJob(id: string): Promise<void> {
    try {
      await this.prisma.job.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException('Job not found');
    }
  }
}
