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

// Initiate an outbound call via Twilio Voice
export async function makeOutboundCall(
  to: string,
  statusCallbackUrl: string
): Promise<string> {
  if (!env.TWILIO_VOICE_NUMBER) throw new Error('TWILIO_VOICE_NUMBER is not configured');
  const call = await client.calls.create({
    to,
    from: env.TWILIO_VOICE_NUMBER,
    twiml: '<Response><Say>Connecting you now. Please hold.</Say><Pause length="30"/></Response>',
    statusCallback: statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['completed', 'busy', 'no-answer', 'failed'],
  });
  return call.sid;
}

// Generate TwiML for inbound calls
export function inboundCallTwiml(companyName = 'Contact Center'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling ${companyName}. An agent will be with you shortly.</Say>
  <Pause length="2"/>
  <Say voice="alice">Goodbye.</Say>
</Response>`;
}
