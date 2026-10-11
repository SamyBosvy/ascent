import { blockingError } from "@/lib/queryState";
import { RouteDot } from "@/components/app/RouteDot";
import { SuccessTick, useSuccessTick } from "@/components/app/SuccessTick";
import { useSubmission } from "@/hooks/use-submission";
import { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { LearningRouteCard } from '@/components/app/LearningRouteCard';
import { ActivityStrip } from '@/components/app/ActivityStrip';
import { QuickCapture } from '@/components/app/QuickCapture';
import { RouteDialog } from "@/components/app/RouteDialog";
import { useOnboarding } from "@/lib/onboarding";
import { onboardingStep } from "@/lib/visualProgress";
import { Onboarding } from "@/components/app/Onboarding";
import { CardDialog } from "@/components/app/CardDialog";
import { useNextDue, nextDueLabel } from "@/lib/nextDue";
import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Check, Layers, Play } from "lucide-react";
import { PacingLine } from "@/components/app/Pacing";
import { StreakLine } from "@/components/app/Habit";
import { timer, useTimer } from "@/lib/timer";
import { toggleCheckin } from "@/lib/checkins";
import { isLive, localDate, minutesLabel, useCheckinHistory, useDueCounts, useNewPerDay, useNewReviewedToday, useRefresh, useReviewsToday, useRouteStats, useRoutes, useUserSettings, useWeekMinutes, type RouteAgg, type RouteRow } from "@/lib/data";
import { habitConsistency, habitDueToday } from "@/lib/camp";
import { Empty, SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ property: "og:title", content: "Today — Ascent" }, { property: "og:description", content: "Your reviews, habits and routes for today." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Today — Ascent" }, { name: "description", content: "Your reviews, habits and routes for today." }] }),
  component: Today,
});

function Today() {
  const checkinTick = useSuccessTick();
  const { submitting: checkinBusy, submit: submitCheckin } = useSubmission();
  const [routeOpen, setRouteOpen] = useState(false);
  const onboarding = useOnboarding();
  const [logOpen, setLogOpen] = useState(false);
  const { user } = getRouteApi('/_authenticated').useRouteContext();
  const nameValue = user.user_metadata?.['display_name'] ?? user.user_metadata?.['full_name'] ?? user.user_metadata?.['name'];
  const name = typeof nameValue === 'string' ? nameValue.trim().split(/\s+/)[0] : '';
  const { data: allRoutes, error: routesError } = useRoutes();
  const routes = allRoutes?.filter(isLive);
  const { data: stats, error: statsError } = useRouteStats();
  const { data: dueCounts, error: dueError } = useDueCounts();
  const { data: newPerDay, error: settingsError } = useNewPerDay();
  const { data: newToday, error: newError } = useNewReviewedToday();
  // Same number Review shows: due reviews + new cards up to what's left of today's new-card limit.
  const due = dueCounts && newPerDay != null && newToday != null ? dueCounts.reviews + Math.min(dueCounts.fresh, Math.max(0, newPerDay - newToday)) : null;
  const { data: weekMinutes, error: weekError } = useWeekMinutes();
  const refresh = useRefresh();
  const [cardOpen, setCardOpen] = useState(false);
  const { data: nextDue } = useNextDue(undefined, due === 0);
  const { data: settings } = useUserSettings();
  const { data: reviewsToday } = useReviewsToday();
  const { data: history } = useCheckinHistory();
  const { state: running } = useTimer();
  { const e = blockingError([routesError, allRoutes], [statsError, stats], [dueError, dueCounts], [settingsError, newPerDay], [newError, newToday], [weekError, weekMinutes], [onboarding.error, onboarding.data]); if (e) throw e; }
  if (!routes || !stats || onboarding.isPending || due == null || weekMinutes == null) return <ScreenSkeleton screen="today" />;

  const totalCards = routes.reduce((a, r) => a + Number(stats.get(r.id)?.cards_total ?? 0), 0);
  const guided = onboardingStep(allRoutes ?? routes, stats, onboarding.data?.onboarding_started_at ?? null, onboarding.data?.onboarding_done_at ?? null) != null;
  const habits = routes.filter((r) => r.type === "habit" && r.status === "active");
  const dueHabits = habits.filter((h) => habitDueToday(h, stats.get(h.id)));
  const active = routes.filter((r) => r.status === "active" && r.type !== "habit");

  const toggle = (routeId: string, checked: boolean) => submitCheckin(async () => {
    const ok = await toggleCheckin(routeId, checked, refresh);
    if (ok && !checked) checkinTick.show(routeId);
  });

  const today = localDate();
  const goal = settings?.daily_goal ?? null;
  const cont = pickContinue(routes, stats);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: settings?.timezone }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><div>
        <p className="meta-text text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...(settings ? { timeZone: settings.timezone } : {}) })}</p>
        <h1 className="mt-1 page-title">{greeting}{name ? `, ${name}` : ''}.</h1>
      </div><Button variant="outline" className="h-12" disabled={!routes.some(r => r.status === 'active' || r.status === 'paused')} onClick={() => setLogOpen(true)}><Play className="size-4" />Log time</Button></div>
      <ActivityStrip />
      <QuickCapture open={logOpen} onOpenChange={setLogOpen} initialKind="session" initialRouteId={routes.filter(r => r.status === 'active').length === 1 ? routes.find(r => r.status === 'active')?.id : undefined} />

      <Onboarding routes={allRoutes ?? routes} stats={stats} />
      <RouteDialog open={routeOpen} onOpenChange={setRouteOpen} />
      <CardDialog open={cardOpen} onOpenChange={setCardOpen} />
      {!guided && <>

      {cont && <ContinueCard route={cont.route} agg={stats.get(cont.route.id)} timerBusy={!!running} checkinBusy={checkinBusy} onCheckin={() => void toggle(cont.route.id, false)} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {due === 0 ? (totalCards === 0 ? <Empty headingLevel={2} illustration="cards" title="No cards yet" description="Flashcards you add will be scheduled here." primaryAction={<Button onClick={() => setCardOpen(true)}>New card</Button>} /> : <div className="surface flex flex-col justify-center gap-2 p-5"><h2 className="card-title">Nothing due</h2><p className="meta-text text-muted-foreground">{nextDueLabel(nextDue)}</p><Link to="/review" className="inline-flex min-h-12 items-center body-text text-primary-strong underline underline-offset-4">Open review</Link></div>) : <div className="surface flex flex-col justify-between gap-4 p-5">
          <div>
            <p className="meta-text text-muted-foreground">Flashcards due</p>
            <p className="mt-1 stat-text">{due}</p>
            <p className="mt-1 meta-text text-muted-foreground">{due ? `${due} card${due > 1 ? "s" : ""} due. Keep climbing.` : "Nothing due. Clear skies."}</p>
            {goal != null && reviewsToday != null && (
              <div className="mt-3 space-y-1">
                <div
                  role="progressbar" aria-label="Daily review goal" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, reviewsToday)}
                  aria-valuetext={`${reviewsToday} of ${goal} reviews today`}
                  className="h-2 overflow-hidden rounded-full border border-input bg-muted"
                >
                  <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${Math.min(100, (reviewsToday / goal) * 100)}%` }} />
                </div>
                <p className="meta-text text-muted-foreground">{reviewsToday >= goal ? `Daily goal reached: ${reviewsToday}/${goal}.` : `${reviewsToday}/${goal} reviews toward today's goal.`}</p>
              </div>
            )}
          </div>
          {due ? (
            <Button asChild className="h-12">
              <Link to="/review">Start review</Link>
            </Button>
          ) : (
            <Button className="h-12" disabled>Start review</Button>
          )}
        </div>}
        <div className="surface p-5">
          <p className="meta-text text-muted-foreground">Time logged this week</p>
          <p className="mt-1 stat-text">{minutesLabel(weekMinutes)}</p>
          <p className="mt-1 meta-text text-muted-foreground">Since {settings?.week_start === 0 ? "Sunday" : "Monday"}.</p>
        </div>
      </div>

      <section>
        <SectionTitle>Habits today</SectionTitle>
        {habits.length === 0 ? (
          <Empty illustration="calendar" title="No habits yet" description="Track regular practice with a habit route." primaryAction={<Button onClick={() => setRouteOpen(true)}>Create route</Button>} />
        ) : (
          <ul className="space-y-2">
            {habits.map((h) => {
              const isDue = dueHabits.includes(h);
              const checkedToday = !!stats.get(h.id)?.checked_today;
              return (
                <li key={h.id} className="surface flex items-center gap-3 p-3 pl-4">
                  <Link to="/routes/$id" params={{ id: h.id }} className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 card-title"><RouteDot route={h} /><span className="truncate">{h.name}</span></p>
                    <p className="meta-text text-muted-foreground">{Math.round(habitConsistency(h, stats.get(h.id)) * 100)}% over the last 30 days</p>
                    <StreakLine route={h} dates={history?.get(h.id)} today={today} />
                  </Link>
                  {checkinTick.active === h.id && <SuccessTick className="text-primary-strong" />}
                  {checkedToday ? (
                    <Button disabled={checkinBusy} onClick={() => toggle(h.id, true)} variant="ghost" className="h-12 px-3 text-primary-strong" aria-label="Checked in today. Tap to undo.">
                      <Check className="h-4 w-4" /> Done
                    </Button>
                  ) : isDue ? (
                    <Button disabled={checkinBusy} onClick={() => toggle(h.id, false)} variant="outline" className="h-12 px-4">
                      <Check className="h-4 w-4" /> Check in
                    </Button>
                  ) : (
                    <span className="flex h-12 items-center gap-1 px-3 body-text text-primary-strong"><Check className="h-4 w-4" /> Done</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle action={<Link to="/routes" className="body-text text-primary-strong">All routes</Link>}>Active routes</SectionTitle>
        {active.length === 0 ? (
          <Empty illustration="tent" title="No active routes" description="Your current learning routes will appear here." primaryAction={<Button onClick={() => setRouteOpen(true)}>Create route</Button>} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((r) => {
              return (
                <li key={r.id}>
                  <LearningRouteCard route={r} agg={stats.get(r.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </>}
    </div>
  );
}

/** Most recently active live, unfinished route (session, review, milestone, check-in or page update). */
function pickContinue(routes: RouteRow[], stats: Map<string, RouteAgg>) {
  let best: { route: RouteRow; at: string } | null = null;
  for (const r of routes) {
    if (r.status === "summited" || r.status === "abandoned") continue;
    const a = stats.get(r.id);
    const times = [a?.last_session_at, a?.last_review_at, a?.last_milestone_at, a?.last_checkin_on, r.type === "book" && r.current_page ? r.updated_at : null].filter((t): t is string => !!t);
    if (!times.length) continue;
    const at = times.sort().at(-1);
    if (!at) continue;
    if (!best || at > best.at) best = { route: r, at };
  }
  return best;
}

function ContinueCard({ route, agg, timerBusy, checkinBusy, onCheckin }: { route: RouteRow; agg: RouteAgg | undefined; timerBusy: boolean; checkinBusy: boolean; onCheckin: () => void }) {
  const cards = Number(agg?.cards_total ?? 0);
  let action: React.ReactNode;
  if (route.type === "book" && route.total_pages) {
    action = <Button asChild className="h-12"><Link to="/routes/$id" params={{ id: route.id }} search={{ focus: "page" }}><BookOpen className="h-4 w-4" /> Update page</Link></Button>;
  } else if (route.type === "habit") {
    action = agg?.checked_today
      ? <span className="flex h-12 items-center gap-1 body-text text-primary-strong"><Check className="h-4 w-4" /> Checked in today</span>
      : <Button disabled={checkinBusy} className="h-12" onClick={onCheckin}><Check className="h-4 w-4" /> Check in</Button>;
  } else if (route.type === "language" || cards > 0) {
    action = <Button asChild className="h-12"><Link to="/review" search={{ route: route.id }}><Layers className="h-4 w-4" /> Start review</Link></Button>;
  } else if (!timerBusy) {
    action = <Button className="h-12" onClick={() => timer.start(route.id, route.name)}><Play className="h-4 w-4" /> Start timer</Button>;
  } else {
    action = <Button asChild className="h-12"><Link to="/routes/$id" params={{ id: route.id }}><ArrowRight className="h-4 w-4" /> Open route</Link></Button>;
  }
  return (
    <section aria-labelledby="continue-title" className="surface flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="min-w-0">
        <p id="continue-title" className="body-text text-muted-foreground">Continue where you left off</p>
        <Link to="/routes/$id" params={{ id: route.id }} className="mt-1 flex items-center gap-2 card-title hover:underline"><RouteDot route={route} /><span className="truncate">{route.name}</span></Link>
        <PacingLine route={route} agg={agg} className="mt-1" />
      </div>
      {action}
    </section>
  );
}
