# Ascent

**Every skill is a mountain. Climb it one camp at a time.**

## What Ascent is

Ascent is a private, invite-only app for tracking what you're learning. Each goal is a route (a book, language, skill, course, paper or habit), and you climb it from Base Camp through Camp 1, 2 and 3 to the Summit. Progress comes from what you actually do: milestones ticked, study time logged, pages read, habit check-ins and flashcard reviews. Notes and spaced-repetition cards live with each route, and Insights shows how the climb is going over time.

## Access

Ascent is invite-only. Public sign-up is disabled. The owner manages invites from **Settings > Access** (owner account only), and only invited emails can create an account. The owner role comes from a server secret, never from being the first account.

## Stack

- TanStack Start + React, Tailwind CSS
- Lovable Cloud (Supabase: auth, Postgres with row-level security)
- Installable PWA with offline support, an offline write queue and web push habit reminders

## Data

Each account's data is isolated with row-level security, including from the owner. Routes can be archived (hidden, data kept) or deleted with an undo window before they're permanently removed. Backup export and import are available in **Settings**.

## Development

    bun install      # or npm install
    bun run dev      # or npm run dev - start the dev server
    bun run test     # or npm run test - run the full test suite (vitest)
    bun run lint     # or npm run lint

## Architecture rules

Before making any change, read the architecture rules in AGENTS.md, plus src/components/app/AGENTS.md before touching components. In particular: accounts are created only through the registerAccount server function, nothing writes to the database from render or effects, summits need explicit user confirmation, and every query excludes soft-deleted routes.
