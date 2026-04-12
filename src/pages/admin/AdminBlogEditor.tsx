import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowLeft,
  CalendarIcon,
  Check,
  Clock3,
  ImagePlus,
  Link2,
  Loader2,
  Quote,
  Save,
  Send,
  Sparkles,
  SplitSquareVertical,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { captureError } from "@/lib/sentry";
import {
  BLOG_CTA_OCCASIONS,
  buildBlogCtaUrl,
  calculateSEOScore,
  createBlogSlug,
  getReadTimeMinutes,
  getWordCount,
} from "@/lib/blog";
import { cn } from "@/lib/utils";
import { SEOHead } from "@/components/common/SEOHead";
import BlogMarkdown from "@/components/blog/BlogMarkdown";
import AiDraftModal from "@/components/blog-editor/AiDraftModal";
import MediaPickerModal from "@/components/blog-editor/MediaPickerModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type EditorStatus = "draft" | "published" | "scheduled";

type ExistingPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  category_id: string | null;
  tags: string[] | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  focus_keyword: string | null;
  seo_score: number | null;
  status: string | null;
  author_id: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  cta_type: string | null;
  cta_text: string | null;
  cta_url: string | null;
  cta_occasion: string | null;
  updated_at: string | null;
};

type SeoAssistantResult = {
  overall_score: number;
  improvements: Array<{ type: string; current: string; suggestion: string }>;
  missing_elements?: string[];
  rewritten_meta_description?: string;
};

const DEFAULT_CTA_TEXT = "Find the Perfect Gift →";
const DEFAULT_CTA_URL = "/gift-flow";
const TIME_SLOTS = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);

function getSeoTone(score: number) {
  if (score <= 40) return { label: "Needs work", color: "text-red-600", progress: "bg-red-500" };
  if (score <= 70) return { label: "Okay", color: "text-amber-600", progress: "bg-amber-500" };
  if (score <= 90) return { label: "Good", color: "text-emerald-600", progress: "bg-emerald-500" };
  return { label: "Excellent", color: "text-emerald-700", progress: "bg-emerald-600" };
}

function stripOccasionFromUrl(url: string | null, occasion: string | null) {
  if (!url) return DEFAULT_CTA_URL;
  if (!occasion) return url;

  return url
    .replace(new RegExp(`[?&]occasion=${encodeURIComponent(occasion)}(&)?`), (_, trailingAmp) => (trailingAmp ? "?" : ""))
    .replace(/[?&]$/, "");
}

export default function AdminBlogEditor() {
  const { id } = useParams();
  const mode = id ? "edit" : "create";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<EditorStatus>("draft");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [featuredImageUrl, setFeaturedImageUrl] = useState("");
  const [featuredImageAlt, setFeaturedImageAlt] = useState("");
  const [focusKeyword, setFocusKeyword] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [ctaEnabled, setCtaEnabled] = useState(true);
  const [ctaText, setCtaText] = useState(DEFAULT_CTA_TEXT);
  const [ctaUrl, setCtaUrl] = useState(DEFAULT_CTA_URL);
  const [ctaOccasion, setCtaOccasion] = useState("");
  const [editorMode, setEditorMode] = useState<"write" | "preview" | "split">("split");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [seoAssistantResult, setSeoAssistantResult] = useState<SeoAssistantResult | null>(null);
  const [seoAssistantOpen, setSeoAssistantOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingFeaturedImage, setUploadingFeaturedImage] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const markdownInputRef = useRef<HTMLTextAreaElement | null>(null);
  const featuredFileInputRef = useRef<HTMLInputElement | null>(null);
  const contentImageInputRef = useRef<HTMLInputElement | null>(null);
  const initialLoadRef = useRef(true);

  const { data: categories = [] } = useQuery({
    queryKey: ["blog-editor-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_categories")
        .select("id, name, slug")
        .order("sort_order");

      if (error) throw error;
      return data || [];
    },
  });

  const { data: tagSuggestions = [] } = useQuery({
    queryKey: ["blog-editor-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("tags");

      if (error) throw error;

      return Array.from(
        new Set(
          (data || [])
            .flatMap((item) => item.tags || [])
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));
    },
  });

  const { data: existingPost, isLoading } = useQuery({
    queryKey: ["blog-editor-post", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as ExistingPost;
    },
  });

  useEffect(() => {
    if (!existingPost) return;

    setTitle(existingPost.title);
    setSlug(existingPost.slug);
    setSlugTouched(true);
    setExcerpt(existingPost.excerpt || "");
    setContent(existingPost.content || "");
    setStatus((existingPost.status as EditorStatus) || "draft");
    setCategoryId(existingPost.category_id || "");
    setTags(existingPost.tags || []);
    setFeaturedImageUrl(existingPost.featured_image_url || "");
    setFeaturedImageAlt(existingPost.featured_image_alt || "");
    setFocusKeyword(existingPost.focus_keyword || "");
    setMetaTitle(existingPost.meta_title || "");
    setMetaDescription(existingPost.meta_description || "");
    setCanonicalUrl(existingPost.canonical_url || "");
    setCtaEnabled(existingPost.cta_type !== "none");
    setCtaText(existingPost.cta_text || DEFAULT_CTA_TEXT);
    setCtaUrl(stripOccasionFromUrl(existingPost.cta_url, existingPost.cta_occasion));
    setCtaOccasion(existingPost.cta_occasion || "");

    if (existingPost.scheduled_at) {
      const nextDate = new Date(existingPost.scheduled_at);
      setScheduledDate(nextDate);
      setScheduledTime(format(nextDate, "HH:00"));
    }

    if (existingPost.updated_at) {
      setLastSavedAt(new Date(existingPost.updated_at));
    }

    initialLoadRef.current = false;
    setDirty(false);
  }, [existingPost]);

  useEffect(() => {
    if (mode === "edit") return;
    initialLoadRef.current = false;
  }, [mode]);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(createBlogSlug(title));
    }
  }, [title, slugTouched]);

  useEffect(() => {
    if (!metaTitle) {
      setMetaTitle(title.slice(0, 60));
    }
  }, [title]);

  useEffect(() => {
    if (!metaDescription) {
      setMetaDescription(excerpt.slice(0, 160));
    }
  }, [excerpt]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    setDirty(true);
  }, [
    title,
    slug,
    excerpt,
    content,
    status,
    scheduledDate,
    scheduledTime,
    categoryId,
    tags,
    featuredImageUrl,
    featuredImageAlt,
    focusKeyword,
    metaTitle,
    metaDescription,
    canonicalUrl,
    ctaEnabled,
    ctaText,
    ctaUrl,
    ctaOccasion,
  ]);

  useEffect(() => {
    if (!slug.trim()) {
      setSlugError("");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      setSlugError("Use lowercase letters, numbers, and hyphens only.");
      return;
    }

    const timeout = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id")
        .eq("slug", slug)
        .neq("id", id || "")
        .maybeSingle();

      if (!error && data) {
        setSlugError("This slug is already taken.");
      } else {
        setSlugError("");
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [slug, id]);

  useEffect(() => {
    if (mode !== "edit" || !dirty) return;

    const timeout = window.setTimeout(() => {
      void savePost("draft", true);
    }, 60_000);

    return () => window.clearTimeout(timeout);
  }, [mode, dirty, title, slug, excerpt, content, status, categoryId, tags, featuredImageUrl, featuredImageAlt, focusKeyword, metaTitle, metaDescription, ctaEnabled, ctaText, ctaUrl, ctaOccasion, scheduledDate, scheduledTime]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const seoReport = useMemo(
    () =>
      calculateSEOScore({
        title,
        content,
        excerpt,
        meta_title: metaTitle || title,
        meta_description: metaDescription || excerpt,
        featured_image_url: featuredImageUrl,
        featured_image_alt: featuredImageAlt,
        focus_keyword: focusKeyword,
        cta_type: ctaEnabled ? "custom" : "none",
        cta_text: ctaEnabled ? ctaText : null,
      }),
    [title, content, excerpt, metaTitle, metaDescription, featuredImageUrl, featuredImageAlt, focusKeyword, ctaEnabled, ctaText],
  );

  const seoTone = getSeoTone(seoReport.score);
  const wordCount = getWordCount(content);
  const readTime = getReadTimeMinutes(content);

  const filteredTagSuggestions = useMemo(
    () =>
      tagSuggestions
        .filter((item) => !tags.includes(item))
        .filter((item) => (tagInput ? item.toLowerCase().includes(tagInput.toLowerCase()) : true))
        .slice(0, 8),
    [tagSuggestions, tags, tagInput],
  );

  const scheduledAtValue = useMemo(() => {
    if (status !== "scheduled" || !scheduledDate) return null;
    const combined = new Date(scheduledDate);
    const [hours, minutes] = scheduledTime.split(":").map(Number);
    combined.setHours(hours, minutes, 0, 0);
    return combined.toISOString();
  }, [status, scheduledDate, scheduledTime]);

  const insertAtCursor = (before: string, after = "", fallback = "") => {
    const element = markdownInputRef.current;
    if (!element) {
      setContent((previous) => `${previous}${before}${fallback}${after}`);
      return;
    }

    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const selection = content.slice(start, end) || fallback;
    const nextValue = `${content.slice(0, start)}${before}${selection}${after}${content.slice(end)}`;
    setContent(nextValue);

    requestAnimationFrame(() => {
      element.focus();
      const cursor = start + before.length + selection.length + after.length;
      element.selectionStart = cursor;
      element.selectionEnd = cursor;
    });
  };

  const addTag = (value = tagInput) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || tags.includes(normalized) || tags.length >= 10) return;
    setTags((previous) => [...previous, normalized]);
    setTagInput("");
  };

  const uploadFileToBlogMedia = async (file: File, altText: string) => {
    if (!user) throw new Error("You must be logged in to upload images.");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Only JPG, PNG, and WebP files are allowed.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Images must be under 5MB.");
    }

    const filePath = `featured/${Date.now()}_${file.name.replace(/\s+/g, "-")}`;
    const { data, error } = await supabase.storage
      .from("blog-media")
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage.from("blog-media").getPublicUrl(data.path);

    const { error: mediaError } = await supabase.from("blog_media").insert({
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      file_type: file.type,
      file_size: file.size,
      alt_text: altText,
      uploaded_by: user.id,
    });

    if (mediaError) throw mediaError;

    return publicUrlData.publicUrl;
  };

  const handleFeaturedImageUpload = async (file: File) => {
    setUploadingFeaturedImage(true);
    try {
      const altText = featuredImageAlt.trim() || file.name.replace(/\.[^.]+$/, "");
      const publicUrl = await uploadFileToBlogMedia(file, altText);
      setFeaturedImageUrl(publicUrl);
      if (!featuredImageAlt.trim()) setFeaturedImageAlt(altText);
      toast.success("Featured image uploaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload image";
      console.error("[featured-image-upload]", error);
      toast.error(message);
    } finally {
      setUploadingFeaturedImage(false);
    }
  };

  const handleContentImageUpload = async (file: File) => {
    try {
      const fallbackAlt = file.name.replace(/\.[^.]+$/, "");
      const altText = window.prompt("Image alt text", fallbackAlt) || fallbackAlt;
      const publicUrl = await uploadFileToBlogMedia(file, altText);
      insertAtCursor(`![${altText}](${publicUrl})`);
      toast.success("Image inserted into content");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload content image");
    }
  };

  const buildPostData = (nextStatus: EditorStatus | "draft") => {
    const publishNow = nextStatus === "published";
    const isScheduled = nextStatus === "scheduled";

    return {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      content: content.trim(),
      featured_image_url: featuredImageUrl || null,
      featured_image_alt: featuredImageAlt.trim() || null,
      category_id: categoryId || null,
      tags,
      meta_title: (metaTitle || title).trim() || null,
      meta_description: (metaDescription || excerpt).trim() || null,
      canonical_url: canonicalUrl.trim() || null,
      focus_keyword: focusKeyword.trim() || null,
      seo_score: seoReport.score,
      status: nextStatus,
      author_id: user?.id || existingPost?.author_id || null,
      published_at: publishNow ? existingPost?.published_at || new Date().toISOString() : existingPost?.published_at || null,
      scheduled_at: isScheduled ? scheduledAtValue : null,
      cta_type: ctaEnabled ? "custom" : "none",
      cta_text: ctaEnabled ? ctaText.trim() || DEFAULT_CTA_TEXT : null,
      cta_url: ctaEnabled ? buildBlogCtaUrl(ctaUrl, ctaOccasion) : null,
      cta_occasion: ctaEnabled ? ctaOccasion || null : null,
      updated_at: new Date().toISOString(),
    };
  };

  const validateForPublish = (nextStatus: EditorStatus) => {
    if (!title.trim()) return "Title is required";
    if (!slug.trim()) return "Slug is required";
    if (!content.trim()) return "Content is required";
    if (!categoryId) return "Category is required";
    if (slugError) return slugError;
    if (nextStatus === "scheduled" && !scheduledAtValue) return "Select a schedule date and time";
    return null;
  };

  const savePost = async (nextStatus: EditorStatus | "draft", silent = false) => {
    if (!user) return;

    const validationError = nextStatus === "draft" ? slugError || null : validateForPublish(nextStatus as EditorStatus);
    if (validationError) {
      if (!silent) toast.error(validationError);
      return;
    }

    setSaving(true);
    const payload = buildPostData(nextStatus);

    try {
      if (mode === "create") {
        const { data, error } = await supabase
          .from("blog_posts")
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select("id")
          .single();

        if (error) throw error;

        setLastSavedAt(new Date());
        setDirty(false);
        queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
        queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
        queryClient.invalidateQueries({ queryKey: ["admin-blog-analytics-posts"] });

        if (!silent) {
          toast.success(nextStatus === "published" ? "Post published!" : nextStatus === "scheduled" ? "Post scheduled!" : "Draft saved");
        }

        navigate(`/admin/blog/edit/${data.id}`, { replace: true });
        return;
      }

      const { error } = await supabase
        .from("blog_posts")
        .update(payload)
        .eq("id", id!);

      if (error) throw error;

      setLastSavedAt(new Date());
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-analytics-posts"] });
      queryClient.invalidateQueries({ queryKey: ["blog-editor-post", id] });

      if (!silent) {
        toast.success(nextStatus === "published" ? "Post published!" : nextStatus === "scheduled" ? "Post scheduled!" : "Draft saved");
      }
    } catch (error) {
      captureError(
        error instanceof Error ? error : new Error("Failed to save blog post"),
        { action: "save-blog-post", mode, status: nextStatus, post_id: id || null },
      );
      toast.error(error instanceof Error ? error.message : "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const generateExcerpt = async () => {
    if (!content.trim()) {
      toast.error("Add content first");
      return;
    }

    try {
      const response = await supabase.functions.invoke("blog-ai-assistant", {
        body: {
          action: "generate_excerpt",
          existing_content: content,
        },
      });

      if (response.error) throw response.error;
      setExcerpt((response.data?.result || "").slice(0, 160));
      toast.success("Excerpt generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate excerpt");
    }
  };

  const improveSeo = async () => {
    if (!content.trim() || !focusKeyword.trim()) {
      toast.error("Add content and a focus keyword first");
      return;
    }

    try {
      const response = await supabase.functions.invoke("blog-ai-assistant", {
        body: {
          action: "improve_seo",
          existing_content: content,
          focus_keyword: focusKeyword,
        },
      });

      if (response.error) throw response.error;
      setSeoAssistantResult(response.data?.result || null);
      setSeoAssistantOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to analyze SEO");
    }
  };

  const previewPost = () => {
    if (mode === "create") {
      toast.error("Save the draft first to open a preview");
      return;
    }

    if (!slug.trim()) {
      toast.error("Slug is required for preview");
      return;
    }

    window.open(`/blog/${slug}?preview=true`, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading editor...</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <SEOHead title={mode === "edit" ? "Edit Blog Post" : "New Blog Post"} description="GiftMind blog editor" noIndex />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => navigate("/admin/blog")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary/70">Editorial Studio</p>
            <h1 className="text-3xl font-semibold text-slate-950">{mode === "edit" ? "Edit Post" : "Create Post"}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="rounded-full" onClick={previewPost} disabled={mode === "create" && !id}>
            Preview
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => void savePost("draft")} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button>
          <Button
            className="rounded-full"
            onClick={() => void savePost(status === "scheduled" ? "scheduled" : "published")}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {status === "scheduled" ? "Schedule" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_380px]">
        <div className="space-y-5">
          <Card className="rounded-[28px] border-slate-200/80">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-3">
                <Label htmlFor="blog-title">Title</Label>
                <Input
                  id="blog-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Best Diwali Gift Ideas for 2026"
                  className="h-14 rounded-2xl border-none bg-slate-50 text-2xl font-semibold shadow-none"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="blog-slug">Slug</Label>
                <Input
                  id="blog-slug"
                  value={slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(createBlogSlug(event.target.value));
                  }}
                  className={cn("h-11 rounded-2xl", slugError && "border-red-300 focus-visible:ring-red-200")}
                />
                <div className="text-sm text-slate-500">https://giftmind.in/blog/{slug || "your-slug"}</div>
                {slugError ? <p className="text-sm text-red-600">{slugError}</p> : null}
              </div>

              <div className="space-y-3">
                <Label htmlFor="blog-excerpt">Excerpt</Label>
                <TextareaAutosize
                  id="blog-excerpt"
                  value={excerpt}
                  onChange={(event) => setExcerpt(event.target.value.slice(0, 160))}
                  minRows={3}
                  className="flex w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Summarize the post in 160 characters for listings and search."
                />
                <div className={cn("text-right text-xs", excerpt.length >= 160 ? "text-red-600" : excerpt.length >= 140 ? "text-amber-600" : "text-slate-400")}>
                  {excerpt.length}/160
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label>Content Editor</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => insertAtCursor("**", "**", "bold text")}>
                      B
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full italic" onClick={() => insertAtCursor("*", "*", "italic text")}>
                      I
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => insertAtCursor("## ", "", "Heading")}>
                      H2
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => insertAtCursor("### ", "", "Heading")}>
                      H3
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        const url = window.prompt("Link URL", "https://");
                        if (!url) return;
                        insertAtCursor("[", `](${url})`, "link text");
                      }}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => contentImageInputRef.current?.click()}>
                      <ImagePlus className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => insertAtCursor("> ", "", "Quote")}>
                      <Quote className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => insertAtCursor("- ", "", "List item")}>
                      •
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => insertAtCursor("1. ", "", "List item")}>
                      1.
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => insertAtCursor("```\n", "\n```", "code block")}>
                      {"</>"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setMediaPickerOpen(true)}>
                      Library
                    </Button>
                  </div>
                </div>

                <Tabs value={editorMode} onValueChange={(value) => setEditorMode(value as "write" | "preview" | "split")}>
                  <TabsList className="grid w-full grid-cols-3 rounded-full bg-slate-100">
                    <TabsTrigger value="write" className="rounded-full">Write</TabsTrigger>
                    <TabsTrigger value="preview" className="rounded-full">Preview</TabsTrigger>
                    <TabsTrigger value="split" className="rounded-full">
                      <SplitSquareVertical className="mr-2 h-4 w-4" />
                      Split
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="write" className="mt-4">
                    <Textarea
                      ref={markdownInputRef}
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      placeholder="Write your post in markdown..."
                      className="min-h-[520px] rounded-[24px] border-slate-200 font-mono text-sm leading-7"
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="mt-4">
                    <div className="min-h-[520px] rounded-[24px] border border-slate-200 bg-white p-6">
                      {content.trim() ? <BlogMarkdown content={content} /> : <p className="text-sm text-slate-500">Nothing to preview yet.</p>}
                    </div>
                  </TabsContent>

                  <TabsContent value="split" className="mt-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Textarea
                        ref={markdownInputRef}
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder="Write your post in markdown..."
                        className="min-h-[520px] rounded-[24px] border-slate-200 font-mono text-sm leading-7"
                      />
                      <div className="min-h-[520px] rounded-[24px] border border-slate-200 bg-white p-6">
                        {content.trim() ? <BlogMarkdown content={content} /> : <p className="text-sm text-slate-500">Preview updates as you write.</p>}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Word count: <span className="font-medium text-slate-900">{wordCount}</span> | Estimated read time: <span className="font-medium text-slate-900">{readTime} min</span>
                </div>
              </div>

              <Card className="rounded-[24px] border-slate-200 bg-slate-50/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">CTA Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-3">
                    <Checkbox checked={ctaEnabled} onCheckedChange={(value) => setCtaEnabled(!!value)} />
                    <span className="text-sm font-medium">Show in-article CTA</span>
                  </label>

                  {ctaEnabled ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="cta-text">CTA Text</Label>
                        <Input id="cta-text" value={ctaText} onChange={(event) => setCtaText(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cta-url">CTA URL</Label>
                        <Input id="cta-url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>CTA Occasion</Label>
                        <Select value={ctaOccasion || "none"} onValueChange={(value) => setCtaOccasion(value === "none" ? "" : value)}>
                          <SelectTrigger className="rounded-2xl">
                            <SelectValue placeholder="Select occasion" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {BLOG_CTA_OCCASIONS.map((occasion) => (
                              <SelectItem key={occasion} value={occasion}>
                                {occasion.replace(/-/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Final CTA URL</Label>
                        <div className="rounded-2xl border border-dashed border-primary/20 bg-white px-4 py-3 text-sm text-slate-600">
                          {buildBlogCtaUrl(ctaUrl, ctaOccasion)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-slate-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.07),rgba(255,255,255,1))]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">AI Assistant</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button onClick={() => setAiModalOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Draft
                  </Button>
                  <Button variant="outline" onClick={improveSeo} disabled={!content.trim() || !focusKeyword.trim()}>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Improve SEO
                  </Button>
                  <Button variant="outline" onClick={generateExcerpt} disabled={!content.trim()}>
                    Generate Excerpt
                  </Button>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-[28px] border-slate-200/80">
            <CardHeader className="pb-2">
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={status} onValueChange={(value) => setStatus(value as EditorStatus)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-full" onClick={() => void savePost("draft")} disabled={saving}>
                  Save Draft
                </Button>
                <Button className="flex-1 rounded-full" onClick={() => void savePost(status === "scheduled" ? "scheduled" : "published")} disabled={saving}>
                  {status === "scheduled" ? "Schedule" : "Publish"}
                </Button>
              </div>

              {status === "scheduled" ? (
                <div className="space-y-4 rounded-[24px] border border-slate-200 p-4">
                  <div className="space-y-2">
                    <Label>Schedule Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start rounded-2xl text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={setScheduledDate}
                          className="p-3"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Schedule Time</Label>
                    <Select value={scheduledTime} onValueChange={setScheduledTime}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {slot}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200/80">
            <CardHeader className="pb-2">
              <CardTitle>Category</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200/80">
            <CardHeader className="pb-2">
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Type a tag and press Enter"
                  className="rounded-2xl"
                />
                <Button variant="outline" className="rounded-full" onClick={() => addTag()} disabled={tags.length >= 10}>
                  Add
                </Button>
              </div>

              {filteredTagSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {filteredTagSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => addTag(item)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-primary/30 hover:text-primary"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                    {tag}
                    <button type="button" className="ml-2" onClick={() => setTags((previous) => previous.filter((item) => item !== tag))}>
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200/80">
            <CardHeader className="pb-2">
              <CardTitle>Featured Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {featuredImageUrl ? (
                <div className="space-y-3">
                  <img
                    src={featuredImageUrl}
                    alt={featuredImageAlt || title || "Featured image"}
                    className="aspect-[16/10] w-full rounded-[24px] object-cover"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-full" onClick={() => featuredFileInputRef.current?.click()}>
                      Replace
                    </Button>
                    <Button variant="ghost" className="rounded-full" onClick={() => {
                      setFeaturedImageUrl("");
                      setFeaturedImageAlt("");
                    }}>
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label="Upload featured image"
                  disabled={uploadingFeaturedImage}
                  onClick={() => featuredFileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (file) void handleFeaturedImageUpload(file);
                  }}
                  className="flex aspect-[16/10] w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500 transition hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingFeaturedImage ? <Loader2 className="mb-2 h-5 w-5 animate-spin" /> : <ImagePlus className="mb-2 h-5 w-5" />}
                  {uploadingFeaturedImage ? "Uploading…" : "Upload Image"}
                  <span className="mt-1 text-xs">or drag and drop a JPG, PNG, or WebP up to 5MB</span>
                </button>
              )}

              <div className="space-y-2">
                <Label htmlFor="featured-image-alt">Alt text</Label>
                <Input
                  id="featured-image-alt"
                  value={featuredImageAlt}
                  onChange={(event) => setFeaturedImageAlt(event.target.value)}
                  placeholder="Describe the image for SEO and accessibility"
                  className="rounded-2xl"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200/80">
            <CardHeader className="pb-2">
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="focus-keyword">Focus Keyword</Label>
                <Input id="focus-keyword" value={focusKeyword} onChange={(event) => setFocusKeyword(event.target.value)} className="rounded-2xl" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta-title">Meta Title</Label>
                <Input id="meta-title" value={metaTitle} onChange={(event) => setMetaTitle(event.target.value.slice(0, 80))} className="rounded-2xl" />
                <p className={cn("text-right text-xs", metaTitle.length > 60 ? "text-red-600" : metaTitle.length >= 50 ? "text-amber-600" : "text-slate-400")}>
                  {metaTitle.length}/60
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta-description">Meta Description</Label>
                <TextareaAutosize
                  id="meta-description"
                  value={metaDescription}
                  onChange={(event) => setMetaDescription(event.target.value.slice(0, 180))}
                  minRows={3}
                  className="flex w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <p className={cn("text-right text-xs", metaDescription.length > 160 ? "text-red-600" : metaDescription.length >= 140 ? "text-amber-600" : "text-slate-400")}>
                  {metaDescription.length}/160
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="canonical-url">Canonical URL</Label>
                <Input id="canonical-url" value={canonicalUrl} onChange={(event) => setCanonicalUrl(event.target.value)} className="rounded-2xl" />
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">SEO Score</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={cn("text-3xl font-semibold", seoTone.color)}>{seoReport.score}</span>
                      <span className={cn("text-sm font-medium", seoTone.color)}>{seoTone.label}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>Density: {seoReport.keywordDensity.toFixed(2)}%</div>
                    <div>{seoReport.wordCount} words</div>
                  </div>
                </div>
                <Progress value={seoReport.score} className="mt-4 h-2.5 bg-slate-200" />
                <div className="mt-4 space-y-2">
                  {seoReport.checklist.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 text-sm">
                      <span className={cn("mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white", item.pass ? "bg-emerald-500" : "bg-slate-300")}>
                        {item.pass ? <Check className="h-3 w-3" /> : ""}
                      </span>
                      <span className={item.pass ? "text-slate-700" : "text-slate-500"}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        <span className="flex items-center gap-2">
          <Clock3 className="h-4 w-4" />
          {lastSavedAt ? `Auto-saved ${format(lastSavedAt, "p")}` : "Not saved yet"}
        </span>
        {dirty ? <span className="font-medium text-amber-600">Unsaved changes</span> : <span className="font-medium text-emerald-600">All changes saved</span>}
      </div>

      <AiDraftModal
        open={aiModalOpen}
        initialTopic={title}
        onClose={() => setAiModalOpen(false)}
        onInsert={(result) => {
          setTitle(result.title);
          setExcerpt(result.excerpt);
          setContent(result.content);
          setTags(result.tags.slice(0, 10));
          setMetaTitle(result.metaTitle);
          setMetaDescription(result.metaDescription);
        }}
      />

      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(url, alt) => insertAtCursor(`![${alt}](${url})`)}
      />

      <Dialog open={seoAssistantOpen} onOpenChange={setSeoAssistantOpen}>
        <DialogContent className="max-w-2xl rounded-[28px]">
          <DialogHeader>
            <DialogTitle>SEO Suggestions</DialogTitle>
          </DialogHeader>
          {seoAssistantResult ? (
            <div className="space-y-5">
              <div className="rounded-[20px] bg-slate-50 p-4">
                <p className="text-sm text-slate-500">AI SEO Score</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">{seoAssistantResult.overall_score}/100</p>
              </div>

              {seoAssistantResult.improvements.map((item) => (
                <div key={`${item.type}-${item.current}`} className="rounded-[20px] border border-slate-200 p-4">
                  <p className="text-sm font-medium capitalize text-slate-900">{item.type.replace(/_/g, " ")}</p>
                  <p className="mt-2 text-sm text-slate-500">{item.current}</p>
                  <p className="mt-2 text-sm text-slate-700">{item.suggestion}</p>
                </div>
              ))}

              {seoAssistantResult.rewritten_meta_description ? (
                <div className="rounded-[20px] border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-medium text-slate-900">Rewritten meta description</p>
                  <p className="mt-2 text-sm text-slate-700">{seoAssistantResult.rewritten_meta_description}</p>
                  <Button className="mt-3 rounded-full" onClick={() => setMetaDescription(seoAssistantResult.rewritten_meta_description || "")}>
                    Apply
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <input
        ref={featuredFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFeaturedImageUpload(file);
          event.currentTarget.value = "";
        }}
      />

      <input
        ref={contentImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleContentImageUpload(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
