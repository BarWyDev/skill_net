# Review follow-ups

Queued by `reviews/impl-review-phase-4.md`. Both belong in the Phase 5 owner checklist (`owner-checklist.md`), which Phase 5 writes.

## F2 — Callback URLs in Workers Logs

- [ ] After the first real delivery report on staging, open Workers Logs for `skillnet-staging` and check whether the invocation log shows the request URL of `/api/sms/raport/…`. That URL carries `SMS_WEBHOOK_SECRET` in its path and the recipient's number (`to`) in its query string.
- [ ] If it does, decide: turn invocation logs off for the Worker (`observability.logs.invocation_logs: false` in `wrangler.jsonc`, a production config change that also removes request logs used for debugging), or keep them and say so in the privacy notice. Either way, treat the secret as readable by anyone with access to the Cloudflare dashboard, and rotate it if that group changes.

## F7 — One SMSAPI callback per account

- [ ] Use separate SMSAPI accounts or subusers for staging and production, each with its own delivery-report and reply callback URLs and its own `SMS_WEBHOOK_SECRET`. No message carries `notify_url`, so with one shared account every report and reply goes to a single environment and the other's alerts stay "wysłano".
- [ ] Confirm with SMSAPI whether a subuser can have its own two-way number and callbacks, and what the second number costs.
