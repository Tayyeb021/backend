import {
  PrismaClient,
  CandidateStatus,
  JobStatus,
  JobType,
  WorkMode,
  ExperienceLevel,
  SeniorityLevel,
  EngagementType,
  UserRole,
  InterviewStatus,
  InterviewType,
  InterviewLanguage,
  QuestionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive seed...\n');

  // ============================================
  // 1. CREATE TEST CLIENT USER
  // ============================================
  let testClient = await prisma.user.findFirst({
    where: { email: 'testclient@example.com' },
  });

  if (!testClient) {
    console.log('📝 Creating test client user...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    testClient = await prisma.user.create({
      data: {
        email: 'testclient@example.com',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'Client',
        phone: '+971501234567',
        role: UserRole.client,
      },
    });
    console.log('✅ Test client created:', testClient.email);
  } else {
    console.log('✅ Test client already exists:', testClient.email);
  }

  // ============================================
  // 2. CREATE TEST JOBS
  // ============================================
  console.log('\n📋 Creating test jobs...');
  const testJobs = [
    {
      title: 'Senior Full Stack Developer',
      description: 'We are looking for an experienced Full Stack Developer to join our team. You will be responsible for developing and maintaining web applications using modern technologies.',
      requiredSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
      experienceLevel: ExperienceLevel.five_plus,
      seniorityLevel: SeniorityLevel.senior,
      jobType: JobType.full_time,
      engagementLength: EngagementType.long_term,
      workMode: WorkMode.remote,
      country: 'UAE',
      timezone: 'Asia/Dubai',
      minSalary: 15000,
      maxSalary: 25000,
      currency: 'AED',
      openings: 2,
      status: JobStatus.published,
      publishedAt: new Date(),
    },
    {
      title: 'Frontend Developer',
      description: 'Join our team as a Frontend Developer and help build beautiful, responsive user interfaces. Experience with React and modern CSS frameworks required.',
      requiredSkills: ['React', 'TypeScript', 'CSS', 'HTML', 'Tailwind CSS', 'Next.js'],
      experienceLevel: ExperienceLevel.three_to_five,
      seniorityLevel: SeniorityLevel.mid,
      jobType: JobType.full_time,
      engagementLength: EngagementType.long_term,
      workMode: WorkMode.hybrid,
      country: 'UAE',
      timezone: 'Asia/Dubai',
      minSalary: 8000,
      maxSalary: 12000,
      currency: 'AED',
      openings: 3,
      status: JobStatus.published,
      publishedAt: new Date(),
    },
    {
      title: 'Backend Developer',
      description: 'We need a Backend Developer to design and implement scalable APIs and microservices. Strong experience with Node.js and databases required.',
      requiredSkills: ['Node.js', 'Express', 'PostgreSQL', 'MongoDB', 'Redis', 'Docker'],
      experienceLevel: ExperienceLevel.three_to_five,
      seniorityLevel: SeniorityLevel.mid,
      jobType: JobType.full_time,
      engagementLength: EngagementType.long_term,
      workMode: WorkMode.remote,
      country: 'UAE',
      timezone: 'Asia/Dubai',
      minSalary: 10000,
      maxSalary: 15000,
      currency: 'AED',
      openings: 2,
      status: JobStatus.published,
      publishedAt: new Date(),
    },
    {
      title: 'DevOps Engineer',
      description: 'Looking for a DevOps Engineer to manage our cloud infrastructure and CI/CD pipelines. Experience with AWS, Kubernetes, and Terraform preferred.',
      requiredSkills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
      experienceLevel: ExperienceLevel.five_plus,
      seniorityLevel: SeniorityLevel.senior,
      jobType: JobType.full_time,
      engagementLength: EngagementType.long_term,
      workMode: WorkMode.remote,
      country: 'UAE',
      timezone: 'Asia/Dubai',
      minSalary: 12000,
      maxSalary: 18000,
      currency: 'AED',
      openings: 1,
      status: JobStatus.published,
      publishedAt: new Date(),
    },
    {
      title: 'UI/UX Designer',
      description: 'Join our design team to create beautiful and intuitive user experiences. Strong portfolio and experience with Figma required.',
      requiredSkills: ['Figma', 'Adobe XD', 'User Research', 'Prototyping', 'Design Systems'],
      experienceLevel: ExperienceLevel.three_to_five,
      seniorityLevel: SeniorityLevel.mid,
      jobType: JobType.full_time,
      engagementLength: EngagementType.long_term,
      workMode: WorkMode.hybrid,
      country: 'UAE',
      timezone: 'Asia/Dubai',
      minSalary: 7000,
      maxSalary: 11000,
      currency: 'AED',
      openings: 2,
      status: JobStatus.published,
      publishedAt: new Date(),
    },
  ];

  const createdJobs = [];
  for (const jobData of testJobs) {
    const existingJob = await prisma.job.findFirst({
      where: {
        title: jobData.title,
        clientId: testClient.id,
      },
    });

    if (!existingJob) {
      const job = await prisma.job.create({
        data: {
          ...jobData,
          clientId: testClient.id,
        },
      });
      createdJobs.push(job);
      console.log(`   ✅ Created job: ${job.title}`);
    } else {
      createdJobs.push(existingJob);
      console.log(`   ⏭️  Job already exists: ${existingJob.title}`);
    }
  }

  // ============================================
  // 3. CREATE TEST CANDIDATES
  // ============================================
  console.log('\n👥 Creating test candidates...');
  const testCandidates = [
    // Senior Full Stack Developer candidates
    {
      firstName: 'Ahmed',
      lastName: 'Al-Mansoori',
      email: 'ahmed.almansoori@example.com',
      phone: '+971501111111',
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'Docker'],
      experienceYears: 7,
      location: 'Dubai, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.sourced,
      jobId: createdJobs[0].id,
    },
    {
      firstName: 'Fatima',
      lastName: 'Hassan',
      email: 'fatima.hassan@example.com',
      phone: '+971502222222',
      skills: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'MongoDB'],
      experienceYears: 6,
      location: 'Abu Dhabi, UAE',
      sourcePlatform: 'Indeed',
      status: CandidateStatus.contacted,
      jobId: createdJobs[0].id,
    },
    {
      firstName: 'Mohammed',
      lastName: 'Ibrahim',
      email: 'mohammed.ibrahim@example.com',
      phone: '+971503333333',
      skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'GraphQL'],
      experienceYears: 8,
      location: 'Sharjah, UAE',
      sourcePlatform: 'Company Website',
      status: CandidateStatus.interviewed,
      jobId: createdJobs[0].id,
    },
    // Frontend Developer candidates
    {
      firstName: 'Sarah',
      lastName: 'Al-Zahra',
      email: 'sarah.alzahra@example.com',
      phone: '+971504444444',
      skills: ['React', 'TypeScript', 'CSS', 'HTML', 'Tailwind CSS', 'Next.js', 'Redux'],
      experienceYears: 4,
      location: 'Dubai, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.sourced,
      jobId: createdJobs[1].id,
    },
    {
      firstName: 'Omar',
      lastName: 'Khalil',
      email: 'omar.khalil@example.com',
      phone: '+971505555555',
      skills: ['React', 'Vue.js', 'TypeScript', 'CSS', 'SASS', 'Webpack'],
      experienceYears: 3,
      location: 'Dubai, UAE',
      sourcePlatform: 'Indeed',
      status: CandidateStatus.contacted,
      jobId: createdJobs[1].id,
    },
    {
      firstName: 'Layla',
      lastName: 'Mahmoud',
      email: 'layla.mahmoud@example.com',
      phone: '+971506666666',
      skills: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS', 'Framer Motion'],
      experienceYears: 5,
      location: 'Abu Dhabi, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.interviewed,
      jobId: createdJobs[1].id,
    },
    {
      firstName: 'Yusuf',
      lastName: 'Ali',
      email: 'yusuf.ali@example.com',
      phone: '+971507777777',
      skills: ['React', 'JavaScript', 'CSS', 'HTML', 'Bootstrap', 'Material-UI'],
      experienceYears: 2,
      location: 'Dubai, UAE',
      sourcePlatform: 'Company Website',
      status: CandidateStatus.sourced,
      jobId: createdJobs[1].id,
    },
    // Backend Developer candidates
    {
      firstName: 'Hassan',
      lastName: 'Rashid',
      email: 'hassan.rashid@example.com',
      phone: '+971508888888',
      skills: ['Node.js', 'Express', 'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'AWS'],
      experienceYears: 5,
      location: 'Dubai, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.sourced,
      jobId: createdJobs[2].id,
    },
    {
      firstName: 'Aisha',
      lastName: 'Noor',
      email: 'aisha.noor@example.com',
      phone: '+971509999999',
      skills: ['Node.js', 'NestJS', 'PostgreSQL', 'TypeScript', 'GraphQL', 'Docker'],
      experienceYears: 4,
      location: 'Dubai, UAE',
      sourcePlatform: 'Indeed',
      status: CandidateStatus.contacted,
      jobId: createdJobs[2].id,
    },
    {
      firstName: 'Khalid',
      lastName: 'Saeed',
      email: 'khalid.saeed@example.com',
      phone: '+971501010101',
      skills: ['Node.js', 'Express', 'MongoDB', 'Redis', 'RabbitMQ', 'Microservices'],
      experienceYears: 6,
      location: 'Abu Dhabi, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.interviewed,
      jobId: createdJobs[2].id,
    },
    // DevOps Engineer candidates
    {
      firstName: 'Tariq',
      lastName: 'Malik',
      email: 'tariq.malik@example.com',
      phone: '+971501111222',
      skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux', 'Jenkins'],
      experienceYears: 7,
      location: 'Dubai, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.sourced,
      jobId: createdJobs[3].id,
    },
    {
      firstName: 'Noor',
      lastName: 'Ahmed',
      email: 'noor.ahmed@example.com',
      phone: '+971501111333',
      skills: ['AWS', 'Azure', 'Kubernetes', 'Docker', 'Terraform', 'Ansible'],
      experienceYears: 6,
      location: 'Dubai, UAE',
      sourcePlatform: 'Company Website',
      status: CandidateStatus.contacted,
      jobId: createdJobs[3].id,
    },
    // UI/UX Designer candidates
    {
      firstName: 'Zainab',
      lastName: 'Farid',
      email: 'zainab.farid@example.com',
      phone: '+971501111444',
      skills: ['Figma', 'Adobe XD', 'User Research', 'Prototyping', 'Design Systems', 'Sketch'],
      experienceYears: 4,
      location: 'Dubai, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.sourced,
      jobId: createdJobs[4].id,
    },
    {
      firstName: 'Rashid',
      lastName: 'Hamdan',
      email: 'rashid.hamdan@example.com',
      phone: '+971501111555',
      skills: ['Figma', 'Adobe XD', 'User Research', 'Prototyping', 'Illustrator', 'Photoshop'],
      experienceYears: 5,
      location: 'Dubai, UAE',
      sourcePlatform: 'Indeed',
      status: CandidateStatus.contacted,
      jobId: createdJobs[4].id,
    },
    {
      firstName: 'Mariam',
      lastName: 'Salem',
      email: 'mariam.salem@example.com',
      phone: '+971501111666',
      skills: ['Figma', 'User Research', 'Prototyping', 'Design Systems', 'User Testing'],
      experienceYears: 3,
      location: 'Abu Dhabi, UAE',
      sourcePlatform: 'LinkedIn',
      status: CandidateStatus.interviewed,
      jobId: createdJobs[4].id,
    },
  ];

  const createdCandidates = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const candidateData of testCandidates) {
    const existingCandidate = await prisma.candidate.findUnique({
      where: { email: candidateData.email },
    });

    if (!existingCandidate) {
      const candidate = await prisma.candidate.create({
        data: candidateData,
      });
      createdCandidates.push(candidate);
      createdCount++;
      console.log(`   ✅ Created candidate: ${candidateData.firstName} ${candidateData.lastName}`);
    } else {
      createdCandidates.push(existingCandidate);
      skippedCount++;
      console.log(`   ⏭️  Candidate already exists: ${candidateData.email}`);
    }
  }

  // ============================================
  // 4. CREATE INTERVIEW TEMPLATES
  // ============================================
  console.log('\n📝 Creating interview templates...');
  
  const templates = [
    {
      name: 'Standard Technical Interview',
      description: 'A comprehensive technical interview template covering coding, system design, and problem-solving skills.',
      isDefault: true,
      isPublic: false,
      questions: [
        {
          question: 'Tell me about yourself and your experience with full-stack development.',
          type: QuestionType.behavioral,
          order: 0,
          timeLimit: 180,
        },
        {
          question: 'Explain the difference between REST and GraphQL APIs. When would you use each?',
          type: QuestionType.technical,
          order: 1,
          timeLimit: 240,
        },
        {
          question: 'How would you design a scalable microservices architecture for an e-commerce platform?',
          type: QuestionType.system_design,
          order: 2,
          timeLimit: 600,
        },
        {
          question: 'Write a function to find the longest common prefix among an array of strings.',
          type: QuestionType.coding,
          order: 3,
          timeLimit: 300,
        },
        {
          question: 'Describe a challenging project you worked on and how you overcame obstacles.',
          type: QuestionType.situational,
          order: 4,
          timeLimit: 240,
        },
      ],
    },
    {
      name: 'Frontend Developer Interview',
      description: 'Template specifically designed for frontend developer positions.',
      isDefault: false,
      isPublic: false,
      questions: [
        {
          question: 'What is your experience with React and modern frontend frameworks?',
          type: QuestionType.behavioral,
          order: 0,
          timeLimit: 180,
        },
        {
          question: 'Explain React hooks and when you would use useMemo vs useCallback.',
          type: QuestionType.technical,
          order: 1,
          timeLimit: 300,
        },
        {
          question: 'How do you handle state management in large React applications?',
          type: QuestionType.technical,
          order: 2,
          timeLimit: 240,
        },
        {
          question: 'Describe your approach to responsive design and CSS architecture.',
          type: QuestionType.technical,
          order: 3,
          timeLimit: 240,
        },
        {
          question: 'How do you ensure accessibility in your frontend applications?',
          type: QuestionType.cultural_fit,
          order: 4,
          timeLimit: 180,
        },
      ],
    },
    {
      name: 'Backend Developer Interview',
      description: 'Template for backend developer positions focusing on API design and database optimization.',
      isDefault: false,
      isPublic: false,
      questions: [
        {
          question: 'Tell me about your experience building RESTful APIs.',
          type: QuestionType.behavioral,
          order: 0,
          timeLimit: 180,
        },
        {
          question: 'Explain database indexing and how it improves query performance.',
          type: QuestionType.technical,
          order: 1,
          timeLimit: 240,
        },
        {
          question: 'How would you implement authentication and authorization in a microservices architecture?',
          type: QuestionType.system_design,
          order: 2,
          timeLimit: 480,
        },
        {
          question: 'Write a function to implement rate limiting for an API endpoint.',
          type: QuestionType.coding,
          order: 3,
          timeLimit: 300,
        },
        {
          question: 'How do you handle database migrations in production environments?',
          type: QuestionType.situational,
          order: 4,
          timeLimit: 240,
        },
      ],
    },
  ];

  const createdTemplates = [];
  for (const templateData of templates) {
    const existingTemplate = await prisma.interviewTemplate.findFirst({
      where: {
        name: templateData.name,
        clientId: testClient.id,
      },
    });

    if (!existingTemplate) {
      const { questions, ...templateInfo } = templateData;
      const template = await prisma.interviewTemplate.create({
        data: {
          ...templateInfo,
          clientId: testClient.id,
          questions: {
            create: questions,
          },
        },
        include: { questions: true },
      });
      createdTemplates.push(template);
      console.log(`   ✅ Created template: ${template.name} (${questions.length} questions)`);
    } else {
      createdTemplates.push(existingTemplate);
      console.log(`   ⏭️  Template already exists: ${existingTemplate.name}`);
    }
  }

  // ============================================
  // 5. CREATE TEST INTERVIEWS
  // ============================================
  console.log('\n🎤 Creating test interviews...');
  
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(10, 0, 0, 0);

  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);
  lastWeek.setHours(15, 0, 0, 0);

  const interviews = [
    // Scheduled interview (live)
    {
      candidateId: createdCandidates[1].id, // Fatima Hassan
      jobId: createdJobs[0].id,
      clientId: testClient.id,
      status: InterviewStatus.scheduled,
      type: InterviewType.live,
      language: InterviewLanguage.en,
      scheduledAt: tomorrow,
      templateId: createdTemplates[0].id,
      allowSelfScheduling: false,
    },
    // Completed interview (with scores)
    {
      candidateId: createdCandidates[2].id, // Mohammed Ibrahim
      jobId: createdJobs[0].id,
      clientId: testClient.id,
      status: InterviewStatus.completed,
      type: InterviewType.live,
      language: InterviewLanguage.en,
      scheduledAt: lastWeek,
      startedAt: lastWeek,
      completedAt: new Date(lastWeek.getTime() + 45 * 60 * 1000),
      templateId: createdTemplates[0].id,
      scores: {
        overall: 8.5,
        technical: 9.0,
        communication: 8.0,
        problemSolving: 8.5,
        culturalFit: 8.5,
      },
      aiSummary: 'Mohammed demonstrated strong technical skills and excellent problem-solving abilities. He showed deep understanding of full-stack development and provided clear explanations. Recommended for next round.',
      allowSelfScheduling: false,
    },
    // Pending candidate response (on-demand with date options)
    {
      candidateId: createdCandidates[0].id, // Ahmed Al-Mansoori
      jobId: createdJobs[0].id,
      clientId: testClient.id,
      status: InterviewStatus.pending_candidate_response,
      type: InterviewType.on_demand,
      language: InterviewLanguage.en,
      templateId: createdTemplates[0].id,
      allowSelfScheduling: true,
      deadline: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      invitationSentAt: now,
      dateOptions: [
        { date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), selected: false },
        { date: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(), selected: false },
        { date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), selected: false },
      ],
    },
    // Scheduled interview (frontend)
    {
      candidateId: createdCandidates[4].id, // Layla Mahmoud
      jobId: createdJobs[1].id,
      clientId: testClient.id,
      status: InterviewStatus.scheduled,
      type: InterviewType.live,
      language: InterviewLanguage.en,
      scheduledAt: nextWeek,
      templateId: createdTemplates[1].id,
      allowSelfScheduling: false,
    },
    // Completed interview (frontend)
    {
      candidateId: createdCandidates[3].id, // Sarah Al-Zahra
      jobId: createdJobs[1].id,
      clientId: testClient.id,
      status: InterviewStatus.completed,
      type: InterviewType.live,
      language: InterviewLanguage.en,
      scheduledAt: new Date(lastWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
      startedAt: new Date(lastWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
      completedAt: new Date(lastWeek.getTime() + 2 * 24 * 60 * 60 * 1000 + 40 * 60 * 1000),
      templateId: createdTemplates[1].id,
      scores: {
        overall: 7.8,
        technical: 8.0,
        communication: 7.5,
        problemSolving: 8.0,
        culturalFit: 7.5,
      },
      aiSummary: 'Sarah showed good understanding of React and modern frontend practices. Her communication was clear and she demonstrated solid problem-solving skills. Good candidate for the role.',
      allowSelfScheduling: false,
    },
    // Backend interview (scheduled)
    {
      candidateId: createdCandidates[7].id, // Aisha Noor
      jobId: createdJobs[2].id,
      clientId: testClient.id,
      status: InterviewStatus.scheduled,
      type: InterviewType.live,
      language: InterviewLanguage.en,
      scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      templateId: createdTemplates[2].id,
      allowSelfScheduling: false,
    },
  ];

  let interviewCreatedCount = 0;
  let interviewSkippedCount = 0;

  for (const interviewData of interviews) {
    const existingInterview = await prisma.interview.findFirst({
      where: {
        candidateId: interviewData.candidateId,
        jobId: interviewData.jobId,
        clientId: testClient.id,
      },
    });

    if (!existingInterview) {
      await prisma.interview.create({
        data: interviewData,
      });
      interviewCreatedCount++;
      const candidate = createdCandidates.find(c => c.id === interviewData.candidateId);
      console.log(`   ✅ Created interview: ${candidate?.firstName} ${candidate?.lastName} - ${InterviewStatus[interviewData.status]}`);
    } else {
      interviewSkippedCount++;
      console.log(`   ⏭️  Interview already exists`);
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(50));
  console.log('📊 SEED SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Test Client: ${testClient.email}`);
  console.log(`✅ Jobs: ${createdJobs.length} (${createdJobs.filter((_, i) => i < createdJobs.length).length} created)`);
  console.log(`✅ Candidates: ${createdCount} created, ${skippedCount} skipped (Total: ${createdCandidates.length})`);
  console.log(`✅ Interview Templates: ${createdTemplates.length} (with ${createdTemplates.reduce((sum, t) => sum + t.questions.length, 0)} total questions)`);
  console.log(`✅ Interviews: ${interviewCreatedCount} created, ${interviewSkippedCount} skipped`);
  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📝 Test Credentials:');
  console.log(`   Email: testclient@example.com`);
  console.log(`   Password: password123`);
  console.log('='.repeat(50));
}

main()
  .catch((e) => {
    console.error('\n❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
