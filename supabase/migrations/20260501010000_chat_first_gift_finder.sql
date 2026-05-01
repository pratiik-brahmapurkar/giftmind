CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'wizard',
  ADD COLUMN IF NOT EXISTS chat_thread_id uuid;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'wizard';

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'gated', 'closed')),
  source_surface text NOT NULL DEFAULT 'landing' CHECK (source_surface IN ('landing', 'dashboard', 'blog')),
  blog_post_slug text,
  slots jsonb NOT NULL DEFAULT '{}',
  last_results jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_threads_owner_check CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content jsonb NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]',
  credit_charged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_credits (
  guest_id text PRIMARY KEY,
  fingerprint_hash text,
  credit_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  ip_country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gift_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  body_md text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  embedding vector(1536),
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.occasion_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  occasion text NOT NULL,
  title text NOT NULL,
  body_md text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  embedding vector(1536),
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_threads_user_id_idx ON public.chat_threads(user_id);
CREATE INDEX IF NOT EXISTS chat_threads_guest_id_idx ON public.chat_threads(guest_id);
CREATE INDEX IF NOT EXISTS chat_messages_thread_id_idx ON public.chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS gift_guides_published_idx ON public.gift_guides(published);
CREATE INDEX IF NOT EXISTS occasion_playbooks_occasion_idx ON public.occasion_playbooks(occasion);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occasion_playbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_threads_select_own ON public.chat_threads;
CREATE POLICY chat_threads_select_own ON public.chat_threads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_threads_insert_own ON public.chat_threads;
CREATE POLICY chat_threads_insert_own ON public.chat_threads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_threads_update_own ON public.chat_threads;
CREATE POLICY chat_threads_update_own ON public.chat_threads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_select_own ON public.chat_messages;
CREATE POLICY chat_messages_select_own ON public.chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_threads ct
    WHERE ct.id = chat_messages.thread_id AND ct.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS published_gift_guides_public ON public.gift_guides;
CREATE POLICY published_gift_guides_public ON public.gift_guides
  FOR SELECT TO public
  USING (published = true);

DROP POLICY IF EXISTS published_occasion_playbooks_public ON public.occasion_playbooks;
CREATE POLICY published_occasion_playbooks_public ON public.occasion_playbooks
  FOR SELECT TO public
  USING (published = true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'feature_chat_finder') THEN
    UPDATE public.platform_settings SET value = 'false'::jsonb WHERE key = 'feature_chat_finder';
  ELSE
    INSERT INTO public.platform_settings (key, value, description)
    VALUES ('feature_chat_finder', 'false'::jsonb, 'Feature flag: Ask GiftMind chat-first gift discovery');
  END IF;

  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'provider_chain_chat_finder') THEN
    UPDATE public.platform_settings SET value = '["groq-llama","gemini-flash","claude-haiku"]'::jsonb WHERE key = 'provider_chain_chat_finder';
  ELSE
    INSERT INTO public.platform_settings (key, value, description)
    VALUES ('provider_chain_chat_finder', '["groq-llama","gemini-flash","claude-haiku"]'::jsonb, 'Provider chain for chat-first gift discovery');
  END IF;
END $$;

INSERT INTO public.occasion_playbooks (slug, occasion, title, body_md, tags, published)
VALUES
  ('birthday-general', 'birthday', 'Birthday gifting basics', 'Prefer gifts that acknowledge the person''s current life stage, hobbies, and the relationship closeness. Milestone birthdays can support a slightly more premium or keepsake-oriented recommendation.', ARRAY['birthday', 'milestone'], true),
  ('anniversary-general', 'anniversary', 'Anniversary gifting basics', 'Prioritise shared memories, quality time, and personal details. Avoid overly practical gifts unless the user explicitly asks for them.', ARRAY['anniversary', 'romantic'], true),
  ('fathers-day-general', 'fathers_day', 'Father''s Day gifting basics', 'For dads, strong recommendations often combine a hobby upgrade, useful quality, and a small personal story. Avoid generic mugs unless paired with meaningful context.', ARRAY['dad', 'father', 'hobbies'], true)
ON CONFLICT (slug) DO NOTHING;
