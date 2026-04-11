import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Eye, MousePointerClick, Newspaper, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/common/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateSEOScore, getPrimarySeoIssue } from "@/lib/blog";
import { cn } from "@/lib/utils";

type AnalyticsRow = {
  id: string;
  title: string;
  slug: string;
  status: string | null;
  published_at: string | null;
  category_id: string | null;
  view_count: number | null;
  cta_click_count: number | null;
  seo_score: number | null;
  content: string;
  excerpt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  cta_type: string | null;
  cta_text: string | null;
  blog_categories: { name: string | null } | null;
};

type SortKey = "title" | "view_count" | "cta_click_count" | "ctr" | "seo_score";

export default function AdminBlogAnalytics() {
  const [searchParams] = useSearchParams();
  const [sortKey, setSortKey] = useState<SortKey>("view_count");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [range, setRange] = useState("30d");

  const highlightId = searchParams.get("highlight");

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["admin-blog-analytics-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, status, published_at, category_id, view_count, cta_click_count, seo_score, content, excerpt, meta_title, meta_description, focus_keyword, featured_image_url, featured_image_alt, cta_type, cta_text, blog_categories(name)")
        .eq("status", "published")
        .order("view_count", { ascending: false });

      if (error) throw error;
      return (data as AnalyticsRow[]) || [];
    },
  });

  const enrichedPosts = useMemo(
    () =>
      posts.map((post) => {
        const fallbackSeo = calculateSEOScore(post);
        const score = post.seo_score ?? fallbackSeo.score;
        const views = post.view_count || 0;
        const clicks = post.cta_click_count || 0;
        const ctr = views > 0 ? (clicks / views) * 100 : 0;

        return {
          ...post,
          resolvedSeoScore: score,
          ctr,
          categoryName: (post.blog_categories as { name?: string } | null)?.name || "Uncategorized",
        };
      }),
    [posts],
  );

  const totals = useMemo(() => {
    const totalViews = enrichedPosts.reduce((sum, post) => sum + (post.view_count || 0), 0);
    const totalClicks = enrichedPosts.reduce((sum, post) => sum + (post.cta_click_count || 0), 0);
    const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    return {
      totalViews,
      totalClicks,
      publishedPosts: enrichedPosts.length,
      ctr,
    };
  }, [enrichedPosts]);

  const chartData = useMemo(
    () =>
      enrichedPosts.slice(0, 8).map((post) => ({
        name: post.title.length > 24 ? `${post.title.slice(0, 24)}…` : post.title,
        views: post.view_count || 0,
      })),
    [enrichedPosts],
  );

  const topViews = useMemo(() => enrichedPosts.slice(0, 5), [enrichedPosts]);
  const topCta = useMemo(
    () => [...enrichedPosts].sort((a, b) => (b.cta_click_count || 0) - (a.cta_click_count || 0)).slice(0, 5),
    [enrichedPosts],
  );

  const sortedPosts = useMemo(() => {
    const next = [...enrichedPosts].sort((left, right) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "title") return direction * left.title.localeCompare(right.title);
      if (sortKey === "ctr") return direction * (left.ctr - right.ctr);
      if (sortKey === "seo_score") return direction * (left.resolvedSeoScore - right.resolvedSeoScore);
      return direction * (((left[sortKey] as number | null) || 0) - ((right[sortKey] as number | null) || 0));
    });

    return next;
  }, [enrichedPosts, sortDirection, sortKey]);

  const lowSeoPosts = useMemo(
    () =>
      [...enrichedPosts]
        .filter((post) => post.resolvedSeoScore < 70)
        .sort((a, b) => a.resolvedSeoScore - b.resolvedSeoScore),
    [enrichedPosts],
  );

  const healthySeoCount = enrichedPosts.filter((post) => post.resolvedSeoScore >= 70).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "title" ? "asc" : "desc");
  };

  return (
    <div className="space-y-6">
      <SEOHead title="Blog Analytics" description="GiftMind blog analytics" noIndex />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary/70">Content Analytics</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Blog Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Views, CTA performance, and SEO health for published posts.</p>
        </div>

        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-11 w-[180px] rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Views", value: totals.totalViews.toLocaleString(), icon: Eye },
          { label: "CTA Clicks", value: totals.totalClicks.toLocaleString(), icon: MousePointerClick },
          { label: "Published", value: totals.publishedPosts.toLocaleString(), icon: Newspaper },
          { label: "CTR", value: `${totals.ctr.toFixed(1)}%`, icon: Target },
        ].map((card) => (
          <Card key={card.label} className="rounded-[24px] border-slate-200/80">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{card.value}</p>
              </div>
              <card.icon className="h-5 w-5 text-slate-400" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-[28px] border-slate-200/80">
        <CardHeader>
          <CardTitle>Views by Post</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={72} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="views" fill="hsl(262 83% 58%)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[28px] border-slate-200/80">
          <CardHeader>
            <CardTitle>Top Posts by Views</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topViews.map((post, index) => (
              <div key={post.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-950">{index + 1}. {post.title}</p>
                  <p className="text-xs text-slate-500">{post.categoryName}</p>
                </div>
                <span className="text-sm font-medium text-slate-600">{(post.view_count || 0).toLocaleString()} views</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/80">
          <CardHeader>
            <CardTitle>Top Posts by CTA Clicks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topCta.map((post, index) => (
              <div key={post.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-950">{index + 1}. {post.title}</p>
                  <p className="text-xs text-slate-500">{post.categoryName}</p>
                </div>
                <span className="text-sm font-medium text-slate-600">{(post.cta_click_count || 0).toLocaleString()} clicks</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] border-slate-200/80">
        <CardHeader>
          <CardTitle>All Posts Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("title")}>Title</button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => toggleSort("view_count")}>Views</button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => toggleSort("cta_click_count")}>CTA Clicks</button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => toggleSort("ctr")}>CTR</button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => toggleSort("seo_score")}>SEO</button>
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center text-slate-500">Loading analytics...</TableCell>
                </TableRow>
              ) : sortedPosts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center text-slate-500">No published posts yet.</TableCell>
                </TableRow>
              ) : (
                sortedPosts.map((post) => (
                  <TableRow key={post.id} className={cn(highlightId === post.id && "bg-primary/5")}>
                    <TableCell>
                      <Link to={`/admin/blog/edit/${post.id}`} className="font-medium text-slate-950 hover:text-primary">
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{(post.view_count || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{(post.cta_click_count || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{post.ctr.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={cn(
                        "rounded-full",
                        post.resolvedSeoScore >= 70 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700",
                      )}>
                        {post.resolvedSeoScore}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-700">
                        Live
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-slate-200/80">
        <CardHeader>
          <CardTitle>SEO Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lowSeoPosts.length > 0 ? (
            lowSeoPosts.map((post) => (
              <div key={post.id} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-slate-950">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    {post.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    SEO score {post.resolvedSeoScore} · {getPrimarySeoIssue(calculateSEOScore(post))}
                  </p>
                </div>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to={`/admin/blog/edit/${post.id}`}>Fix Post</Link>
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No published posts need SEO attention right now.</p>
          )}

          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {healthySeoCount} posts have SEO score above 70.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
