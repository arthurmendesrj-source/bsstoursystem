-- Cada usuário/conta tem suas próprias etiquetas; ids do Gmail (INBOX, SENT...) se repetem entre contas.
ALTER TABLE public.email_labels DROP CONSTRAINT IF EXISTS email_labels_pkey;
ALTER TABLE public.email_labels ADD CONSTRAINT email_labels_pkey PRIMARY KEY (owner_email, id);