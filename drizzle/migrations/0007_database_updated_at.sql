CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables b ON b.table_schema = c.table_schema AND b.table_name = c.table_name WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND b.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t.table_name);
  END LOOP;
END;
$$;