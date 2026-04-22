import twilio from 'twilio';
import { env } from '../config/env';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export async function sendWhatsAppMessage(to: string, body: string): Promise<string> {
  const from = `whatsapp:${env.TWILIO_WHATSAPP_NUMBER}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const message = await client.messages.create({ from, to: toNumber, body });
  return message.sid;
}

// Validates that an incoming webhook actually came from Twilio
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
}
