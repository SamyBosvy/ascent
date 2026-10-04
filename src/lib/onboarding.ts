import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { must } from './data';
export function useOnboarding() {
  return useQuery({ queryKey: ['user-settings', 'onboarding'], queryFn: () => must<{ onboarding_started_at: string | null; onboarding_done_at: string | null }>(supabase.from('user_settings').select('onboarding_started_at,onboarding_done_at').maybeSingle()) });
}
/** Explicit user action only; never called by render/effects. */
export async function markOnboarding(qc: QueryClient, action: 'start' | 'done') {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw new Error('Please sign in again.');
  const now = new Date().toISOString();
  const { error } = await supabase.from('user_settings').upsert({ user_id: data.user.id, updated_at: now, ...(action === 'start' ? { onboarding_started_at: now } : { onboarding_done_at: now }) });
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ['user-settings'] });
}
