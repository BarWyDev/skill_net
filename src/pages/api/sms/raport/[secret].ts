import type { APIRoute } from "astro";
import { SMS_WEBHOOK_SECRET } from "astro:env/server";
import { recordDeliveryReports } from "@/lib/services/sms-webhooks";
import { webhookError, webhookNotFound, webhookOk } from "@/lib/sms/webhook-response";
import { readDeliveryReports, readParams, secretMatches } from "@/lib/sms/webhook";

// SMSAPI's delivery-report callback (S-07): turns "sent" into "delivered" or "not delivered".
// SMSAPI cannot sign callbacks, so the path carries SMS_WEBHOOK_SECRET; a wrong one is a 404, as
// if the route did not exist. SMSAPI sends reports as GET, but the method is their setting, so
// both are accepted. The answer must be the string OK, or SMSAPI repeats the request.
// Nothing personal is logged, and the response is never cached.
const handler: APIRoute = async ({ params, request }) => {
  if (!(await secretMatches(params.secret, SMS_WEBHOOK_SECRET))) return webhookNotFound();

  const reports = readDeliveryReports(await readParams(request));
  return (await recordDeliveryReports(reports)) ? webhookOk() : webhookError();
};

export const GET = handler;
export const POST = handler;
