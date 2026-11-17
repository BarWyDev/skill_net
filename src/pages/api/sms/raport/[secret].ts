import type { APIRoute } from "astro";
import { SMS_WEBHOOK_SECRET } from "astro:env/server";
import { recordDeliveryReports } from "@/lib/services/sms-webhooks";
import { webhookError, webhookNotFound, webhookOk } from "@/lib/sms/webhook-response";
import { readDeliveryReports, readParams, secretMatches } from "@/lib/sms/webhook";

// SMSAPI's delivery-report callback (S-07): turns "sent" into "delivered" or "not delivered".
// SMSAPI cannot sign callbacks, so the path carries SMS_WEBHOOK_SECRET; a wrong one is a 404, as
// if the route did not exist. SMSAPI sends reports as GET; POST is accepted too. The answer must
// be the string OK, or SMSAPI repeats the request.
// This code logs nothing personal and the response is never cached, but a GET's query string
// (which carries the recipient's number) is part of the request URL, and so is the secret.
const handler: APIRoute = async ({ params, request }) => {
  if (!(await secretMatches(params.secret, SMS_WEBHOOK_SECRET))) return webhookNotFound();

  const fields = await readParams(request);
  if (!fields) return webhookError();

  const reports = readDeliveryReports(fields);
  return (await recordDeliveryReports(reports)) ? webhookOk() : webhookError();
};

export const GET = handler;
export const POST = handler;
