-- pgcrypto for symmetric encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Encrypt helper: returns bytea ciphertext for a plaintext password
CREATE OR REPLACE FUNCTION public.encrypt_email_password(plain text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := current_setting('app.email_encryption_key', true);
  IF v_key IS NULL OR length(v_key) = 0 THEN
    -- Fallback: read from env-backed GUC pushed by the server runtime.
    v_key := nullif(current_setting('email.encryption_key', true), '');
  END IF;
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'EMAIL_ENCRYPTION_KEY not configured for database';
  END IF;
  RETURN extensions.pgp_sym_encrypt(plain, v_key);
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_email_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(text) TO service_role;

-- Decrypt helper: returns plaintext for the given account id. service_role only.
CREATE OR REPLACE FUNCTION public.decrypt_email_password(_account_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_cipher bytea;
BEGIN
  v_key := current_setting('app.email_encryption_key', true);
  IF v_key IS NULL OR length(v_key) = 0 THEN
    v_key := nullif(current_setting('email.encryption_key', true), '');
  END IF;
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'EMAIL_ENCRYPTION_KEY not configured for database';
  END IF;
  SELECT password_encrypted INTO v_cipher FROM public.email_accounts WHERE id = _account_id;
  IF v_cipher IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN extensions.pgp_sym_decrypt(v_cipher, v_key);
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_email_password(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(uuid) TO service_role;

-- Restrict provider to gmail for now
ALTER TABLE public.email_accounts DROP CONSTRAINT IF EXISTS email_accounts_provider_check;
ALTER TABLE public.email_accounts ADD CONSTRAINT email_accounts_provider_check CHECK (provider = 'gmail');
