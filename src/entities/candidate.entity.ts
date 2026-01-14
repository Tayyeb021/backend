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
import { Job } from './job.entity';
import { Interview } from './interview.entity';

export enum CandidateStatus {
  SOURCED = 'sourced',
  CONTACTED = 'contacted',
  INTERVIEWED = 'interviewed',
  ADVANCED = 'advanced',
  REJECTED = 'rejected',
}

@Entity('candidates')
export class Candidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column('text', { nullable: true })
  resumeUrl: string;

  @Column('jsonb', { nullable: true })
  profileData: Record<string, any>;

  @Column('simple-array', { nullable: true })
  skills: string[];

  @Column({ nullable: true })
  experienceYears: number;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  sourcePlatform: string;

  @Column({
    type: 'enum',
    enum: CandidateStatus,
    default: CandidateStatus.SOURCED,
  })
  status: CandidateStatus;

  @Column('uuid')
  jobId: string;

  @ManyToOne(() => Job, (job) => job.candidates)
  @JoinColumn({ name: 'jobId' })
  job: Job;

  @OneToMany(() => Interview, (interview) => interview.candidate)
  interviews: Interview[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
