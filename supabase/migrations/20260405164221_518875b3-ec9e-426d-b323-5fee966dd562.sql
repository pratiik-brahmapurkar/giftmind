
-- Blog categories
CREATE TABLE IF NOT EXISTS public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text DEFAULT '📁',
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view categories" ON public.blog_categories;
CREATE POLICY "Public can view categories" ON public.blog_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Superadmins can insert categories" ON public.blog_categories;
CREATE POLICY "Superadmins can insert categories" ON public.blog_categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can update categories" ON public.blog_categories;
CREATE POLICY "Superadmins can update categories" ON public.blog_categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can delete categories" ON public.blog_categories;
CREATE POLICY "Superadmins can delete categories" ON public.blog_categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));

-- Blog posts
DO $$
BEGIN
  CREATE TYPE public.blog_post_status AS ENUM ('draft', 'published', 'scheduled', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text DEFAULT '',
  excerpt text,
  category_id uuid REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  status blog_post_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  scheduled_at timestamptz,
  author_id uuid NOT NULL,
  featured_image text,
  tags text[] DEFAULT '{}',
  views integer NOT NULL DEFAULT 0,
  cta_clicks integer NOT NULL DEFAULT 0,
  meta_title text,
  meta_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published posts" ON public.blog_posts;
CREATE POLICY "Public can view published posts" ON public.blog_posts FOR SELECT TO authenticated USING (status = 'published' OR public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can insert posts" ON public.blog_posts;
CREATE POLICY "Superadmins can insert posts" ON public.blog_posts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can update posts" ON public.blog_posts;
CREATE POLICY "Superadmins can update posts" ON public.blog_posts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can delete posts" ON public.blog_posts;
CREATE POLICY "Superadmins can delete posts" ON public.blog_posts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));

DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_blog_categories_updated_at ON public.blog_categories;
CREATE TRIGGER update_blog_categories_updated_at BEFORE UPDATE ON public.blog_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Blog media tracking
CREATE TABLE IF NOT EXISTS public.blog_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_url text NOT NULL,
  alt_text text DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  file_type text NOT NULL DEFAULT 'image/jpeg',
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can view all media" ON public.blog_media;
CREATE POLICY "Superadmins can view all media" ON public.blog_media FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can insert media" ON public.blog_media;
CREATE POLICY "Superadmins can insert media" ON public.blog_media FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can update media" ON public.blog_media;
CREATE POLICY "Superadmins can update media" ON public.blog_media FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can delete media" ON public.blog_media;
CREATE POLICY "Superadmins can delete media" ON public.blog_media FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));

-- Storage bucket for blog media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('blog-media', 'blog-media', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Superadmins can upload blog media" ON storage.objects;
CREATE POLICY "Superadmins can upload blog media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'superadmin'));
DROP POLICY IF EXISTS "Anyone can view blog media" ON storage.objects;
CREATE POLICY "Anyone can view blog media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'blog-media');
DROP POLICY IF EXISTS "Superadmins can delete blog media" ON storage.objects;
CREATE POLICY "Superadmins can delete blog media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'superadmin'));

-- Seed some categories
INSERT INTO public.blog_categories (name, slug, icon, description, sort_order) VALUES
  ('Gift Guides', 'gift-guides', '🎁', 'Curated gift guides for every occasion', 1),
  ('Occasion Tips', 'occasion-tips', '🎉', 'How to celebrate special moments', 2),
  ('Relationship Advice', 'relationship-advice', '💝', 'Strengthen bonds through thoughtful gifting', 3),
  ('Product Reviews', 'product-reviews', '⭐', 'Honest reviews of popular gift items', 4),
  ('GiftMind Updates', 'giftmind-updates', '📢', 'Platform news and feature announcements', 5)
ON CONFLICT (slug) DO NOTHING;
