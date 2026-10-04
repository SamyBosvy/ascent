# Batch 7 — Review, loading and first-run polish

## Changes
- Review: cache all four scheduling previews for each card appearance and save the selected exact result; add compact interval labels, accessible session progress, revealed-card touch swipes and a reduced-motion-safe reveal.
- Loading: use screen-shaped skeletons with an accessible loading status, including settings and note editors; disable pulsing for reduced motion.
- Onboarding: inline three steps on Today, automatically advance from route creation to milestones/cards, then camps. Persist dismissal/completion per account so it follows the user across devices. Existing accounts with routes do not start onboarding; an onboarding started before the first route continues until dismissed/completed.
- Contrast follow-ups: restore distinct AA-compliant primary/destructive hover fills and lighten field boundaries to the 3:1 limit, preserving all existing ink tokens.

## Technical details
- Add `user_settings.onboarding_done_at` and a nullable started timestamp to distinguish a continuing onboarding from an existing account. Writes only follow explicit user actions, not rendering or effects.
- Keep scheduling through `schedule()` and saving/undo through the existing durable RPC paths. Invalidate affected queries after mutations.
- Preserve the layout and existing mountain/blue/gold presentation.

## Verification and report
- Check light/dark hover and field-boundary contrast numerically.
- Test scheduling-preview reuse and interval formatting; verify reduced-motion and loading accessibility.
- Run signed-in browser checks using a temporary route and cards, including a rating and Undo, then remove temporary data.
- Report each item's status, changed files and migration. Manual typechecks are prohibited by this environment; report automatic validation separately.
