import path from 'node:path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import {
  Prisma,
  PrismaClient,
  type Category,
  type Difficulty,
} from '@prisma/client';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const prisma = new PrismaClient();
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

interface SeedQuestion {
  questionText: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  category: Category;
  difficulty: Difficulty;
}

/**
 * Ten corporate aptitude questions: three provided samples (answers unchanged)
 * plus seven original questions, balanced so each category has at least three.
 */
const questions: SeedQuestion[] = [
  // ---- Provided sample questions ----
  {
    questionText:
      "A subscription business plans a 20% price increase. What is the largest share of its customers it can lose before monthly revenue falls below today's level?",
    options: ['16.7%', '20%', '15%', '18.3%'],
    correctOptionIndex: 0,
    category: 'QUANTITATIVE',
    difficulty: 'MEDIUM',
  },
  {
    questionText:
      'Six client meetings (P, Q, R, S, T, U) are scheduled Monday to Saturday, one per day. S is on Wednesday. R is the day immediately before U, and U is not on Saturday. Q is later in the week than both P and T. T is not on Monday. Which of the following must be true?',
    options: [
      'P is on Monday',
      'Q is on Saturday',
      'R is on Thursday',
      'T is on Tuesday',
    ],
    correctOptionIndex: 1,
    category: 'LOGICAL',
    difficulty: 'HARD',
  },
  {
    questionText: 'Choose the grammatically correct sentence for a project update.',
    options: [
      'Neither the manager nor the analysts was aware of the change.',
      'Neither the analysts nor the manager were aware of the change.',
      'Neither the manager nor the analysts were aware of the change.',
      'Neither the manager or the analysts were aware of the change.',
    ],
    correctOptionIndex: 2,
    category: 'VERBAL',
    difficulty: 'EASY',
  },

  // ---- Additional original questions ----
  {
    questionText:
      'A team completes 60% of a project in 12 days. At the same rate, how many total days will the project take?',
    options: ['18 days', '20 days', '24 days', '30 days'],
    correctOptionIndex: 1,
    category: 'QUANTITATIVE',
    difficulty: 'EASY',
  },
  {
    questionText:
      'The ratio of male to female employees in an office is 5:3. If the office has 64 employees, how many are female?',
    options: ['20', '24', '32', '40'],
    correctOptionIndex: 1,
    category: 'QUANTITATIVE',
    difficulty: 'MEDIUM',
  },
  {
    questionText:
      'A sum of money doubles in 8 years at simple interest. What is the annual rate of interest?',
    options: ['8%', '10%', '12.5%', '15%'],
    correctOptionIndex: 2,
    category: 'QUANTITATIVE',
    difficulty: 'HARD',
  },
  {
    questionText:
      'If every auditor is detail-oriented and no detail-oriented person is careless, which statement must be true?',
    options: [
      'Some auditors are careless.',
      'No auditor is careless.',
      'All careless people are auditors.',
      'Some detail-oriented people are not auditors.',
    ],
    correctOptionIndex: 1,
    category: 'LOGICAL',
    difficulty: 'MEDIUM',
  },
  {
    questionText: 'Find the next term in the sequence: 3, 7, 15, 31, 63, ?',
    options: ['127', '125', '129', '126'],
    correctOptionIndex: 0,
    category: 'LOGICAL',
    difficulty: 'HARD',
  },
  {
    questionText:
      "Choose the word most nearly opposite in meaning to 'abundant'.",
    options: ['Plentiful', 'Scarce', 'Ample', 'Generous'],
    correctOptionIndex: 1,
    category: 'VERBAL',
    difficulty: 'EASY',
  },
  {
    questionText:
      "Select the option that makes the sentence grammatically correct: 'The team, along with its manager, ___ preparing the report.'",
    options: ['are', 'is', 'were', 'have'],
    correctOptionIndex: 1,
    category: 'VERBAL',
    difficulty: 'MEDIUM',
  },
];

function validateQuestion(question: SeedQuestion): void {
  if (question.options.length !== 4) {
    throw new Error(`Question must have exactly four options: ${question.questionText}`);
  }
  if (
    !Number.isInteger(question.correctOptionIndex) ||
    question.correctOptionIndex < 0 ||
    question.correctOptionIndex > 3
  ) {
    throw new Error(`Question must have exactly one correct option: ${question.questionText}`);
  }
  const trimmed = question.options.map((option) => option.trim());
  if (trimmed.some((option) => option.length === 0)) {
    throw new Error(`Question has an empty option: ${question.questionText}`);
  }
  if (new Set(trimmed).size !== 4) {
    throw new Error(`Question options must be distinct: ${question.questionText}`);
  }
}

function validateBank(): void {
  if (questions.length !== 10) {
    throw new Error(`Expected exactly 10 questions, found ${questions.length}`);
  }
  const counts = new Map<Category, number>();
  for (const question of questions) {
    validateQuestion(question);
    counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
  }
  for (const category of ['QUANTITATIVE', 'LOGICAL', 'VERBAL'] as const) {
    const count = counts.get(category) ?? 0;
    if (count < 3) {
      throw new Error(`Category ${category} needs at least 3 questions, found ${count}`);
    }
  }
}

async function seedAdmin(): Promise<void> {
  const rawEmail = process.env.ADMIN_EMAIL;
  if (!rawEmail) {
    throw new Error('ADMIN_EMAIL must be set to seed the initial administrator.');
  }
  const email = rawEmail.trim().toLowerCase();

  const existing = await prisma.admin.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    // Never overwrite an administrator that may have rotated their password.
    console.log(`Administrator already exists: ${email} (left unchanged)`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      'ADMIN_PASSWORD must be set to create the initial administrator account.',
    );
  }
  const name = process.env.ADMIN_NAME?.trim() || 'Platform Admin';
  const passwordHash = await bcrypt.hash(password, bcryptRounds);

  try {
    await prisma.admin.create({ data: { email, passwordHash, name } });
    console.log(`Seeded administrator: ${email}`);
  } catch (error) {
    if (isUniqueViolation(error)) {
      console.log(`Administrator created concurrently: ${email}`);
      return;
    }
    throw error;
  }
}

async function seedSettings(): Promise<void> {
  const existing = await prisma.appSetting.findUnique({
    where: { id: 1 },
    select: { id: true },
  });
  if (existing) {
    console.log('Application settings already present (left unchanged)');
    return;
  }

  const duration = Number(process.env.ASSESSMENT_DURATION_MINUTES ?? 15);
  const pass = Number(process.env.PASS_PERCENTAGE ?? 60);
  try {
    await prisma.appSetting.create({
      data: {
        id: 1,
        assessmentDurationMinutes: duration,
        passPercentage: pass,
      },
    });
    console.log('Seeded application settings');
  } catch (error) {
    if (isUniqueViolation(error)) {
      console.log('Application settings created concurrently (left unchanged)');
      return;
    }
    throw error;
  }
}

async function seedQuestions(): Promise<void> {
  const existingCount = await prisma.question.count();
  if (existingCount > 0) {
    // The question bank may contain admin-authored or edited questions. Do not
    // re-insert the seed set on redeploy; that would duplicate or overwrite the
    // live question bank.
    console.log(
      `Question bank already has ${existingCount} question(s); skipping seed to avoid overwriting.`,
    );
    return;
  }

  await prisma.question.createMany({
    data: questions.map((question) => ({
      questionText: question.questionText,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      category: question.category,
      difficulty: question.difficulty,
      isActive: true,
    })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${questions.length} active aptitude questions`);
}

async function seedCandidate(): Promise<void> {
  const email = process.env.SEED_CANDIDATE_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_CANDIDATE_PASSWORD;
  if (!email || !password) return;

  const existing = await prisma.candidate.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    console.log(`Demo candidate already exists: ${email} (left unchanged)`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const fullName = process.env.SEED_CANDIDATE_NAME?.trim() || 'Demo Candidate';
  try {
    await prisma.candidate.create({
      data: {
        fullName,
        email,
        passwordHash,
        age: 25,
        phone: '0000000000',
        gender: 'PREFER_NOT_TO_SAY',
        highestQualification: 'BACHELORS',
        city: 'Bengaluru',
      },
    });
    console.log(`Seeded demo candidate: ${email}`);
  } catch (error) {
    if (isUniqueViolation(error)) {
      console.log(`Demo candidate created concurrently: ${email}`);
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  validateBank();
  await seedAdmin();
  await seedSettings();
  await seedQuestions();
  await seedCandidate();

  const activeCount = await prisma.question.count({ where: { isActive: true } });
  console.log(`Active questions in database: ${activeCount}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
