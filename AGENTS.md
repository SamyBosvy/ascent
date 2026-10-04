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
- Reviews save through the idempotent `record_review` RPC via a localStorage-backed queue (`src/lib/reviewQueue.ts`) — ratings are never lost and never double-counted.
- The study timer lives in localStorage (`src/lib/timer.ts`), time derived from timestamps — survives navigation and refresh; one session at a time.
- Never write to the database from render or effects based on computed scores; summits need explicit user confirmation.
- Routes are archived via `archived_at` (hidden from Today/Routes/Review, data kept) and deleted via `deleted_at` soft delete; every query excludes soft-deleted routes, and `purge_deleted_routes` hard-deletes (cascade) after the undo window (toast close + on app load) — gives undo without a scheduler.
- Milestone reorder goes through the atomic `swap_milestones` RPC — positions can never end up half-swapped.
- New notes start as drafts (`/notes/new`) and are inserted on the first real edit via `NoteEditor`; saves run only after user edits — no empty rows, no save-on-open.
