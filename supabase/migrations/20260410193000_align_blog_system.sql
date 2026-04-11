-- Align the repo migrations with the current blog schema expected by the app.

ALTER TABLE IF EXISTS public.blog_posts
  ADD COLUMN IF NOT EXISTS featured_image_url text,
  ADD COLUMN IF NOT EXISTS featured_image_alt text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS focus_keyword text,
  ADD COLUMN IF NOT EXISTS seo_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cta_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS cta_url text,
  ADD COLUMN IF NOT EXISTS cta_occasion text,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cta_click_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blog_posts'
      AND column_name = 'featured_image'
  ) THEN
    EXECUTE '
      UPDATE public.blog_posts
      SET featured_image_url = COALESCE(featured_image_url, featured_image)
      WHERE featured_image IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blog_posts'
      AND column_name = 'views'
  ) THEN
    EXECUTE '
      UPDATE public.blog_posts
      SET view_count = COALESCE(view_count, views)
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blog_posts'
      AND column_name = 'cta_clicks'
  ) THEN
    EXECUTE '
      UPDATE public.blog_posts
      SET cta_click_count = COALESCE(cta_click_count, cta_clicks)
    ';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.blog_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  alt_text text,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_media ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.blog_daily_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  view_date date NOT NULL DEFAULT CURRENT_DATE,
  view_count integer NOT NULL DEFAULT 0,
  UNIQUE(post_id, view_date)
);

ALTER TABLE public.blog_daily_views ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('blog-media', 'blog-media', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO public.blog_categories (name, slug, icon, description, sort_order)
VALUES
  ('Gift Guides', 'gift-guides', '🎁', 'Curated gift ideas for every occasion.', 1),
  ('Festival Gifting', 'festival-gifting', '🪔', 'Seasonal guides and cultural gifting ideas.', 2),
  ('Relationship Tips', 'relationship-tips', '💝', 'Thoughtful gifting advice for stronger relationships.', 3),
  ('Budget Friendly', 'budget-friendly', '💸', 'Great gifts that work within a budget.', 4),
  ('Corporate Gifting', 'corporate-gifting', '💼', 'Ideas for teams, clients, and workplace gifting.', 5),
  ('Product Updates', 'updates', '🚀', 'GiftMind product news and feature launches.', 6),
  ('Gift Psychology', 'gift-psychology', '🧠', 'Research-backed insights into how gifting feels and works.', 7)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

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

  INSERT INTO public.blog_daily_views (post_id, view_date, view_count)
  VALUES (post_id, CURRENT_DATE, 1)
  ON CONFLICT (post_id, view_date)
  DO UPDATE SET view_count = public.blog_daily_views.view_count + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_blog_view(uuid) TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blog_media' AND policyname = 'admin_select_blog_media'
  ) THEN
    CREATE POLICY admin_select_blog_media
    ON public.blog_media
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blog_media' AND policyname = 'admin_insert_blog_media'
  ) THEN
    CREATE POLICY admin_insert_blog_media
    ON public.blog_media
    FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blog_media' AND policyname = 'admin_update_blog_media'
  ) THEN
    CREATE POLICY admin_update_blog_media
    ON public.blog_media
    FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blog_media' AND policyname = 'admin_delete_blog_media'
  ) THEN
    CREATE POLICY admin_delete_blog_media
    ON public.blog_media
    FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blog_daily_views' AND policyname = 'admin_select_blog_daily_views'
  ) THEN
    CREATE POLICY admin_select_blog_daily_views
    ON public.blog_daily_views
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'admin_upload_blog_media'
  ) THEN
    CREATE POLICY admin_upload_blog_media
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'blog-media'
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public_read_blog_media'
  ) THEN
    CREATE POLICY public_read_blog_media
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'blog-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'admin_delete_blog_media'
  ) THEN
    CREATE POLICY admin_delete_blog_media
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'blog-media'
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
    );
  END IF;
END $$;
