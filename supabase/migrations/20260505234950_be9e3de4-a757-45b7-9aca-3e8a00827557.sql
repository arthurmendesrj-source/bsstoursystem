
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
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
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
