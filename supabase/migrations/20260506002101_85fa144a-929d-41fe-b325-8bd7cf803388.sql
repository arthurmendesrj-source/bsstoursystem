CREATE UNIQUE INDEX IF NOT EXISTS itineraries_unique_per_user
  ON public.itineraries (created_by, original_filename, file_size_bytes)
  WHERE file_size_bytes IS NOT NULL;