ALTER TABLE public.cards ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();