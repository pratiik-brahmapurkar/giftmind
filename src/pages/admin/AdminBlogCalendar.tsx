import { useMemo, useState } from "react";
import { addDays, endOfMonth, format, isSameDay, startOfMonth, startOfWeek, addMonths } from "date-fns";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/common/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CalendarPost = {
  id: string;
  title: string;
  slug: string;
  status: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  updated_at: string | null;
};

function getPostDate(post: CalendarPost) {
  if (post.status === "scheduled") return post.scheduled_at;
  if (post.status === "published") return post.published_at;
  return post.updated_at;
}

function badgeClass(status: string | null) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "scheduled") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function AdminBlogCalendar() {
  const [month, setMonth] = useState(() => new Date());
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });

  const { data: posts = [] } = useQuery({
    queryKey: ["admin-blog-calendar", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, status, published_at, scheduled_at, updated_at")
        .or(`published_at.gte.${monthStart.toISOString()},scheduled_at.gte.${monthStart.toISOString()},updated_at.gte.${monthStart.toISOString()}`)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(500);

      if (error) throw error;
      return (data || []) as CalendarPost[];
    },
  });

  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart]);
  const nextThirtyDays = useMemo(() => {
    const now = new Date();
    const limit = addDays(now, 30);
    return posts
      .filter((post) => post.status === "scheduled" && post.scheduled_at)
      .filter((post) => {
        const date = new Date(post.scheduled_at!);
        return date >= now && date <= limit;
      })
      .sort((left, right) => new Date(left.scheduled_at!).getTime() - new Date(right.scheduled_at!).getTime());
  }, [posts]);

  return (
    <div className="space-y-6">
      <SEOHead title="Blog Calendar" description="GiftMind editorial calendar" noIndex />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary/70">Editorial Calendar</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Blog Calendar</h1>
          <p className="mt-1 text-sm text-slate-500">Published, scheduled, and recently edited drafts by month.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => setMonth((current) => addMonths(current, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-40 text-center font-medium text-slate-900">{format(month, "MMMM yyyy")}</div>
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => setMonth((current) => addMonths(current, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-[28px] border-slate-200/80">
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {days.map((day) => {
                const dayPosts = posts.filter((post) => {
                  const value = getPostDate(post);
                  return value ? isSameDay(new Date(value), day) : false;
                });

                return (
                  <div key={day.toISOString()} className={cn("min-h-32 rounded-2xl border border-slate-200 bg-white p-2", day.getMonth() !== month.getMonth() && "bg-slate-50 text-slate-400")}>
                    <div className="text-xs font-medium">{format(day, "d")}</div>
                    <div className="mt-2 space-y-1">
                      {dayPosts.slice(0, 4).map((post) => (
                        <Link key={post.id} to={`/admin/blog/edit/${post.id}`} className={cn("block truncate rounded-full border px-2 py-1 text-[11px]", badgeClass(post.status))}>
                          {post.status === "scheduled" && post.scheduled_at ? `${format(new Date(post.scheduled_at), "HH:mm")} ` : ""}
                          {post.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Next 30 days
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextThirtyDays.length > 0 ? nextThirtyDays.map((post) => (
              <Link key={post.id} to={`/admin/blog/edit/${post.id}`} className="block rounded-2xl border border-slate-200 p-3 transition hover:border-primary/30 hover:bg-primary/5">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-slate-950">{post.title}</p>
                  <Badge variant="outline" className={cn("rounded-full", badgeClass(post.status))}>Scheduled</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{post.scheduled_at ? format(new Date(post.scheduled_at), "MMM d, h:mm a") : "No date"}</p>
              </Link>
            )) : (
              <p className="text-sm text-slate-500">No scheduled posts in the next 30 days.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
