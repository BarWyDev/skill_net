# Everyday neighbour help: delivery plan

Written on 2026-11-28. It covers roadmap slices S-22 to S-27 (PRD FR-022 to FR-027) and says in what order they are built, what each one changes, how it is checked and how it reaches production.

This is the plan for the whole group. Each slice still gets its own `/10x-plan <change-id>` before any code is written, and that plan may change the details below after reading the code. Where the two disagree, the slice's plan wins and this file is corrected.

## Why

SkillNet's everyday mode is the aggregated skills map and neighbour courses (S-17). A comparison with the Finnish app Commu on 2026-11-24 showed what it lacks: an everyday reason to come back. Commu's core is help requests and offers on a map, a chat, a "Did you get help?" confirmation and about twenty everyday kinds of help. PRD insight 2 says the same thing from the other side: without everyday use the directory goes stale and is useless in a crisis.

The owner decided on 2026-11-28 to grow everyday help, in SkillNet's own shape:

- A help request is **matched to the skills in the directory**. Commu's users browse a map; here only neighbours who declared the skill see the request.
- There is **no board of help offers**. A resident's profile already is the offer.
- Contact goes through the **hand-over of details** that courses use, not through a chat.
- Nothing shows a resident's identity: no name, no photo, no trust score, and the place only as the 2 km square.
- Production moves to the Workers Paid plan, so email notifications are in scope.

## What is taken from Commu and what is not

| From Commu                                      | In SkillNet                                                           | Slice |
| ----------------------------------------------- | --------------------------------------------------------------------- | ----- |
| About twenty everyday kinds of help             | A seventh taxonomy category, "Pomoc codzienna", with eight skills     | S-22  |
| Reporting misuse, moderation, safety advice     | Report button, operator decision, public rules page                   | S-23  |
| Help requests on a map, expiring after 14 days  | Requests tied to one skill, shown to matching neighbours only         | S-24  |
| Push notifications                              | Opt-in email, off by default, limited to one a day                    | S-25  |
| "Did you get help?" and "My Stats"              | Confirmation and a private history for both people                    | S-26  |
| Story feed of confirmed help, municipal contest | A count of confirmed help and open courses per area on the map        | S-26  |
| Remote help                                     | A "possible remotely" mark on requests and courses                    | S-27  |
| Chat, public profile with photo and trust score | Not taken (PRD §Non-Goals)                                            | —     |
| Board of help offers, goods and food category   | Not taken (PRD §Non-Goals)                                            | —     |
| Notifications used for marketing                | Not taken; it is the one criticism found in Commu's App Store reviews | —     |

## Order

```text
S-22 everyday-help-skills ─────┐
                               ├─► S-24 neighbour-help-requests ─┬─► S-26 help-confirmation-and-history
S-23 content-reports-and-rules ┘                                 ├─► S-27 remote-help
                                                                 └─► S-25 help-request-notifications
                                              (S-25 also needs S-21 and the Workers Paid plan)
```

1. **S-22 and S-23** can start now and run side by side. Neither needs anything that is not on `master`.
2. **S-24** starts when both are merged. It is the centre of the group and the largest slice.
3. **S-26 and S-27** follow S-24 and can run side by side.
4. **S-25** follows S-24, but only after the owner has moved production to the Workers Paid plan, created the queues and set the email sending key. It also needs S-21, which stores the resident's language with the account.

None of these slices blocks the pilot, and none of them touches the crisis path. S-07 and S-08 stay the pilot's critical path.

## What the slices reuse

Neighbour courses already solved most of the hard parts, in `supabase/migrations/20261021120000_neighbour_courses.sql`:

- `course_resident_eligible` and `course_eligible_on`: who may take part (an account older than 14 days, no change of location in the last 7 days, not paused).
- `density_square` and `course_visible_to`: a viewer sees an item only from their own 2 km square and the eight around it, and only in a square that the public map shows.
- `course_hidden_reason`: one ordered list of reasons why an item is hidden.
- `check_course_text`: length and content rules for text typed by residents.
- `meeting_details`: details that only people who signed up can read.
- The limit of three open courses per resident, expiry and renewal.
- All access through `security definer` functions; clients have no direct table grants beyond what `supabase/tests/narrow_table_grants_test.sql` lists.

On the app side the pattern is `src/lib/services/courses.ts`, the endpoints in `src/pages/api/kursy/`, the page `src/pages/kursy.astro` with the components in `src/components/courses/`, and the catalogue `src/lib/i18n/messages/courses.ts`.

## Rules for every slice

- **Texts in three languages.** Every user-facing string goes in a catalogue in `src/lib/i18n/messages/`, in Polish, English and Ukrainian. Text typed by residents is shown as written. The Ukrainian text waits for a native reader (Open Roadmap Question 13).
- **Privacy notice and consent.** S-23, S-24, S-25 and S-26 each store a new kind of personal data, so each changes the Polish privacy notice. `src/lib/i18n/legal.test.ts` pins the notice's hash to the consent version, so a changed notice means a new row in `consent_versions`, a new `CURRENT_CONSENT_VERSION` in `src/lib/consent.ts`, and every resident passing `/zgoda` again. The consent sentence already names "pomocy sąsiedzkiej", so it may stay as it is; the planning of S-23 confirms that. To keep the number of versions low, slices that reach production in one promotion share one consent version (Open Roadmap Question 15).
- **Unregistering and pausing.** Every new table hangs off `profiles` with `on delete cascade`, and each slice extends `supabase/tests/unregister_and_erase_test.sql` and the pause tests.
- **Migrations.** One migration per slice where possible, expand-then-contract, RLS on every new table, no privileges for `anon` and `authenticated` beyond the functions. The flow is the one in `CLAUDE.md`: `npm run db:push:staging`, the branch preview, merge to `master`, then `npx supabase db push` right before the promotion PR merges.
- **No personal data in logs.** Reports, offers and notification sends are recorded in Supabase tables, never with `console.*`.
- **Navigation last.** A new page gets its link in `SiteHeader.astro` in the last PR of its slice, so a half-built page is never one click away on production.
- **Checks before a PR.** `npm run lint`, `npx astro check`, `npm run test:unit`, `npm run test:db`, `npm run build`, `npm run smoke`. `scripts/smoke.mjs` gains a check for each new protected page and endpoint.
- **Checks after the merge.** Staging has no automated smoke. Each slice ends with a walk on https://staging.skillnet.org.pl in all three languages, on a phone width and a computer width, before it is promoted.

## S-22: everyday-help skills

**The resident gets** a seventh category in the profile, "Pomoc codzienna", and can tick skills in it. The map can be filtered by it.

Default list, to be confirmed by the owner (the slugs are permanent once shipped):

| Slug                             | Polish name                    |
| -------------------------------- | ------------------------------ |
| `zakupy`                         | Zakupy i drobne sprawunki      |
| `odsniezanie-i-ogrod`            | Odśnieżanie i prace w ogrodzie |
| `opieka-nad-zwierzeciem`         | Opieka nad zwierzęciem         |
| `towarzystwo-i-rozmowa`          | Towarzystwo i rozmowa          |
| `pomoc-przy-przeprowadzce`       | Pomoc przy przeprowadzce       |
| `drobne-naprawy`                 | Drobne naprawy domowe          |
| `pomoc-z-telefonem-i-komputerem` | Pomoc z telefonem i komputerem |
| `pomoc-w-sprawach-urzedowych`    | Pomoc w sprawach urzędowych    |

- **Data:** one migration that inserts the category `codzienne` and the skills, all with `has_level = false`. No row in the crisis-type × skills matrix, so the crisis ranking and the coverage list do not change.
- **App:** names in `src/lib/i18n/messages/taxonomy.ts` in three languages; `taxonomy.test.ts` already fails when the catalogue and the migration disagree. Check every place that lists categories: the profile form, the map filter, the course form and the coordinator's coverage view (the new category must not appear as a "gap" in a crisis).
- **Privacy:** no new kind of data, so no new consent version. The notice's list of categories is checked for wording that names six categories.
- **Tests:** pgTAP for the seed, for the level rule and for an unchanged ranking with an everyday skill on a profile; the density snapshot test with the new category.
- **Done when:** a resident on staging adds an everyday skill in each language, the map shows the category under the usual threshold, and a crisis exercise returns the same ranking as before.

## S-23: reports and community rules

**The resident gets** a "Zgłoś" button on a course, with a reason from a fixed list and an optional short note, and a public page `/zasady` with the community rules and safety advice. **The operator gets** a list of open reports and can hide or restore an item.

- **Data:** a table `content_reports` (reporter, kind of item, item id, reason, note, time, decision, time of decision). One report per resident per item, and a daily limit per resident. A function `report_content`; operator functions to list, hide and restore, callable only with the service role (Studio), as the coordinator role is granted today. `course_hidden_reason` gains two reasons: hidden by the operator, and hidden after three distinct reports until the operator decides.
- **App:** the button and a small form in `NearbyCourses.astro`; the organiser's list (`MyCourses.astro`) shows "ukryty do wyjaśnienia" with the reason; the page `/zasady` and a link to it from the footer, the course form and, later, the request form. Rules text: free help only, no advertising, no personal data in descriptions, meet first in a public place, call 112 in an emergency.
- **Privacy:** a report is personal data about the reporter. The notice gains a paragraph, with a new consent version. The reported person never sees who reported.
- **Tests:** pgTAP for the limits, for the three-report threshold, for the operator functions being unreachable for residents, and for erasure of reports when the reporter unregisters; unit tests for validation; smoke for `/zasady` (public) and the report endpoint (anonymous → sign-in).
- **Open:** where the operator reads reports (default: Studio) and who does it during the pilot (Open Roadmap Question 16).
- **Done when:** on staging three residents report one course, it disappears for neighbours, the organiser sees why, and the operator restores it.

## S-24: help requests

**The resident gets** a new page `/pomoc` with three sections, mirroring `/kursy`: "Moje prośby", "Prośby w okolicy" and "Moje oferty pomocy".

The flow:

1. The person asking picks one skill from the taxonomy and writes a short description. The form reminds them not to put a name, an address or a phone number in it. The request is open for 14 days and can be renewed once.
2. Neighbours who declared that skill, from the same square and the eight around it, see the request in "Prośby w okolicy": the skill, the description, the square and how long it stays open. Nobody else sees it.
3. A neighbour clicks "Mogę pomóc". They may withdraw until the details are handed over.
4. The person asking sees how many neighbours offered and, for each offer, only the level of the skill and how long the account has existed.
5. The person asking accepts an offer and writes the details (place, time, how to get in touch). Only accepted helpers can read them.
6. The person asking closes the request, or it expires.

- **Data:** tables `help_requests` (the person asking, skill, description, details, opened, closed, reason for closing) and `help_offers` (request, helper, offered, withdrawn, accepted). Functions in the shape of the course ones: create, renew, close, list mine, list nearby, offer, withdraw, accept, list my offers. The visibility function adds one rule to the course rules: the viewer holds the request's skill. Limits: three open requests per resident, and a limit of offers per helper per day. `content_reports` (S-23) accepts the kind "help request", and the hidden-reason function covers requests.
- **App:** `src/lib/services/help.ts`, validation with zod, endpoints in `src/pages/api/pomoc/`, the page `src/pages/pomoc.astro` with components in `src/components/help/`, the catalogue `src/lib/i18n/messages/help.ts`, `/pomoc` added to `PROTECTED_ROUTES` in `src/middleware.ts`. The safety advice from `/zasady` is shown above the accept button. A resident with no matching request nearby sees a hint to add skills to the profile, which is the everyday reason to keep it current.
- **Privacy:** requests and offers are new personal data; the notice gains a section like the one for courses, with a new consent version. A request reveals that someone in a square needs help, so it follows the course rule: shown only in a square the public map shows.
- **Tests:** a pgTAP suite `neighbour_help_requests_test.sql` covering who sees a request (skill, squares, eligibility, pause, hidden square), that details are readable only by accepted helpers, the limits, expiry and renewal, and erasure on both sides; unit tests for validation and text rules; smoke for the page and each endpoint.
- **Open:** what the person asking sees about a helper; whether everyone nearby should see a request; limits (see the slice's Unknowns in the roadmap).
- **Done when:** on staging, with three test accounts, a request is visible only to the neighbour with the skill, the details reach only the accepted helper, a reported request is hidden, and unregistering either person removes their side at once.

Suggested phases for the slice's own plan: database and tests; the person asking ("Moje prośby"); the helper ("Prośby w okolicy", "Moje oferty pomocy"); notice, consent, smoke and navigation.

## S-25: email notifications

**The resident gets** a switch in the profile, off by default: "Powiadamiaj mnie e-mailem o prośbach pasujących do moich umiejętności". The person asking gets an email when the first neighbour offers help. Every email has a link that switches notifications off without signing in.

- **Before work starts (owner):** production on the Workers Paid plan; the queues created for production and staging (`npx wrangler queues create <name>`), or the deploy fails; a sending key for the email provider set as a secret on both Workers.
- **Data:** a notification setting on the profile; a table of sends (resident, kind, time) that enforces "at most one email a day" and serves as the audit trail.
- **App:** a queue producer in the endpoint that creates a request or an offer; a consumer that picks the recipients (the nearest 20 eligible neighbours with the skill who switched notifications on and were not emailed in the last day) and sends through the provider's HTTP API. Email texts in a catalogue in three languages, in the language stored with the account (S-21). An email says only that a request matching skill X is waiting, with a link to `/pomoc`: no description, no square. Previews have no queue, so there the send goes through a fake sender in the request, as S-07 does for SMS.
- **Open for the slice's plan:** the Worker holds only the publishable Supabase key, so how the consumer reads recipients' addresses needs a decision; S-07 solves the same problem for phone numbers, and this slice follows its answer. Whether the queue is shared with S-07 (default: separate).
- **Privacy:** the email address gets a new purpose; the notice changes, with a new consent version. The data-protection officer's question about the email provider's US-hosted logs (Open Roadmap Questions 11 and 12) applies here too.
- **Tests:** pgTAP for the choice of recipients and the daily limit; unit tests for the email texts and the unsubscribe token; a staging test that sends to the owner's test accounts only.
- **Done when:** on staging a request sends one email to a matching neighbour who opted in and none to others, a second request the same day sends nothing to that neighbour, and the link in the email switches notifications off.

## S-26: confirmation and private history

**The resident gets** the question "Czy pomoc się odbyła?" when closing a request with an accepted helper, and a section "Moja historia" listing confirmed help given and received. **Everyone gets** a line on the map: confirmed help and open courses in the area this month.

- **Data:** a table of confirmations (request, helper, time). A function for the history of the signed-in resident. A daily snapshot of counts per 2 km square, built like the skills-density snapshot: only squares the public map shows, small numbers as bands.
- **App:** the question in the close flow of `/pomoc`; the history section on `/pomoc` or `/profil`; the counter in the map's side panel.
- **Privacy:** the history says who helped whom and when, so it gets its own paragraph in the notice and a new consent version. Each person sees only their own side: the skill and the date, never the other person's identity. No public ranking, no badge.
- **Tests:** pgTAP for who can confirm, for both histories, for the snapshot under the threshold and for erasure; unit tests for the bands.
- **Open:** how long the history is kept; whether confirmed help ever counts in a crisis ranking (default: never).
- **Done when:** on staging a confirmed help shows in both histories, the map's counter changes after the next snapshot, and a sparse square shows nothing.

## S-27: remote help

**The resident gets** a checkbox "Można zdalnie" on the request form and the course form. A remote item is offered to matching residents within 25 km and shows "zdalnie" instead of a square.

- **Data:** a column on `help_requests` and on `courses` (expand only); the visibility functions take the wider reach for remote items.
- **App:** the checkbox, a filter "tylko zdalne" in the nearby lists, texts in three languages.
- **Privacy:** no new kind of data. The notice's sentence on who sees a course or a request is checked; if it changes, this slice shares a consent version with whatever is promoted with it.
- **Tests:** pgTAP for the reach of remote and local items; smoke unchanged.
- **Done when:** on staging a remote request is visible to a matching resident two squares away and a local one is not.

## Reaching production

Each slice follows the usual path: branch, PR to `master` with `ci` and `smoke` green, the staging walk, then a promotion PR `master` → `production` merged with a merge commit, with pending migrations pushed to production right before the merge and read-only smoke after the deploy. No promotion while a crisis is active.

Suggested promotions, to keep the number of consent versions at three:

| Promotion | Slices     | New consent version | Needs from the owner                                       |
| --------- | ---------- | ------------------- | ---------------------------------------------------------- |
| 1         | S-22       | No                  | Confirm the list of skills                                 |
| 2         | S-23, S-24 | Yes                 | Decide who reads reports; read the new notice              |
| 3         | S-26, S-27 | Yes                 | Decide how long the history is kept                        |
| 4         | S-25       | Yes                 | Workers Paid plan, queues, email sending key, DPO's answer |

Promotions 3 and 4 can swap. If all of them land before the pilot starts, no real resident is asked to consent twice.

## Risks

- **Safety of two strangers meeting.** Neither side sees who the other is. The answers are: eligibility rules that keep out brand-new accounts, details handed over only per accepted offer, safety advice on the page, reporting with a fast operator decision. This is the risk to revisit after the first real requests.
- **A quiet start.** Until S-25 ships, a request is seen only by neighbours who happen to open the app. A pilot area with few residents may see no offers at all; that would be a cold-start result (Open Roadmap Question 3), not proof that the feature is unwanted.
- **Moderation load.** Requests and reports need someone to read them. Today that is the owner alone.
- **Scope pressure.** Every item in the "not taken" rows will be asked for again: a chat first. The narrowing in FR-024 is what keeps the privacy promise, so a change there goes back to the PRD, not into a slice.
- **Attention.** S-07 and S-08 still gate the pilot. This group must not delay them once the owner picks them up again.

## Decisions waiting for the owner

1. The list of everyday skills (S-22). Default: the eight above.
2. Where reports are read, and by whom during the pilot (S-23). Default: Supabase Studio, the owner.
3. What the person asking sees about a helper (S-24). Default: skill level and account age.
4. Whether only residents with the matching skill see a request (S-24). Default: yes.
5. How long the help history is kept (S-26). Default: until the account is deleted.
6. Limits for notification emails (S-25). Default: the nearest 20 neighbours, one email a day.
7. The date of the move to the Workers Paid plan (S-25, S-07).
8. One consent version per promotion, and all of them before the pilot (Open Roadmap Question 15). Default: yes.
