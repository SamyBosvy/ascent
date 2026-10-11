import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/_authenticated/routes.$id';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ id: 'r' }), useSearch: () => ({}) }),
  getRouteApi: () => ({ useRouteContext: () => ({ user: { id: 'u' } }) }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({}) }));
vi.mock('@/lib/data', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/data')>(),
  useRoutes: () => ({ data: [{ id: 'r', name: 'Test route', type: 'book', status: 'active' }] }),
  useRouteStats: () => ({ data: new Map() }),
  useCheckinHistory: () => ({ data: new Map() }),
  useRefresh: () => vi.fn(),
}));
vi.mock('@/components/app/HabitReminderSettings', () => ({ HabitReminderSettings: () => null }));
vi.mock('@/components/app/RouteDialog', () => ({ RouteDialog: () => null }));
vi.mock('@/components/app/CardDialog', () => ({ CardDialog: () => null }));
vi.mock('@/components/app/CsvImportDialog', () => ({ CsvImportDialog: () => null }));
afterEach(cleanup);

it('places work headings before route management in the rendered DOM', () => {
  render(createElement(Route.options.component as ComponentType));
  const elements = [
    screen.getByRole('region', { name: 'Route progress and management' }),
    screen.getByRole('heading', { name: 'Milestones' }),
    screen.getByRole('heading', { name: 'Log a session' }),
    screen.getByRole('heading', { name: 'Flashcards' }),
    screen.getByRole('heading', { name: 'Notes' }),
    screen.getByRole('button', { name: 'Archive route' }),
    screen.getByRole('button', { name: 'Delete route' }),
  ];
  elements.slice(1).forEach((element, index) => {
    const previous = elements[index];
    if (!previous) throw new Error('Missing preceding section');
    expect(previous.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});