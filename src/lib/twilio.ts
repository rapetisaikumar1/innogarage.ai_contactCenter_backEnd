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
  let call;
  try {
    call = await client.calls.create({
    to,
    from: env.TWILIO_VOICE_NUMBER,
    twiml: '<Response><Say>Connecting you now. Please hold.</Say><Pause length="30"/></Response>',
    statusCallback: statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['completed', 'busy', 'no-answer', 'failed'],
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    // Twilio error objects have a `code` property
    const code = (err as Record<string, unknown>).code;
    if (code === 21215 || code === 21219) {
      throw new Error(`Twilio cannot call ${to}: Geographic permissions not enabled. Enable India in Twilio Console → Voice → Geo Permissions. (Twilio error ${code})`);
    }
    throw new Error(`Twilio call failed: ${raw}`);
  }
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

// Ring the agent's browser (Twilio Client). Used for inbound calls so that
// whoever is logged in to the contact center app receives the call in-browser.
// action= fires the status webhook when the Dial leg ends (call completes/times out).
export function dialClientTwiml(identity: string, statusCallbackUrl: string, companyName = 'Contact Center'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling ${companyName}. Connecting you to an agent now.</Say>
  <Dial timeout="30" answerOnBridge="true" action="${statusCallbackUrl}" method="POST">
    <Client statusCallbackEvent="initiated ringing answered completed" statusCallback="${statusCallbackUrl}" statusCallbackMethod="POST">${identity}</Client>
  </Dial>
</Response>`;
}

// Bridge an outbound browser call to a real phone number.
// Used when the agent's browser dials a candidate via Twilio Device.
// action= fires a POST to the status webhook when the Dial leg ends,
// which lets us update the call record to COMPLETED/MISSED/FAILED.
export function dialNumberTwiml(to: string, callerId: string, statusCallbackUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" answerOnBridge="true" action="${statusCallbackUrl}" method="POST">
    <Number statusCallbackEvent="initiated ringing answered completed" statusCallback="${statusCallbackUrl}" statusCallbackMethod="POST">${to}</Number>
  </Dial>
</Response>`;
}

// Generate a short-lived JWT access token that the browser uses to register
// with Twilio as a Voice Client. Identity should uniquely identify the agent
// (or use a shared identity like "agent" for single-agent setups).
export function generateVoiceAccessToken(identity: string): string {
  if (!env.TWILIO_API_KEY || !env.TWILIO_API_SECRET || !env.TWILIO_TWIML_APP_SID) {
    throw new Error('Twilio Voice SDK not configured (missing TWILIO_API_KEY/SECRET/TWIML_APP_SID)');
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(
    env.TWILIO_ACCOUNT_SID,
    env.TWILIO_API_KEY,
    env.TWILIO_API_SECRET,
    { identity, ttl: 3600 } // 1-hour token
  );

  const grant = new VoiceGrant({
    outgoingApplicationSid: env.TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  });
  token.addGrant(grant);

  return token.toJwt();
}
