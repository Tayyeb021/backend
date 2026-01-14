import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Candidate } from './candidate.entity';

export enum JobStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  CLOSED = 'closed',
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column('simple-array')
  requiredSkills: string[];

  @Column()
  experienceLevel: string;

  @Column()
  location: string;

  @Column({ nullable: true })
  salaryRange: string;

  @Column({
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.DRAFT,
  })
  status: JobStatus;

  @Column('uuid')
  recruiterId: string;

  @ManyToOne(() => User, (user) => user.jobs)
  @JoinColumn({ name: 'recruiterId' })
  recruiter: User;

  @OneToMany(() => Candidate, (candidate) => candidate.job)
  candidates: Candidate[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
