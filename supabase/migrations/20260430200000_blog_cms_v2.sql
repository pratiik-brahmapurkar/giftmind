-- Blog CMS v2: scheduled publishing, server-side analytics, and attribution.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.blog_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS blog_view_events_dedup
  ON public.blog_view_events(post_id, ip_hash, viewed_at);

CREATE INDEX IF NOT EXISTS blog_view_events_post_created_idx
  ON public.blog_view_events(post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.blog_daily_stats (
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  date date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  cta_clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, date)
);

ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS source_blog_slug text;

ALTER TABLE public.blog_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.increment_blog_view(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blog_posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = post_id;

  INSERT INTO public.blog_daily_stats (post_id, date, views)
  VALUES (post_id, CURRENT_DATE, 1)
  ON CONFLICT (post_id, date)
  DO UPDATE SET views = public.blog_daily_stats.views + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_blog_cta_click(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blog_posts
  SET cta_click_count = COALESCE(cta_click_count, 0) + 1
  WHERE id = post_id;

  INSERT INTO public.blog_daily_stats (post_id, date, cta_clicks)
  VALUES (post_id, CURRENT_DATE, 1)
  ON CONFLICT (post_id, date)
  DO UPDATE SET cta_clicks = public.blog_daily_stats.cta_clicks + 1;
END;
$$;

DROP POLICY IF EXISTS service_insert_view_events ON public.blog_view_events;
CREATE POLICY service_insert_view_events
  ON public.blog_view_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_read_view_events ON public.blog_view_events;
CREATE POLICY admin_read_view_events
  ON public.blog_view_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('viewer', 'admin', 'superadmin')
    )
  );

DROP POLICY IF EXISTS service_manage_daily_stats ON public.blog_daily_stats;
CREATE POLICY service_manage_daily_stats
  ON public.blog_daily_stats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_read_daily_stats ON public.blog_daily_stats;
CREATE POLICY admin_read_daily_stats
  ON public.blog_daily_stats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('viewer', 'admin', 'superadmin')
    )
  );

CREATE OR REPLACE FUNCTION public.publish_scheduled_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_record record;
  published_count integer := 0;
BEGIN
  FOR post_record IN
    UPDATE public.blog_posts
    SET
      status = 'published',
      published_at = COALESCE(published_at, now()),
      updated_at = now()
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= now()
    RETURNING id, title, slug, author_id
  LOOP
    published_count := published_count + 1;

    IF post_record.author_id IS NOT NULL THEN
      INSERT INTO public.admin_audit_log (
        actor_id,
        actor_email,
        actor_role,
        action,
        target_type,
        target_id,
        target_label,
        payload
      )
      VALUES (
        post_record.author_id,
        'system@giftmind.in',
        'system',
        'auto_publish_post',
        'blog_post',
        post_record.id::text,
        post_record.title,
        jsonb_build_object('slug', post_record.slug, 'scheduled', true)
      );
    END IF;
  END LOOP;

  RETURN published_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('publish-scheduled-posts');
  END IF;
EXCEPTION
  WHEN undefined_function OR undefined_table THEN
    NULL;
END;
$$;

SELECT cron.schedule(
  'publish-scheduled-posts',
  '*/5 * * * *',
  $$SELECT public.publish_scheduled_posts();$$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('purge-old-blog-views');
  END IF;
EXCEPTION
  WHEN undefined_function OR undefined_table THEN
    NULL;
END;
$$;

SELECT cron.schedule(
  'purge-old-blog-views',
  '0 4 * * 0',
  $$DELETE FROM public.blog_view_events WHERE created_at < now() - interval '90 days';$$
);
