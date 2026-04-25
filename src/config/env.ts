import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),
  TWILIO_ACCOUNT_SID: z.string().min(1, 'TWILIO_ACCOUNT_SID is required'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'TWILIO_AUTH_TOKEN is required'),
  TWILIO_WHATSAPP_NUMBER: z.string().min(1, 'TWILIO_WHATSAPP_NUMBER is required'),
  TWILIO_VOICE_NUMBER: z.string().default(''),  // Twilio Voice phone number (e.g. +1XXXXXXXXXX)
  // Browser-calling (Twilio Voice JS SDK)
  TWILIO_API_KEY: z.string().default(''),         // SK… created in Twilio console > API keys
  TWILIO_API_SECRET: z.string().default(''),      // secret shown once when API key created
  TWILIO_TWIML_APP_SID: z.string().default(''),   // AP… TwiML App SID
  TWILIO_AGENT_IDENTITY: z.string().default('agent'), // shared identity all agents register as
  // SECURITY: when true, skips Twilio webhook signature validation. NEVER enable in production.
  // Defaults to false. Use only for local testing.
  SKIP_WEBHOOK_VALIDATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
