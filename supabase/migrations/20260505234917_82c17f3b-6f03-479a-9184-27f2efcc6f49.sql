
-- pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Itineraries
CREATE TABLE public.itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  title text NOT NULL,
  original_filename text NOT NULL,
  storage_path text NOT NULL,
  file_format text NOT NULL CHECK (file_format IN ('docx','pdf','doc')),
  file_size_bytes bigint,
  destinations text[] DEFAULT '{}',
  duration_days int,
  language text DEFAULT 'pt',
  tags text[] DEFAULT '{}',
  trip_type text,
  price_range text,
  estimated_value numeric,
  currency currency_code,
  suppliers_mentioned text[] DEFAULT '{}',
  customer_id uuid,
  season text,
  year int,
  notes text,
  extracted_text text,
  summary text,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','ready','failed')),
  processing_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_itineraries_status ON public.itineraries(processing_status);
CREATE INDEX idx_itineraries_destinations ON public.itineraries USING GIN(destinations);
CREATE INDEX idx_itineraries_tags ON public.itineraries USING GIN(tags);
CREATE INDEX idx_itineraries_trip_type ON public.itineraries(trip_type);

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read itineraries"
  ON public.itineraries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff insert itineraries"
  ON public.itineraries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role)));

CREATE POLICY "Staff update itineraries"
  ON public.itineraries FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role) OR auth.uid() = created_by);

CREATE POLICY "Staff delete itineraries"
  ON public.itineraries FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role));

CREATE TRIGGER itineraries_set_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Chunks + embeddings
CREATE TABLE public.itinerary_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itinerary_id, chunk_index)
);

CREATE INDEX idx_itinerary_chunks_itinerary ON public.itinerary_chunks(itinerary_id);
CREATE INDEX idx_itinerary_chunks_embedding
  ON public.itinerary_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.itinerary_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read itinerary_chunks"
  ON public.itinerary_chunks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage itinerary_chunks"
  ON public.itinerary_chunks FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role));

-- Match function for RAG
CREATE OR REPLACE FUNCTION public.match_itineraries(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  itinerary_id uuid,
  chunk_id uuid,
  chunk_index int,
  content text,
  similarity float,
  title text,
  destinations text[],
  trip_type text,
  duration_days int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    c.itinerary_id,
    c.id AS chunk_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity,
    i.title,
    i.destinations,
    i.trip_type,
    i.duration_days
  FROM public.itinerary_chunks c
  JOIN public.itineraries i ON i.id = c.itinerary_id
  WHERE c.embedding IS NOT NULL
    AND i.processing_status = 'ready'
    AND 1 - (c.embedding <=> query_embedding) > similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('itineraries', 'itineraries', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated read itineraries bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'itineraries');

CREATE POLICY "Staff upload itineraries bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'itineraries' AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role)));

CREATE POLICY "Staff update itineraries bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'itineraries' AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role)));

CREATE POLICY "Staff delete itineraries bucket"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'itineraries' AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role)));
