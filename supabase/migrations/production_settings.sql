-- Scheduled blog post publishing (every 15 min)
SELECT cron.schedule(
  'publish-scheduled-posts',
  '*/15 * * * *',
  $$
    UPDATE public.blog_posts
    SET status = 'published', published_at = now()
    WHERE status = 'scheduled' AND scheduled_at <= now();
  $$
);
