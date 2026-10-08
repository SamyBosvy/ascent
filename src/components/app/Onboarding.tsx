import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RouteDialog } from './RouteDialog';
import { markOnboarding, useOnboarding } from '@/lib/onboarding';
import type { RouteRow, RouteAgg } from '@/lib/data';
import { onboardingStep } from '@/lib/visualProgress';
import { useSubmission } from '@/hooks/use-submission';
import { Mountain } from './Mountain';
export function Onboarding({ routes, stats }: { routes: RouteRow[]; stats: Map<string, RouteAgg> }) {
  const { data: settings, isPending } = useOnboarding();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const { submitting: busy, submit } = useSubmission();
  const [explain, setExplain] = useState(false);
  const step = onboardingStep(routes, stats, settings?.onboarding_started_at ?? null, settings?.onboarding_done_at ?? null);
  if (isPending || step == null) return null;
  const route = routes[0];
  const added = routes.some(r => (stats.get(r.id)?.milestones_total ?? 0) > 0 || (stats.get(r.id)?.cards_total ?? 0) > 0);
  async function action(kind: 'start' | 'done') {
    await submit(async () => { await markOnboarding(qc, kind); if (kind === 'start') setOpen(true); });
  }
  return <section aria-label="Your first climb" className="space-y-4 border-b pb-6">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Your first climb · {explain ? 3 : step}/3</p><Button variant="ghost" className="h-12" disabled={busy} onClick={() => void action('done')}>Skip for now</Button></div>
    {step === 1 && !explain && <div className="space-y-3"><h2 className="font-semibold">Create your first route</h2><p className="text-sm text-muted-foreground">What would you like to learn?</p><Button className="h-12" disabled={busy} onClick={() => void action('start')}>Create route</Button></div>}
    {step === 2 && !explain && route && <div className="space-y-3"><h2 className="font-semibold">Add milestones or flashcards</h2><p className="text-sm text-muted-foreground">{route.name}{added ? ' · First milestone added.' : ''}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="h-12"><Link to="/routes/$id" params={{ id: route.id }}>Open route</Link></Button><Button variant="ghost" className="h-12" onClick={() => setExplain(true)}>How camps work</Button></div></div>}
    {(step === 3 || explain) && <div className="flex flex-wrap items-center gap-5"><Mountain camp={0} score={0} className="max-w-xs" /><div className="max-w-sm space-y-3"><h2 className="font-semibold">Camps and summits</h2><p className="text-sm text-muted-foreground">Your progress, study time and recall move you up the mountain. Camps mark your progress. When you’re ready, mark the route as summited.</p><Button className="h-12" disabled={busy} onClick={() => step === 3 ? void action('done') : setExplain(false)}>{step === 3 ? 'Ready to climb' : 'Back to my route'}</Button></div></div>}
    <RouteDialog key={key} open={open} onOpenChange={v => { setOpen(v); if (!v) setKey(k => k + 1); }} />
  </section>;
}
