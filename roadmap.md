# Batch 11
- [x] A4 stable colours, swatches, displays, backup preservation
- [x] Browser bar follows system and explicit theme
- [x] Outbox drop reasons
- [x] Migration, unit suite, contrast measurements
- [x] Signed-in light/dark screenshots, temporary-data cleanup, report

# Batch 12
- [x] A6 richer route cards
- [x] A7 continuous, compact mountain
- [x] A8 accessible persistent summit celebration and sharing
- [x] A9 greeting, activity strip and log time
- [x] A10 guided first run
- [x] Tests, signed-in checks, cleanup and report

# Batch 13
- [x] Display-name editing and immediate greeting refresh
- [x] Milestones-or-cards onboarding progression
- [x] Displayed-camp climber clamping and matching accessible label
- [x] Running/paused session indicator and current-kind capture title
- [x] All tests, signed-in checks, account restoration, report and credits

# Batch 14
- [ ] Shared accessible illustrated Empty and existing-flow actions across all locations
- [x] Loading/error precedence and onboarding priority (14b: errors only block without data)
- [ ] Component/screen tests, both-theme checks, report and credits

# Batch 15
- [x] Shared drawer, safe close and keyboard-aware footer
- [x] Convert all six requested dialogs
- [x] Wrapper regression tests and full suite (15b: 202 passing)
- [ ] Signed-in mobile light/dark checks, report and credits (15b: RouteDialog passed 390×844 in both themes and reduced keyboard area; CardDialog/QuickCapture visual checks remain from batch 15)

# Batch 15b
- [x] Restore five exact architecture rationale clauses; preserve wording in future batches
- [x] Complete CSV, session edit and Move dialogs with pinned footers and submission locks
- [x] Add width, resize/input preservation, dirty-confirmation and saving-close tests
- [x] Read-only signed-in RouteDialog checks; no persistent data or account changes
- [x] Report: 202 passing tests; recorded credits 657 → 662 (5)

# Batch 16
- [x] Shared bottom-nav height, content/safe-area clearance and session/toast placement (existing toasts remain top-centre)
- [x] Centred Quick capture, all destinations retained, accessible active links (two left, three right)
- [x] Hide navigation for keyboard and responsive drawers
- [x] Four regression tests; full suite 206 passing; signed-in Today light/dark checks at 390×844 and capture drawer verified
- [ ] Existing route-page bottom visual check: blocked because the signed-in account has no routes; no persistent test data created

# Batch 17
- [x] Read-only typography audit and named scale
- [x] Apply type roles across authenticated screens, overlays and empty states
- [x] Minimum-size lint passed; 206 tests passed; signed-in Today/Settings 390×844 light/dark checks passed (no overflow or undersized text); build clean
- [x] Report scale, per-screen changes, test count and recorded credits; no persistent data or account changes

# Batch 18
- [x] Shared custom camp and route-type SVG set with exhaustive mapping (five camps, six types; frameworks share Skill)
- [x] Replace camp/summit/type symbols only; retain accessible labels and contrast (muted icons 6.00:1 light / 5.87:1 dark on cards)
- [x] Icon tests (23), typography minimum check and full suite (229 passing); build clean
- [x] Routes empty list and unsaved RouteDialog at 390×844 light/dark: no overflow, six icon options, 48px targets, selection/discard works; no data/settings/metadata changes; recorded credits 992.564648311 → 1000.264648311 (7.70)

# Batch 19
- [x] Route-only desktop work/progress columns with sticky scrolling sidebar and unchanged mobile order
- [x] Accessible labelled sections and route-only width; no fetching/behaviour changes
- [x] All tests (229 passing), typography check, 1280×900 and 390×844 both-theme checks; no overflow, sticky sidebar and reachable actions verified
- [x] Temporary book/habit routes and related data cleanup confirmed in database; unchanged account settings/metadata; recorded credits since Batch 18: 1000.264648311 → 1014.964648311 (14.70)

# Batch 20
- [x] Restore original large summit, flag and tent illustrations exactly against 83bf9dd; flag-rise runs for 900ms and is disabled under reduced motion
- [x] Audit larger custom icon uses; only the explicitly allowed Summits shelf uses 32×40px, others use 16–20px
- [x] Typography check and 229 tests pass; summit/tent/flag harness checks at 390×844 light/dark show no overflow; harness removed, no persistent data or account changes; recorded credits since previous report: 1014.964648311 → 1022.364648311 (7.40)

# Batch 21
- [x] Audit animation/transition sources, including library and JS motion: custom flags/glow/reveal/pulse, climber, tw-animate overlays, vaul, sonner, skeletons, hover/expand, Recharts; no smooth-scroll/element.animate/rAF calls in app code
- [x] Global CSS reduced-motion net, SSR-safe shared live preference helper, all Insights bars/lines/tooltips gated; Review shares helper; existing targeted rules retained and normal motion preserved
- [x] Helper and actual Insights chart tests; 232 tests and typography pass; 390px drawer/dialog/toast/populated chart harness and signed-in Insights checked with reduced motion (zero slow running animations); harness removed, no persistent data/settings/metadata changes; recorded credits since last report 1022.364648311 → 1035.364648311 (13.00)

# Batch 22
- [x] Shared short haptics (support/reduced-motion/local opt-out guards), default-on device Preferences toggle, inline milestone/habit ticks and session/card toast ticks, warning save feedback, light review rating feedback; append-only architecture rules
- [x] AltitudeBar (also LearningRouteCard), Mountain camp markers and seven-day activity fills transition 350ms after mount; reduced motion jumps
- [x] Nine new feedback/progress tests; all 241 tests and typography passed, build clean; 390px light/dark milestone, route check-in, Log/session capture, both card save actions, review rating and reduced tick checks; temporary route and milestones/cards/sessions/notes/checkins database-confirmed zero, account settings/metadata unchanged; local vibration restored; recorded credits 1035.364648311 → 1058.364648311 (23.00)
- [ ] Today habit-button end-to-end check blocked by existing account onboarding (kept unchanged); implementation complete, Today Log time verified, no real-device vibration available in Chromium

# Batch 23
- [x] Shared responsive NativeSelect with preserved API, empty values/optgroups, selection and open-mode latch; SSR native
- [x] Input-matched desktop styling, 40px checked items, keyboard/labels and disabled options; native touch/narrow fallback; RouteDialog type picker unchanged
- [x] Ten new tests; 251 tests and typography pass, build clean; 1280px Cards filter and route status checked in both themes with saved/read-back status, keyboard selection and native resize preservation; temporary route and all related tables confirmed empty, account settings/metadata unchanged; recorded credits 1058.364648311 → 1074.064648311 (15.70)

# Batch 24
- [x] Private subscriptions, habit-only reminder settings, daily reminder log and owner-scoped subscription upsert migration
- [x] Secure server-only seed-derived VAPID pair and public-only key delivery; subject derives from existing OWNER_EMAIL (not separate persisted key/subject secrets)
- [x] Eligible secret-authenticated sender, atomic daily claims, provider-restricted URLs and 404/410/five-failure handling; at-most-once attempts (claim precedes delivery)
- [ ] 15-minute production schedule: blocked because the backend tool denies access to scheduler secrets; no job or scheduler migration applied. Requires a permitted secure server-to-scheduler credential setup, then publish. 96 checks/day, up to 15-minute delay; recurring Cloud cost.
- [x] Push/click handlers imported by existing generated worker, explicit-tap permission/preferences and habit reminder controls; preview refusal preserved
- [x] 284 tests and typography pass; build clean; signed-in settings refusal, public-key availability, unauthenticated sender 401 and temporary habit save/reload verified; temporary route and all eight data tables confirmed empty; account settings/metadata untouched
- [ ] Published-device permission/subscription/delivery/click test and real sender failure-path integration: blocked by unpublished app and unscheduled job; sender failure logic covered with mocked subscriptions (not a real fake-subscription request)
- [x] Recorded credits since Batch 23: 1074.064648311 → 1096.564648311 (22.50); report partial completion and exact blockers

# Batch 24b
- [x] Initialize missing timezone only through notification/reminder opt-in; duplicate-safe settings creation/null-only writes preserve chosen zones; show timezone/Preferences link; five regression tests including invalid zones and concurrent edits
- [x] Enable pg_cron and pg_net through applied migration 0014; both extensions verified present
- [ ] Secure Vault scheduler setup rejected: "Agent access to secrets is not allowed". User must set the relevant Lovable Cloud agent permission to Ask each time, then resume; no job exists. After permission: transfer server-only cron credential to Vault without displaying it, configure */15 * * * * against production POST /api/public/send-habit-reminders, verify job and manually confirm 200/empty counts. Production target still requires publishing.
- [x] 289 tests and typography pass, build clean; all eight application data tables confirmed empty; no real opt-in exercised (so account timezone/settings and metadata left unchanged)
- [x] Recorded usage since Batch 24 report: 1096.564648311 → 1105.964648311 (9.40); pause for scheduler permission rather than bypass restriction

# Batch 25
- [x] Match route detail DOM/mobile order; desktop grid placement with sticky progress and actions last
- [x] DOM-order regression, 293 tests and typography pass; build clean; 390px/1280px habit checks in light/dark pass without overflow; temporary routes removed; settings/metadata unchanged

# Navigation latency
- [x] Measure 600ms latency before/after; cache identity verification; verify expiry, account changes and revocation; full tests (353 passing). Automatic build checks pass; standalone typecheck not run under workspace restrictions.

# App download
- [ ] Permanent public/Settings buttons and native/platform instructions
- [ ] Verify published installation support, small-screen themes and full tests
