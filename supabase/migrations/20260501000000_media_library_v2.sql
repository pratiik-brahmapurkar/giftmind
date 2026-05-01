ALTER TABLE public.blog_media
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'uncategorised',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS asset_type text NOT NULL DEFAULT 'blog-image',
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
    file_size_limit = 5242880
WHERE id = 'blog-media';

UPDATE public.blog_media
SET folder = 'blog',
    asset_type = 'blog-image'
WHERE folder = 'uncategorised';

CREATE INDEX IF NOT EXISTS blog_media_folder_idx ON public.blog_media(folder);
CREATE INDEX IF NOT EXISTS blog_media_asset_type_idx ON public.blog_media(asset_type);
CREATE INDEX IF NOT EXISTS blog_media_uploaded_by_idx ON public.blog_media(uploaded_by);

CREATE OR REPLACE FUNCTION public.refresh_media_usage_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blog_media bm
  SET usage_count = (
    SELECT COUNT(*)
    FROM public.blog_posts bp
    WHERE COALESCE(bp.featured_image_url, '') = bm.file_url
       OR COALESCE(bp.content, '') LIKE '%' || bm.file_url || '%'
       OR COALESCE(bp.featured_image_url, '') LIKE '%' || bm.id::text || '%'
       OR COALESCE(bp.content, '') LIKE '%' || bm.id::text || '%'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS blog_posts_media_usage_trigger ON public.blog_posts;
CREATE TRIGGER blog_posts_media_usage_trigger
AFTER INSERT OR UPDATE OF featured_image_url, content OR DELETE ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.refresh_media_usage_counts();

UPDATE public.blog_media bm
SET usage_count = (
  SELECT COUNT(*)
  FROM public.blog_posts bp
  WHERE COALESCE(bp.featured_image_url, '') = bm.file_url
     OR COALESCE(bp.content, '') LIKE '%' || bm.file_url || '%'
     OR COALESCE(bp.featured_image_url, '') LIKE '%' || bm.id::text || '%'
     OR COALESCE(bp.content, '') LIKE '%' || bm.id::text || '%'
);
