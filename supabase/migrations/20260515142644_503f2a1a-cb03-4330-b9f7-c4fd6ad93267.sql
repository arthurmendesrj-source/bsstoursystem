
-- whatsapp_accounts
CREATE TABLE public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number_id text NOT NULL UNIQUE,
  waba_id text NOT NULL,
  display_phone text NOT NULL,
  display_name text,
  access_token_encrypted text NOT NULL,
  app_secret_encrypted text,
  webhook_verify_token text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_error text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_accounts_user ON public.whatsapp_accounts(user_id);
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_accounts_select_own" ON public.whatsapp_accounts
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "wa_accounts_insert_own" ON public.whatsapp_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wa_accounts_update_own" ON public.whatsapp_accounts
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "wa_accounts_delete_own" ON public.whatsapp_accounts
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_wa_accounts_updated BEFORE UPDATE ON public.whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- whatsapp_conversations
CREATE TABLE public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  contact_name text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  window_expires_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, contact_phone)
);
CREATE INDEX idx_wa_conv_account ON public.whatsapp_conversations(account_id);
CREATE INDEX idx_wa_conv_lead ON public.whatsapp_conversations(lead_id);
CREATE INDEX idx_wa_conv_customer ON public.whatsapp_conversations(customer_id);
CREATE INDEX idx_wa_conv_last_msg ON public.whatsapp_conversations(last_message_at DESC);
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_conv_select_own" ON public.whatsapp_conversations
  FOR SELECT USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );
CREATE POLICY "wa_conv_modify_own" ON public.whatsapp_conversations
  FOR ALL USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  ) WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );

CREATE TRIGGER trg_wa_conv_updated BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- whatsapp_messages
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  wa_message_id text,
  type text NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  media_storage_path text,
  media_mime text,
  media_filename text,
  template_name text,
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  error_message text,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, wa_message_id)
);
CREATE INDEX idx_wa_msg_conv ON public.whatsapp_messages(conversation_id, sent_at DESC);
CREATE INDEX idx_wa_msg_account ON public.whatsapp_messages(account_id);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_msg_select_own" ON public.whatsapp_messages
  FOR SELECT USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );
CREATE POLICY "wa_msg_modify_own" ON public.whatsapp_messages
  FOR ALL USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  ) WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );

-- whatsapp_templates
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL,
  category text,
  status text,
  components jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, name, language)
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_tpl_select_own" ON public.whatsapp_templates
  FOR SELECT USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );
CREATE POLICY "wa_tpl_modify_own" ON public.whatsapp_templates
  FOR ALL USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  ) WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );

-- Storage bucket for media
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-media', 'whatsapp-media', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "wa_media_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media' AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.whatsapp_accounts a
      WHERE a.user_id = auth.uid()
        AND (storage.foldername(name))[1] = a.id::text
    )
  ));
CREATE POLICY "wa_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'whatsapp-media' AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.whatsapp_accounts a
      WHERE a.user_id = auth.uid()
        AND (storage.foldername(name))[1] = a.id::text
    )
  ));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;
