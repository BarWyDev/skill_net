import type { APIRoute } from "astro";
import { SMS_WEBHOOK_SECRET } from "astro:env/server";
import { recordIncomingReply } from "@/lib/services/sms-webhooks";
import { webhookError, webhookNotFound, webhookOk } from "@/lib/sms/webhook-response";
import { readIncomingReply, readParams, secretMatches } from "@/lib/sms/webhook";

// SMSAPI's incoming-SMS callback (S-07): a resident's TAK or NIE to a crisis alert.
// SMSAPI cannot sign callbacks, so the path carries SMS_WEBHOOK_SECRET; a wrong one is a 404, as
// if the route did not exist. SMSAPI sends replies as POST, but the method is their setting, so
// both are accepted. The answer must be the string OK, or SMSAPI repeats the request.
// The sender's number and the text are never logged, and the response is never cached.
const handler: APIRoute = async ({ params, request }) => {
  if (!(await secretMatches(params.secret, SMS_WEBHOOK_SECRET))) return webhookNotFound();

  const reply = readIncomingReply(await readParams(request));
  // Not a Polish number (a sender name, a short code): no resident has it, so there is nothing to do.
  if (!reply) return webhookOk();

  return (await recordIncomingReply(reply)) ? webhookOk() : webhookError();
};

export const GET = handler;
export const POST = handler;
