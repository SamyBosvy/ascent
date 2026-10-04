import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RouteDialog } from './RouteDialog';
import { markOnboarding, useOnboarding } from '@/lib/onboarding';
import type { RouteRow, RouteAgg } from '@/lib/data';
export function Onboarding({ routes, stats }: { routes: RouteRow[]; stats: Map<string, RouteAgg> }) {
  const { data: settings, isPending } = useOnboarding();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState(false);
  if (isPending || settings?.onboarding_done_at || (routes.length > 0 && !settings?.onboarding_started_at)) return null;
  const route = routes[0];
  const added = routes.some(r => (stats.get(r.id)?.milestones_total ?? 0) > 0 || (stats.get(r.id)?.cards_total ?? 0) > 0);
  const step = !route ? 1 : added ? 3 : 2;
  async function action(kind: 'start' | 'done') {
    setBusy(true);
    try { await markOnboarding(qc, kind); if (kind === 'start') setOpen(true); }
    catch (e) { toast.error(`Couldn't save onboarding: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }
  return <section aria-label="Your first climb" className="space-y-4 border-b pb-6">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Every climb starts at base camp · {step}/3</p><Button variant="ghost" className="h-12" disabled={busy} onClick={() => void action('done')}>Skip</Button></div>
    <ol className="grid gap-4 sm:grid-cols-3">
      <li className={step === 1 ? 'space-y-2' : 'space-y-2 text-muted-foreground'}><h2 className="font-semibold">{route ? '✓ ' : ''}Create your first route</h2><p className="text-sm">A book, language, skill, course, paper or habit you want to master.</p>{step === 1 && <Button className="h-12" disabled={busy} onClick={() => void action('start')}>Create route</Button>}</li>
      <li className={step === 2 ? 'space-y-2' : 'space-y-2 text-muted-foreground'}><h2 className="font-semibold">{added ? '✓ ' : ''}Add milestones or flashcards</h2><p className="text-sm">Break it into milestones or chapters. Add flashcards, or import a CSV.</p>{step === 2 && route && <Button asChild variant="outline" className="h-12"><Link to="/routes/$id" params={{ id: route.id }}>Open route</Link></Button>}</li>
      <li className={step === 3 ? 'space-y-2' : 'space-y-2 text-muted-foreground'}><h2 className="font-semibold">Climb the mountain</h2><p className="text-sm">Progress, time and recall take you from Base Camp to Summit.</p><Popover><PopoverTrigger asChild><Button variant="link" className="h-12 px-0">How camps work</Button></PopoverTrigger><PopoverContent className="space-y-2 text-sm"><p className="font-semibold">How camps work</p><p>Progress contributes 50%, time 20%, and flashcards 30%. Parts you don’t use are left out.</p><p>Camp 1 at 15%, Camp 2 at 40%, Camp 3 at 65%, Summit at 90%. You can also set your camp by hand.</p></PopoverContent></Popover>{step === 3 && <Button className="h-12" disabled={busy} onClick={() => void action('done')}>Ready to climb</Button>}</li>
    </ol>
    <RouteDialog key={key} open={open} onOpenChange={v => { setOpen(v); if (!v) setKey(k => k + 1); }} />
  </section>;
}
