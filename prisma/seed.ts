import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const AVAILABLE_TECHNOLOGIES = [
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'AEP' },
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'AJO' },
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'Adobe Campaign' },
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'Adobe Marketo' },
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'Adobe Analytics' },
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'SFMC' },
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'CRM' },
  { category: 'MARKETING_AUTOMATION_ADOBE_STACK', name: 'Veeva CRM' },
  { category: 'DATA_ANALYTICS_CDP', name: 'Palantir' },
  { category: 'DATA_ANALYTICS_CDP', name: 'CDM' },
  { category: 'DATA_ANALYTICS_CDP', name: 'DG' },
  { category: 'DATA_ANALYTICS_CDP', name: 'EDI' },
  { category: 'DATA_ANALYTICS_CDP', name: 'EHR' },
  { category: 'DATA_ANALYTICS_CDP', name: 'KDB Developer' },
  { category: 'DATA_ANALYTICS_CDP', name: 'AI' },
  { category: 'CORE_ENGINEERING_DEVELOPMENT', name: 'Embedded Systems' },
  { category: 'CORE_ENGINEERING_DEVELOPMENT', name: 'Frontend Engineer (FE)' },
  { category: 'CORE_ENGINEERING_DEVELOPMENT', name: 'Field Application Engineer' },
  { category: 'CORE_ENGINEERING_DEVELOPMENT', name: 'CyberArk' },
  { category: 'CORE_ENGINEERING_DEVELOPMENT', name: 'Electronics Engineer' },
  { category: 'CORE_ENGINEERING_DEVELOPMENT', name: 'Electrical Design Engineer' },
  { category: 'AUTOMATION_TESTING_VALIDATION', name: 'Automation Engineer' },
  { category: 'AUTOMATION_TESTING_VALIDATION', name: 'Validation' },
  { category: 'AUTOMATION_TESTING_VALIDATION', name: 'CSV' },
  { category: 'AUTOMATION_TESTING_VALIDATION', name: 'AWF' },
  { category: 'INFRASTRUCTURE_OPERATIONS', name: 'Data Centre (DC)' },
  { category: 'INFRASTRUCTURE_OPERATIONS', name: 'Network Engineer' },
  { category: 'INFRASTRUCTURE_OPERATIONS', name: 'BC' },
  { category: 'INFRASTRUCTURE_OPERATIONS', name: 'ED / EDE' },
  { category: 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS', name: 'UKG' },
  { category: 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS', name: 'Smartsheet' },
  { category: 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS', name: 'FinOps Analyst' },
  { category: 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS', name: 'F&O' },
  { category: 'SEMICONDUCTOR_HARDWARE', name: 'VLSI' },
  { category: 'MISC_OTHER', name: 'AC' },
  { category: 'MISC_OTHER', name: 'BFS' },
] as const;

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

  for (const technology of AVAILABLE_TECHNOLOGIES) {
    await prisma.availableTechnology.upsert({
      where: { name: technology.name },
      update: { category: technology.category },
      create: {
        name: technology.name,
        category: technology.category,
      },
    });
  }

  console.log(' Seeded available technologies:', AVAILABLE_TECHNOLOGIES.length);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
