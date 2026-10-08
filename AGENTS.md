<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Account creation only via the `registerAccount` server function (public signup is disabled in auth config) — so the invite allowlist can't be bypassed.
- Owner role is granted only when the registering email matches the OWNER_EMAIL server secret (never "first account"); roles live in `user_roles`, checked with `has_role` — avoids privilege escalation and takeover of a fresh install.
- Invites use auth inviteUserByEmail; registerAccount completes a pending invite (no role, never signed in) by setting its password — so invite emails and self-setup share one path.
- App data is read/written from the browser client under RLS (`user_id = auth.uid()`); only access management uses the admin client in server functions — keeps every user's data private, including from the owner.
- Per-route aggregates come from the `route_stats` SQL function (security invoker, RLS); the camp formula in `src/lib/camp.ts` consumes them, with a per-route manual override — single source of truth, no full-table loads.
- Screens load only their own queries from `src/lib/data.ts`; any list that can exceed 1,000 rows goes through `fetchPaged` — avoids silent truncation.
- The study timer lives in localStorage (`src/lib/timer.ts`), time derived from timestamps — survives navigation and refresh; one session at a time.
- Never write to the database from render or effects based on computed scores; summits need explicit user confirmation.
- Routes are archived via `archived_at` (hidden from Today/Routes/Review, data kept) and deleted via `deleted_at` soft delete; every query excludes soft-deleted routes, and `purge_deleted_routes` hard-deletes (cascade) after the undo window (toast close + on app load) — gives undo without a scheduler.
- Milestone reorder goes through the atomic `swap_milestones` RPC — positions can never end up half-swapped.
- New notes start as drafts (`/notes/new`) and are inserted on the first real edit via `NoteEditor`; saves run only after user edits — no empty rows, no save-on-open.
- Cards carry `suspended_at`, `buried_until` and `last_reviewed_at` (null = new); due counts, the review queue and `route_stats.cards_due` exclude suspended/buried cards — one definition of "due" everywhere.
- Primary/destructive text uses explicit strong utilities mapped to independent ink tokens; gold text/informative marks use gold-text, decorative gold stays gold — preserves brand fills while meeting contrast in both themes.
- Onboarding timestamps live in user_settings and are written only from explicit user actions; route aggregates drive step progression — state follows the account without save-on-render.
- Database BEFORE UPDATE triggers own updated_at on every timestamped public table; clients omit it — all mutation paths share the same trusted clock.
- Create/save entry points use useSubmission's synchronous lock and disabled controls through finally — rapid clicks cannot duplicate requests.
- Calendar logic goes through `src/lib/time.ts` (pure, timezone-aware) and the cached prefs in `src/lib/prefs.ts`; `localDate`/`startOfToday`/`startOfWeek` in data.ts apply the user's timezone and week start, and SQL date boundaries are passed in as parameters — one definition of "today" and "this week".
- Theme: user_settings is the source of truth, mirrored to localStorage and applied as .dark/.light on <html> by an inline boot script before paint; CSS dark tokens apply under `.dark` and under the OS media query unless `.light` — no flash, explicit Light wins.
- Offline: vite-plugin-pwa (generateSW, prompt updates) registered only from `src/lib/pwa.ts`, precaching the client build's shell; HTML is NetworkFirst and backend/API traffic is never cached; the query cache persists to IndexedDB (`src/lib/persist.ts`, 7-day maxAge, buster = build + user) and is cleared on sign-out — the installed app opens offline without serving stale code or another user's data.
- Fonts are self-hosted via @fontsource-variable packages imported in styles.css — no third-party font requests and the worker precaches them.

- Route graphics share routeColours.ts: stored palette slot or deterministic id fallback; create selects the least-used live-route slot, and backup imports preserve slots — list order and renames never change route identity.
- Persisted queries use Map-aware cacheSerialization and a format-version buster — route stats and habit history retain their Map shape after reload instead of crashing screens.
- Visual progress uses pure visualProgress helpers and shared LearningRouteCard; Today reads one RLS activity_strip aggregate RPC — visual summaries never add per-card or per-day requests.
- Summit celebrations are opened only after explicit locked summit saves; event keys are user/route/timestamp-scoped in localStorage and claimed before opening — refresh never repeats a celebration or writes from render.
- Today time logging reuses QuickCapture in session mode and its existing outbox/submission lock — no competing session-write flow.
