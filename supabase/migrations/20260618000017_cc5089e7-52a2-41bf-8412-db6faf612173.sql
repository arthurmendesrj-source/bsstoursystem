
CREATE TABLE public.email_ai_cache (
  message_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_ai_cache TO authenticated;
GRANT ALL ON public.email_ai_cache TO service_role;

ALTER TABLE public.email_ai_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own email ai cache"
  ON public.email_ai_cache FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
