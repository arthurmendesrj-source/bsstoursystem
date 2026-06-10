
-- Enforce strict tenant isolation: convert tenant_isolation_* policies to RESTRICTIVE
-- and add a BEFORE INSERT trigger to default tenant_id from current_tenant_id().

CREATE OR REPLACE FUNCTION public.set_tenant_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.current_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'activity_log','ai_conversations','ai_generated_images','ai_messages','ai_pending_actions',
    'billing_credit_ledger','billing_credit_wallet','billing_customers','billing_invoices',
    'billing_payment_methods','billing_topups',
    'booking_item_confirmations','booking_pax','booking_suppliers','bookings',
    'customers','email_attachments','email_labels','email_message_links','email_sync_state',
    'email_threads','emails','exchange_rates','interactions','invoices','itineraries',
    'itinerary_chunks','lead_alert_snoozes','leads','notification_logs','notification_preferences',
    'operations_activities','package_dates','packages','push_subscriptions',
    'quote_documents','quote_flights','quote_item_notes','quote_items','quotes',
    'sla_escalations','sla_settings','storage_access_log','subscriptions',
    'supplier_contacts','supplier_documents','supplier_rates','suppliers','tasks',
    'tenant_domains','usage_ai_events','usage_storage_daily',
    'user_email_accounts','user_field_permissions','user_gmail_tokens','user_module_permissions',
    'voucher_send_log','vouchers',
    'whatsapp_accounts','whatsapp_conversations','whatsapp_messages','whatsapp_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop existing permissive isolation policy (if any)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_restrictive_%I ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert_restrictive_%I ON public.%I', t, t);

    -- Recreate as RESTRICTIVE for ALL: every row access must pass the tenant filter
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_restrictive_%1$I
      ON public.%1$I AS RESTRICTIVE FOR ALL
      TO authenticated
      USING (
        public.is_super_admin(auth.uid())
        OR tenant_id = public.current_tenant_id()
        OR (public.current_tenant_id() IS NULL AND public.is_tenant_member(tenant_id, auth.uid()))
      )
      WITH CHECK (
        public.is_super_admin(auth.uid())
        OR tenant_id = public.current_tenant_id()
        OR (public.current_tenant_id() IS NULL AND public.is_tenant_member(tenant_id, auth.uid()))
      )
    $f$, t);

    -- Ensure RLS is enabled (no-op if already on)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Default tenant_id on insert
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_default_trg ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_tenant_id_default_trg BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()', t);
  END LOOP;
END $$;
