import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/_authenticated/insights';
import { createElement, type ComponentType } from 'react';

const capture = vi.hoisted(() => ({ bar: vi.fn(), line: vi.fn(), tooltip: vi.fn() }));
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => children,
  LineChart: ({ children }: { children: React.ReactNode }) => children,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  CartesianGrid: () => null, Legend: () => null, XAxis: () => null, YAxis: () => null,
  Bar: (props: unknown) => { capture.bar(props); return null; },
  Line: (props: unknown) => { capture.line(props); return null; },
  Tooltip: (props: unknown) => { capture.tooltip(props); return null; },
}));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => ({ options }), Link: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/data', () => ({
  useRoutes: () => ({ data: [{ id: 'r', name: 'Test', type: 'book' }] }),
  useRouteStats: () => ({ data: new Map([['r', { route_id: 'r', session_count: 3 }]]) }),
  weekStartDate: () => '2026-10-05', fetchPaged: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { sessions: [{ route_id: 'r', minutes: 30, logged_at: '2026-10-05T12:00:00Z' }], reviews: [{ rating: 2, reviewed_at: '2026-10-05T12:00:00Z' }], reviewCount: 10 } }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
it.each([true, false])('all chart motion follows reduced=%s', reduced => {
  const original = window.matchMedia('');
  vi.spyOn(window, 'matchMedia').mockReturnValue({ ...original, matches: reduced });
  render(createElement(Route.options.component as ComponentType));
  for (const spy of Object.values(capture)) {
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ isAnimationActive: !reduced }));
  }
});