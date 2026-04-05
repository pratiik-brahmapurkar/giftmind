
CREATE OR REPLACE FUNCTION public.increment_post_views(post_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE blog_posts SET views = views + 1 WHERE slug = post_slug;
END;
$$;

-- Allow anon/authenticated to call this function
GRANT EXECUTE ON FUNCTION public.increment_post_views(text) TO anon, authenticated;

-- Allow anonymous users to read published blog posts and categories
CREATE POLICY "Anon can view published posts"
ON public.blog_posts FOR SELECT TO anon
USING (status = 'published'::blog_post_status);

CREATE POLICY "Anon can view categories"
ON public.blog_categories FOR SELECT TO anon
USING (true);
