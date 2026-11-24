import type { APIRoute } from "astro";
import { SMS_WEBHOOK_SECRET } from "astro:env/server";
import { recordIncomingReply } from "@/lib/services/sms-webhooks";
import { webhookError, webhookNotFound, webhookOk } from "@/lib/sms/webhook-response";
import { readIncomingReply, readParams, secretMatches } from "@/lib/sms/webhook";

// SMSAPI's incoming-SMS callback (S-07): a resident's TAK or NIE to a crisis alert.
// SMSAPI cannot sign callbacks, so the path carries SMS_WEBHOOK_SECRET; a wrong one is a 404, as
// if the route did not exist. POST only, as SMSAPI sends it: a GET would put the sender's number
// and the text into the request URL, which platform logs record.
// The answer must be the string OK, or SMSAPI repeats the request.
// The sender's number and the text are never logged, and the response is never cached.
export const POST: APIRoute = async ({ params, request }) => {
  if (!(await secretMatches(params.secret, SMS_WEBHOOK_SECRET))) return webhookNotFound();

  const fields = await readParams(request);
  if (!fields) return webhookError();

  const reply = readIncomingReply(fields);
  // Not a Polish number (a sender name, a short code): no resident has it, so there is nothing to do.
  if (!reply) return webhookOk();

  return (await recordIncomingReply(reply)) ? webhookOk() : webhookError();
};
