-- Enums
DO $$ BEGIN
  CREATE TYPE public.note_category AS ENUM ('operacional', 'financeiro', 'comercial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.note_target_kind AS ENUM ('item', 'flight');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.quote_item_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  target_kind public.note_target_kind NOT NULL,
  target_id uuid NOT NULL,
  category public.note_category NOT NULL,
  note text NOT NULL,
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_item_notes_quote_id ON public.quote_item_notes(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_item_notes_target ON public.quote_item_notes(target_kind, target_id);

ALTER TABLE public.quote_item_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qin_select" ON public.quote_item_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "qin_insert" ON public.quote_item_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

CREATE POLICY "qin_update" ON public.quote_item_notes
  FOR UPDATE TO authenticated USING (auth.uid() = author_id OR is_admin(auth.uid()));

CREATE POLICY "qin_delete" ON public.quote_item_notes
  FOR DELETE TO authenticated USING (auth.uid() = author_id OR is_admin(auth.uid()));

CREATE TRIGGER trg_quote_item_notes_updated_at
  BEFORE UPDATE ON public.quote_item_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();