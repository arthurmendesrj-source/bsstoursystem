
-- Conversations
CREATE TABLE public.ai_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nova conversa',
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_conv_user ON public.ai_conversations(user_id, last_message_at DESC);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conv_select" ON public.ai_conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ai_conv_insert" ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_conv_update" ON public.ai_conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ai_conv_delete" ON public.ai_conversations FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages
CREATE TABLE public.ai_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content text,
  tool_calls jsonb,
  tool_call_id text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_msg_conv ON public.ai_messages(conversation_id, created_at);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_msg_select" ON public.ai_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY "ai_msg_insert" ON public.ai_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "ai_msg_delete" ON public.ai_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR public.is_admin(auth.uid()))));

-- Pending actions
CREATE TABLE public.ai_pending_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.ai_messages(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX idx_ai_actions_conv ON public.ai_pending_actions(conversation_id, created_at);
CREATE INDEX idx_ai_actions_user_status ON public.ai_pending_actions(user_id, status);
ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_act_select" ON public.ai_pending_actions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ai_act_insert" ON public.ai_pending_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_act_update" ON public.ai_pending_actions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ai_act_delete" ON public.ai_pending_actions FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Generated images
CREATE TABLE public.ai_generated_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  prompt text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_generated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_img_select" ON public.ai_generated_images FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ai_img_insert" ON public.ai_generated_images FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_img_delete" ON public.ai_generated_images FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('ai-images','ai-images', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ai-images user select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ai-images' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid())));
CREATE POLICY "ai-images user insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ai-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "ai-images user delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ai-images' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid())));
