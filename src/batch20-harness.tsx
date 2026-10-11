import { createRoot } from 'react-dom/client';
import { SummitOverlay } from './components/app/SummitOverlay';
import { Empty } from './components/app/fields';
import { Button } from './components/ui/button';
import type { RouteRow } from './lib/data';

export function mount(kind: 'summit' | 'tent' | 'flag') {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const root = createRoot(host);
  const route = { id: 'visual-only', name: 'Test summit', type: 'book', created_at: '2026-10-01T12:00:00Z', summited_at: '2026-10-11T12:00:00Z' } as RouteRow;
  root.render(kind === 'summit' ? <SummitOverlay route={route} onDone={() => root.unmount()} returnFocus={null} /> : <Empty illustration={kind} title={kind === 'tent' ? 'No routes yet' : 'No summits yet'} description="Your learning journey will appear here." primaryAction={<Button>New route</Button>} />);
}