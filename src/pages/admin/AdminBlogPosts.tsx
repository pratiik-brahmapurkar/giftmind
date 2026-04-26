import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Search, MoreHorizontal, ChevronLeft, ChevronRight, Eye, BarChart3, Copy, Archive, Trash2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SEOHead } from "@/components/common/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BLOG_STATUS_META, getBlogPostDisplayDate, getBlogPostStatusTitle } from "@/lib/blog";
import { cn } from "@/lib/utils";
import { useCanDo } from "@/hooks/useCanDo";
import { logAdminAction } from "@/lib/adminAudit";

const PER_PAGE = 20;

type AdminBlogPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  status: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  scheduled_at: string | null;
  category_id: string | null;
  view_count: number | null;
  cta_click_count: number | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  tags: string[] | null;
  meta_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  cta_type: string | null;
  cta_text: string | null;
  cta_url: string | null;
  cta_occasion: string | null;
  blog_categories: { name: string; slug: string } | null;
};

export default function AdminBlogPosts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canDeletePosts = useCanDo("blog.delete");
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [deletePost, setDeletePost] = useState<AdminBlogPostRow | null>(null);

  const status = searchParams.get("status") || "all";
  const category = searchParams.get("category") || "all";
  const page = Number(searchParams.get("page") || "1");
  const fromDate = searchParams.get("from") || "";
  const toDate = searchParams.get("to") || "";
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    setSearchInput(searchParams.get("search") || "");
  }, [searchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const current = searchParams.get("search") || "";
      if (searchInput !== current) {
        updateParams({ search: searchInput || null, page: "1" });
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput, searchParams]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  };

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-blog-categories-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_categories")
        .select("id, name, slug")
        .order("sort_order");

      if (error) throw error;
      return data || [];
    },
  });

  const { data: postResult, isLoading } = useQuery({
    queryKey: ["admin-blog-posts", status, category, searchParams.get("search") || "", page, fromDate, toDate],
    queryFn: async () => {
      let query = supabase
        .from("blog_posts")
        .select(
          `id, title, slug, excerpt, content, status, published_at, created_at, updated_at, scheduled_at,
           category_id, view_count, cta_click_count, featured_image_url, featured_image_alt, tags,
           meta_title, meta_description, focus_keyword, cta_type, cta_text, cta_url, cta_occasion,
           blog_categories(name, slug)`,
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

      if (status !== "all") query = query.eq("status", status);
      if (category !== "all") query = query.eq("category_id", category);
      if (searchParams.get("search")) query = query.ilike("title", `%${searchParams.get("search")}%`);
      if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00`);
      if (toDate) query = query.lte("created_at", `${toDate}T23:59:59`);

      const { data, count, error } = await query;
      if (error) throw error;

      return {
        posts: (data as unknown as AdminBlogPostRow[]) || [],
        count: count || 0,
      };
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-blog-stats"],
    queryFn: async () => {
      const statuses = ["published", "draft", "scheduled", "archived"];
      const counts = await Promise.all(
        statuses.map(async (item) => {
          const { count, error } = await supabase
            .from("blog_posts")
            .select("id", { count: "exact", head: true })
            .eq("status", item);

          if (error) throw error;
          return [item, count || 0] as const;
        }),
      );

      return Object.fromEntries(counts) as Record<string, number>;
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (post: AdminBlogPostRow) => {
      const { data, error } = await supabase
        .from("blog_posts")
        .insert({
          title: `Copy of ${post.title}`,
          slug: `copy-${post.slug}-${Date.now()}`,
          excerpt: post.excerpt,
          content: post.content,
          category_id: post.category_id,
          tags: post.tags,
          featured_image_url: post.featured_image_url,
          featured_image_alt: post.featured_image_alt,
          cta_type: post.cta_type,
          cta_text: post.cta_text,
          cta_url: post.cta_url,
          cta_occasion: post.cta_occasion,
          meta_title: post.meta_title,
          meta_description: post.meta_description,
          focus_keyword: post.focus_keyword,
          status: "draft",
          author_id: user?.id || null,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Post duplicated as draft");
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blog_posts")
        .update({ status: "archived" })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post archived");
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (post: AdminBlogPostRow) => {
      const id = post.id;
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
      await logAdminAction({
        action: "delete_blog_post",
        targetType: "blog_post",
        targetId: id,
        targetLabel: post.title,
        payload: { slug: post.slug, status: post.status },
      });
    },
    onSuccess: () => {
      toast.success("Post deleted");
      setDeletePost(null);
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const posts = postResult?.posts || [];
  const totalCount = postResult?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  useEffect(() => {
    if (page > totalPages) {
      updateParams({ page: String(totalPages) });
    }
  }, [page, totalPages]);

  const statsCards = useMemo(
    () => [
      { key: "published", label: "Published", count: stats?.published || 0 },
      { key: "draft", label: "Drafts", count: stats?.draft || 0 },
      { key: "scheduled", label: "Scheduled", count: stats?.scheduled || 0 },
      { key: "archived", label: "Archived", count: stats?.archived || 0 },
    ],
    [stats],
  );

  return (
    <div className="space-y-6">
      <SEOHead title="Blog Posts" description="Manage GiftMind blog posts" noIndex />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary/70">Content Hub</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Blog Posts</h1>
          <p className="mt-1 text-sm text-slate-500">Manage drafts, publishing, schedules, and SEO performance from one place.</p>
        </div>
        <Button className="h-11 rounded-full px-5" onClick={() => navigate("/admin/blog/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Post
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {statsCards.map((item) => {
          const meta = BLOG_STATUS_META[item.key as keyof typeof BLOG_STATUS_META];
          const active = status === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => updateParams({ status: active ? null : item.key, page: "1" })}
              className={cn(
                "rounded-[22px] border p-4 text-left transition-colors",
                active ? meta.pillClass : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                {item.label}
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-950">{item.count}</div>
            </button>
          );
        })}
      </div>

      <Card className="rounded-[26px] border-slate-200/80">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 xl:grid-cols-[1fr_180px_220px_170px_170px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search posts by title..."
                className="h-11 rounded-full border-slate-200 pl-9"
              />
            </div>

            <Select value={status} onValueChange={(value) => updateParams({ status: value, page: "1" })}>
              <SelectTrigger className="h-11 rounded-full">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            <Select value={category} onValueChange={(value) => updateParams({ category: value, page: "1" })}>
              <SelectTrigger className="h-11 rounded-full">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={fromDate}
              onChange={(event) => updateParams({ from: event.target.value || null, page: "1" })}
              className="h-11 rounded-full"
            />

            <Input
              type="date"
              value={toDate}
              onChange={(event) => updateParams({ to: event.target.value || null, page: "1" })}
              className="h-11 rounded-full"
            />
          </div>

          <div className="overflow-hidden rounded-[22px] border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">CTA Clicks</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-14 text-center text-sm text-slate-500">
                      Loading posts...
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && posts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-14 text-center text-sm text-slate-500">
                      No posts match the current filters.
                    </TableCell>
                  </TableRow>
                )}

                {posts.map((post) => {
                  const meta = BLOG_STATUS_META[(post.status || "draft") as keyof typeof BLOG_STATUS_META];
                  const isPublished = post.status === "published";

                  return (
                    <TableRow
                      key={post.id}
                      className={cn(highlightId === post.id && "bg-primary/5")}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                          <span className="text-sm text-slate-500">{meta.label}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <button
                          type="button"
                          className="max-w-[360px] text-left"
                          onClick={() => navigate(`/admin/blog/edit/${post.id}`)}
                        >
                          <div className="font-medium text-slate-950">{getBlogPostStatusTitle(post)}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            /blog/{post.slug}
                          </div>
                        </button>
                      </TableCell>

                      <TableCell>
                        {post.blog_categories?.name ? (
                          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-700">
                            {post.blog_categories.name}
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-400">Uncategorized</span>
                        )}
                      </TableCell>

                      <TableCell className="text-sm text-slate-500">
                        {getBlogPostDisplayDate(post)}
                        {post.status === "scheduled" && post.scheduled_at ? (
                          <div className="text-xs text-slate-400">{format(new Date(post.scheduled_at), "p")}</div>
                        ) : null}
                      </TableCell>

                      <TableCell className="text-right text-sm text-slate-700">
                        {isPublished ? (post.view_count || 0).toLocaleString() : "—"}
                      </TableCell>

                      <TableCell className="text-right text-sm text-slate-700">
                        {isPublished ? (post.cta_click_count || 0).toLocaleString() : "—"}
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => navigate(`/admin/blog/edit/${post.id}`)}>
                              <PencilLine className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(`/blog/${post.slug}?preview=true`, "_blank", "noopener,noreferrer")}>
                              <Eye className="mr-2 h-4 w-4" />
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicateMutation.mutate(post)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => archiveMutation.mutate(post.id)}>
                              <Archive className="mr-2 h-4 w-4" />
                              Archive
                            </DropdownMenuItem>
                            {isPublished && (
                              <DropdownMenuItem onClick={() => navigate(`/admin/blog/analytics?highlight=${post.id}`)}>
                                <BarChart3 className="mr-2 h-4 w-4" />
                                View Analytics
                              </DropdownMenuItem>
                            )}
                            {canDeletePosts && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeletePost(post)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deletePost} onOpenChange={(open) => !open && setDeletePost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete blog post</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deletePost?.title}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletePost && deleteMutation.mutate(deletePost)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
