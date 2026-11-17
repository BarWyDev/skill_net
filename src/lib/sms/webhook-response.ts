// The three answers of SMSAPI's callback routes (S-07). Never cached: the routes run behind the
// auth middleware (context/foundation/lessons.md), and a callback's answer is about one request.

const HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

/** What SMSAPI expects: the string OK. Anything else makes it send the callback again. */
export function webhookOk(): Response {
  return new Response("OK", { status: 200, headers: HEADERS });
}

/** A wrong or missing path secret: the same answer as a route that does not exist. */
export function webhookNotFound(): Response {
  return new Response("Not found", { status: 404, headers: HEADERS });
}

/** The callback could not be processed now (the database is down or not configured): SMSAPI retries. */
export function webhookError(): Response {
  return new Response("Error", { status: 503, headers: HEADERS });
}
