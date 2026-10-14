CREATE INDEX IF NOT EXISTS cards_route_id_idx ON public.cards (route_id);
CREATE INDEX IF NOT EXISTS notes_route_id_idx ON public.notes (route_id);
DROP INDEX IF EXISTS public.checkins_route_day_idx;
