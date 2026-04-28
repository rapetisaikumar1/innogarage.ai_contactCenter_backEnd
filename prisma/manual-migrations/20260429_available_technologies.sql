DO $$
BEGIN
  CREATE TYPE "TechnologyCategory" AS ENUM (
    'MARKETING_AUTOMATION_ADOBE_STACK',
    'DATA_ANALYTICS_CDP',
    'CORE_ENGINEERING_DEVELOPMENT',
    'AUTOMATION_TESTING_VALIDATION',
    'INFRASTRUCTURE_OPERATIONS',
    'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS',
    'SEMICONDUCTOR_HARDWARE',
    'MISC_OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "available_technologies" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "TechnologyCategory" NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "available_technologies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "available_technologies_name_key" ON "available_technologies"("name");
CREATE INDEX IF NOT EXISTS "available_technologies_category_idx" ON "available_technologies"("category");

INSERT INTO "available_technologies" ("id", "name", "category") VALUES
  ('availtech_aep', 'AEP', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_ajo', 'AJO', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_adobe_campaign', 'Adobe Campaign', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_adobe_marketo', 'Adobe Marketo', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_adobe_analytics', 'Adobe Analytics', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_sfmc', 'SFMC', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_crm', 'CRM', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_veeva_crm', 'Veeva CRM', 'MARKETING_AUTOMATION_ADOBE_STACK'),
  ('availtech_palantir', 'Palantir', 'DATA_ANALYTICS_CDP'),
  ('availtech_cdm', 'CDM', 'DATA_ANALYTICS_CDP'),
  ('availtech_dg', 'DG', 'DATA_ANALYTICS_CDP'),
  ('availtech_edi', 'EDI', 'DATA_ANALYTICS_CDP'),
  ('availtech_ehr', 'EHR', 'DATA_ANALYTICS_CDP'),
  ('availtech_kdb_developer', 'KDB Developer', 'DATA_ANALYTICS_CDP'),
  ('availtech_ai', 'AI', 'DATA_ANALYTICS_CDP'),
  ('availtech_embedded_systems', 'Embedded Systems', 'CORE_ENGINEERING_DEVELOPMENT'),
  ('availtech_frontend_engineer', 'Frontend Engineer (FE)', 'CORE_ENGINEERING_DEVELOPMENT'),
  ('availtech_field_application_engineer', 'Field Application Engineer', 'CORE_ENGINEERING_DEVELOPMENT'),
  ('availtech_cyberark', 'CyberArk', 'CORE_ENGINEERING_DEVELOPMENT'),
  ('availtech_electronics_engineer', 'Electronics Engineer', 'CORE_ENGINEERING_DEVELOPMENT'),
  ('availtech_electrical_design_engineer', 'Electrical Design Engineer', 'CORE_ENGINEERING_DEVELOPMENT'),
  ('availtech_automation_engineer', 'Automation Engineer', 'AUTOMATION_TESTING_VALIDATION'),
  ('availtech_validation', 'Validation', 'AUTOMATION_TESTING_VALIDATION'),
  ('availtech_csv', 'CSV', 'AUTOMATION_TESTING_VALIDATION'),
  ('availtech_awf', 'AWF', 'AUTOMATION_TESTING_VALIDATION'),
  ('availtech_data_centre', 'Data Centre (DC)', 'INFRASTRUCTURE_OPERATIONS'),
  ('availtech_network_engineer', 'Network Engineer', 'INFRASTRUCTURE_OPERATIONS'),
  ('availtech_bc', 'BC', 'INFRASTRUCTURE_OPERATIONS'),
  ('availtech_ed_ede', 'ED / EDE', 'INFRASTRUCTURE_OPERATIONS'),
  ('availtech_ukg', 'UKG', 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS'),
  ('availtech_smartsheet', 'Smartsheet', 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS'),
  ('availtech_finops_analyst', 'FinOps Analyst', 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS'),
  ('availtech_fno', 'F&O', 'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS'),
  ('availtech_vlsi', 'VLSI', 'SEMICONDUCTOR_HARDWARE'),
  ('availtech_ac', 'AC', 'MISC_OTHER'),
  ('availtech_bfs', 'BFS', 'MISC_OTHER')
ON CONFLICT ("name") DO NOTHING;