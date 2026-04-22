import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@contactcenter.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@contactcenter.com',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: 'agent@contactcenter.com' },
    update: {},
    create: {
      name: 'Test Agent',
      email: 'agent@contactcenter.com',
      passwordHash: await bcrypt.hash('Agent@1234', 12),
      role: 'AGENT',
      isActive: true,
    },
  });

  console.log('Seeded users:');
  console.log(' Admin:', admin.email);
  console.log(' Agent:', agent.email);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
