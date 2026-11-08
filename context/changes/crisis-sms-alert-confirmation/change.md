---
change_id: crisis-sms-alert-confirmation
title: Crisis SMS alert with YES/NO confirmation
status: plan_reviewed
created: 2026-10-29
updated: 2026-10-29
---

## Notes

Roadmap S-07, issue #8 (FR-011, US-01). Plan: `plan.md`, brief: `plan-brief.md`.

Decisions taken with the owner on 2026-10-29: SMSAPI.pl as the provider, residents answer by replying TAK or NIE to the SMS (two-way, no link), SMS only in v1 (no push), the coordinator sends alerts to the top N themselves, phone numbers are verified by an SMS code first, confirmed people go to the top of the ranking, the last answer wins, exercises only simulate the send, one open alert per resident at a time, S-07 shows each person's alert status while S-08 adds confirmed contacts and live refresh, and retries plus delivery reports.

Blocked for production on two owner steps: the Workers Paid plan (Queues need it) and an SMSAPI account with a reply-capable sender. Code can be built and tested locally before both.
