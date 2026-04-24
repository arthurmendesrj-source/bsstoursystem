-- Table to track generated proposal documents
CREATE TABLE public.quote_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  format TEXT NOT NULL DEFAULT 'docx',
  price_mode TEXT NOT NULL DEFAULT 'detailed',
  language TEXT NOT NULL DEFAULT 'en',
  tone TEXT NOT NULL DEFAULT 'inspirational',
  include_itinerary BOOLEAN NOT NULL DEFAULT true,
  storage_path TEXT NOT NULL,
  title TEXT
);

CREATE INDEX idx_quote_documents_quote_id ON public.quote_documents(quote_id);

ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view quote documents"
  ON public.quote_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create quote documents"
  ON public.quote_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators or admins can delete quote documents"
  ON public.quote_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- Private bucket for generated proposal .docx files
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-docs', 'proposal-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read proposal docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'proposal-docs');

CREATE POLICY "Authenticated users can upload proposal docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'proposal-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners or admins can delete proposal docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-docs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );