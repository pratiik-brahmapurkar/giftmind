import { SEOHead } from "@/components/common/SEOHead";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight,
  FileText, Eye, MousePointerClick,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { sanitizeString } from "@/lib/validation";

type SortKey = "created_at" | "views" | "cta_clicks";
const PAGE_SIZE = 25;

const AdminBlogPosts = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-blog-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const categoryMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => { m[c.id] = c.name; });
    return m;
  }, [categories]);

  const stats = useMemo(() => ({
    published: posts.filter((p) => p.status === "published").length,
    drafts: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    totalViews: posts.reduce((s, p) => s + (p.views || 0), 0),
  }), [posts]);

  const filtered = useMemo(() => {
    let list = posts;
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter((p) => p.category_id === categoryFilter);
    const cleanSearch = sanitizeString(search, 200).toLowerCase();
    if (cleanSearch) {
      const q = cleanSearch;
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (p.tags as string[] || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "views") return (b.views || 0) - (a.views || 0);
      if (sortBy === "cta_clicks") return (b.cta_clicks || 0) - (a.cta_clicks || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [posts, statusFilter, categoryFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map((p) => p.id)));
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    toast.success("Post deleted");
    setDeleteId(null);
  };

  const handleDuplicate = async (post: any) => {
    const { error } = await supabase.from("blog_posts").insert({
      title: `${post.title} (Copy)`,
      slug: `${post.slug}-copy-${Date.now()}`,
      content: post.content,
      excerpt: post.excerpt,
      category_id: post.category_id,
      status: "draft" as const,
      author_id: post.author_id,
      tags: post.tags,
      featured_image: post.featured_image,
    });
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    toast.success("Post duplicated as draft");
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ status: "archived" as const }).eq("id", id);
    if (error) { toast.error("Failed to archive"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    toast.success("Post archived");
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selected.size === 0) return;
    const ids = Array.from(selected);
    if (bulkAction === "publish") {
      await supabase.from("blog_posts").update({ status: "published" as const, published_at: new Date().toISOString() }).in("id", ids);
    } else if (bulkAction === "archive") {
      await supabase.from("blog_posts").update({ status: "archived" as const }).in("id", ids);
    } else if (bulkAction === "delete") {
      await supabase.from("blog_posts").delete().in("id", ids);
    }
    queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    setSelected(new Set());
    setBulkAction(null);
    toast.success(`${ids.length} posts updated`);
  };

  const statusDot = (status: string) => {
    const colors: Record<string, string> = {
      published: "bg-green-500", scheduled: "bg-amber-500",
      draft: "bg-gray-400", archived: "bg-red-400",
    };
    return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-gray-400"}`} />;
  };

  return (
    <div className="space-y-6">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Blog Posts</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your blog content</p>
        </div>
        <Button onClick={() => navigate("/admin/blog/new")}>
          <Plus className="w-4 h-4 mr-1.5" /> New Post
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Published", value: stats.published, icon: FileText, color: "text-green-500" },
          { label: "Drafts", value: stats.drafts, icon: FileText, color: "text-muted-foreground" },
          { label: "Scheduled", value: stats.scheduled, icon: FileText, color: "text-amber-500" },
          { label: "Total Views", value: stats.totalViews.toLocaleString(), icon: Eye },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <span className={`text-xl font-bold ${s.color || ""}`}>{s.value}</span>
              </div>
              <s.icon className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by title or tag..." value={search} onChange={(e) => { setSearch(sanitizeString(e.target.value, 200)); setPage(0); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Newest</SelectItem>
            <SelectItem value="views">Most Views</SelectItem>
            <SelectItem value="cta_clicks">Most Clicks</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => { setBulkAction("publish"); handleBulkAction(); }}>Publish</Button>
            <Button size="sm" variant="outline" onClick={() => { setBulkAction("archive"); handleBulkAction(); }}>Archive</Button>
            <Button size="sm" variant="destructive" onClick={() => { setBulkAction("delete"); handleBulkAction(); }}>Delete</Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={paged.length > 0 && selected.size === paged.length} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="text-right hidden md:table-cell">Views</TableHead>
              <TableHead className="text-right hidden lg:table-cell">CTA Clicks</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : paged.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No posts found</TableCell></TableRow>
            ) : paged.map((p) => (
              <TableRow key={p.id}>
                <TableCell><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} /></TableCell>
                <TableCell>
                  <button className="flex items-center gap-2 text-left hover:underline" onClick={() => navigate(`/admin/blog/new?edit=${p.id}`)}>
                    {statusDot(p.status)}
                    <span className="font-medium text-sm truncate max-w-[220px]">{p.title}</span>
                  </button>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {p.category_id && categoryMap[p.category_id] ? (
                    <Badge variant="outline">{categoryMap[p.category_id]}</Badge>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                  {p.status === "published" && p.published_at
                    ? format(new Date(p.published_at), "MMM d, yyyy")
                    : p.status === "scheduled" && p.scheduled_at
                    ? `Scheduled: ${format(new Date(p.scheduled_at), "MMM d")}`
                    : "Draft"}
                </TableCell>
                <TableCell className="text-right text-sm hidden md:table-cell">{p.views}</TableCell>
                <TableCell className="text-right text-sm hidden lg:table-cell">{p.cta_clicks}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8" aria-label="Open post actions"><MoreHorizontal className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/admin/blog/new?edit=${p.id}`)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(p)}>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(p.id)}>Archive</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(p.id)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this blog post. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && handleDelete(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBlogPosts;
