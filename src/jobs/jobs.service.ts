import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus } from '../entities/job.entity';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
  ) {}

  async createJob(createJobDto: CreateJobDto, recruiterId: string): Promise<Job> {
    const job = this.jobRepository.create({
      ...createJobDto,
      recruiterId,
    });

    return await this.jobRepository.save(job);
  }

  async getJobsByRecruiter(recruiterId: string): Promise<Job[]> {
    return await this.jobRepository.find({
      where: { recruiterId },
      relations: ['candidates'],
      order: { createdAt: 'DESC' },
    });
  }

  async getJob(id: string): Promise<Job> {
    const job = await this.jobRepository.findOne({
      where: { id },
      relations: ['candidates', 'recruiter'],
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async updateJob(id: string, updateJobDto: UpdateJobDto): Promise<Job> {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    Object.assign(job, updateJobDto);
    return await this.jobRepository.save(job);
  }

  async deleteJob(id: string): Promise<void> {
    const result = await this.jobRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException('Job not found');
    }
  }
}
