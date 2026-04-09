import { SEOHead } from "@/components/common/SEOHead";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import MDEditor from "@uiw/react-md-editor";
import DOMPurify from "dompurify";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, X, ArrowLeft, Sparkles, Wand2, FileText, Image as ImageIcon } from "lucide-react";

import PublishCard from "@/components/blog-editor/PublishCard";
import SeoCard from "@/components/blog-editor/SeoCard";
import MediaPickerModal from "@/components/blog-editor/MediaPickerModal";
import AiDraftModal from "@/components/blog-editor/AiDraftModal";
import { captureError } from "@/lib/sentry";
import { sanitizeArray, sanitizeString } from "@/lib/validation";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

export default function AdminBlogEditor() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "scheduled" | "archived">("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  const [featuredImageAlt, setFeaturedImageAlt] = useState("");
  const [focusKeyword, setFocusKeyword] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [showCta, setShowCta] = useState(true);
  const [ctaText, setCtaText] = useState("Find the Perfect Gift");
  const [ctaUrl, setCtaUrl] = useState("/gift-flow");
  const [ctaOccasion, setCtaOccasion] = useState("");

  const [mediaPicker, setMediaPicker] = useState(false);
  const [mediaForContent, setMediaForContent] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const editorPreviewRef = useRef<HTMLDivElement>(null);

  const markdownSanitizeOptions = {
    ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "p", "a", "img", "ul", "ol", "li",
      "strong", "em", "blockquote", "code", "pre", "br", "hr",
      "table", "thead", "tbody", "tr", "th", "td"],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "id", "target", "rel"],
  };

  // Warn on browser close/refresh with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Mark dirty on changes
  useEffect(() => { setDirty(true); }, [title, slug, excerpt, content, status, categoryId, tags, featuredImage, metaTitle, metaDescription]);

  // Auto-save every 30s
  useEffect(() => {
    if (!dirty) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { saveDraft(); }, 30000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [dirty, title, content]);

  // Auto-generate slug & meta from title
  useEffect(() => {
    if (!isEdit || !slug) setSlug(slugify(title));
    if (!metaTitle || metaTitle === slugify(title)) setMetaTitle(title.slice(0, 65));
  }, [title]);

  useEffect(() => {
    if (!metaDescription) setMetaDescription(excerpt);
  }, [excerpt]);

  useEffect(() => {
    const previewNodes = editorPreviewRef.current?.querySelectorAll(".wmde-markdown");
    previewNodes?.forEach((node) => {
      if (node instanceof HTMLElement) {
        node.innerHTML = DOMPurify.sanitize(node.innerHTML, markdownSanitizeOptions);
      }
    });
  }, [content]);

  // Load existing post
  const { data: post, isLoading: loadingPost } = useQuery({
    queryKey: ["blog-post", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (!post) return;
    setTitle(post.title);
    setSlug(post.slug);
    setExcerpt(post.excerpt || "");
    setContent(post.content || "");
    setStatus(post.status);
    setScheduledAt(post.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : "");
    setCategoryId(post.category_id || "");
    setTags(post.tags || []);
    setFeaturedImage(post.featured_image || "");
    setMetaTitle(post.meta_title || "");
    setMetaDescription(post.meta_description || "");
    setDirty(false);
    setLastSaved(new Date(post.updated_at));
  }, [post]);

  // Categories
  const { data: categories = [] } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("blog_categories").select("*").order("sort_order");
      return data || [];
    },
  });

  // Save logic
  type PostStatus = "draft" | "published" | "scheduled" | "archived";
  const savePost = async (overrideStatus?: PostStatus) => {
    if (!user) return;
    setSaving(true);
    const payload = {
      title: sanitizeString(title, 120) || "Untitled",
      slug: sanitizeString(slug, 80) || slugify(sanitizeString(title, 120) || "untitled"),
      excerpt: sanitizeString(excerpt, 200),
      content,
      status: (overrideStatus || status) as PostStatus,
      scheduled_at: status === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      published_at: (overrideStatus || status) === "published" ? new Date().toISOString() : post?.published_at || null,
      category_id: categoryId || null,
      tags: sanitizeArray(tags, 8),
      featured_image: sanitizeString(featuredImage, 500) || null,
      meta_title: sanitizeString(metaTitle, 120) || null,
      meta_description: sanitizeString(metaDescription, 200) || null,
      author_id: user.id,
    };
    try {
      if (isEdit) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("blog_posts").insert(payload).select("id").single();
        if (error) throw error;
        navigate(`/admin/blog/edit/${data.id}`, { replace: true });
      }
      setLastSaved(new Date());
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
      toast.success(overrideStatus === "published" ? "Post published!" : "Post saved!");
    } catch (e: any) {
      captureError(
        e instanceof Error ? e : new Error("Failed to save blog post"),
        { action: "admin-save-blog-post", is_edit: isEdit, post_id: id },
      );
      toast.error("Save failed: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => savePost("draft");
  const publish = () => savePost(status === "scheduled" ? "scheduled" : "published");

  // Tag management
  const addTag = () => {
    const t = sanitizeString(tagInput, 50);
    if (t && tags.length < 8 && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  // Computed
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.round(wordCount / 200));

  // Insert media into content
  const insertMediaToContent = (url: string, alt: string) => {
    setContent((prev) => prev + `\n![${alt}](${url})\n`);
  };

  if (loadingPost) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading post...</div>;
  }

  return (
    <div className="space-y-4">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to blog posts" onClick={() => navigate("/admin/blog")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{isEdit ? "Edit Post" : "New Post"}</h1>
        {dirty && <Badge variant="outline" className="text-xs">Unsaved changes</Badge>}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:w-[65%] space-y-4">
          {/* Title */}
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title..."
              className="text-2xl font-bold h-auto py-3 border-none shadow-none focus-visible:ring-0 px-0"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>giftmind.in/blog/</span>
              <Input
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                className="h-6 text-xs border-none shadow-none p-0 w-auto flex-1 text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{slug.length} characters</p>
          </div>

          {/* Excerpt */}
          <div>
            <Label className="text-xs">Excerpt</Label>
            <Textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value.slice(0, 200))}
              placeholder="Brief description for listings..."
              rows={3}
              maxLength={200}
            />
            <div className="flex justify-between text-xs mt-0.5">
              <span className="text-muted-foreground">Shown in blog listings and used as meta description</span>
              <span className={excerpt.length >= 200 ? "text-destructive" : excerpt.length >= 150 ? "text-yellow-500" : "text-muted-foreground"}>
                {excerpt.length}/200
              </span>
            </div>
          </div>

          {/* Content Editor */}
          <div data-color-mode="light" ref={editorPreviewRef}>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Content</Label>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setMediaForContent(true); setMediaPicker(true); }}>
                <ImageIcon className="h-3 w-3 mr-1" /> Insert Image
              </Button>
            </div>
            <MDEditor
              value={content}
              onChange={(val) => setContent(val || "")}
              height={500}
              preview="live"
            />
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 border-t pt-1">
              <span>{wordCount} words</span>
              <span>{readTime} min read</span>
              <span>{lastSaved ? "Saved as draft" : "Not saved"}</span>
            </div>
          </div>

          {/* CTA Config */}
          <Collapsible>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm">CTA Configuration</CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-center gap-2">
                    <Switch checked={showCta} onCheckedChange={setShowCta} />
                    <Label className="text-xs">Show CTA block in this post</Label>
                  </div>
                  {showCta && (
                    <>
                      <div>
                        <Label className="text-xs">CTA Text</Label>
                        <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">CTA URL</Label>
                        <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Pre-fill Occasion</Label>
                        <Select value={ctaOccasion} onValueChange={setCtaOccasion}>
                          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {["birthday", "diwali", "anniversary", "christmas", "valentines", "holi", "raksha-bandhan", "wedding"].map((o) => (
                              <SelectItem key={o} value={o} className="capitalize">{o.replace("-", " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="py-3 text-center">
                          <p className="font-semibold text-primary">{ctaText}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            → {ctaOccasion && ctaOccasion !== "none" ? `${ctaUrl}?occasion=${ctaOccasion}` : ctaUrl}
                          </p>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:w-[35%] space-y-4">
          {/* Publish */}
          <PublishCard
            status={status}
            scheduledAt={scheduledAt}
            lastSaved={lastSaved}
            saving={saving}
            slug={slug}
            onStatusChange={setStatus}
            onScheduledAtChange={setScheduledAt}
            onSaveDraft={saveDraft}
            onPublish={publish}
          />

          {/* Category & Tags */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Category & Tags</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tags ({tags.length}/8)</Label>
                <div className="flex gap-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag..."
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                    disabled={tags.length >= 8}
                  />
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addTag} disabled={tags.length >= 8}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs gap-1">
                      {t}
                      <button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Featured Image */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Featured Image</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              {featuredImage ? (
                <div className="relative group">
                  <img
                    src={featuredImage}
                    alt={featuredImageAlt || "Featured image preview"}
                    loading="lazy"
                    decoding="async"
                    width={1200}
                    height={675}
                    className="w-full aspect-video object-cover rounded-md"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs"
                    onClick={() => setFeaturedImage("")}
                  >Remove</Button>
                </div>
              ) : (
                <button
                  onClick={() => { setMediaForContent(false); setMediaPicker(true); }}
                  className="w-full aspect-video border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary/50 transition-colors"
                >
                  <ImageIcon className="h-8 w-8 mb-1" />
                  <span className="text-xs">Click to upload or select from library</span>
                </button>
              )}
              <div>
                <Label className="text-xs">Alt Text</Label>
                <Input value={featuredImageAlt} onChange={(e) => setFeaturedImageAlt(e.target.value)} placeholder="Describe this image for accessibility" className="h-8 text-xs" />
                <p className="text-xs text-muted-foreground mt-0.5">Recommended: 1200 × 630px for social sharing</p>
              </div>
            </CardContent>
          </Card>

          {/* SEO */}
          <SeoCard
            focusKeyword={focusKeyword}
            metaTitle={metaTitle}
            metaDescription={metaDescription}
            title={title}
            content={content}
            featuredImageAlt={featuredImageAlt}
            onFocusKeywordChange={setFocusKeyword}
            onMetaTitleChange={setMetaTitle}
            onMetaDescriptionChange={setMetaDescription}
          />

          {/* AI Assistant */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">AI Assistant</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Button className="w-full" onClick={() => setAiModal(true)}>
                <Sparkles className="h-4 w-4 mr-1" /> Generate Draft
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={() => {
                  if (content.length < 50) { toast.error("Write some content first"); return; }
                  const summary = content.replace(/[#*_\[\]()]/g, "").trim().split(/\s+/).slice(0, 25).join(" ");
                  setExcerpt(summary.slice(0, 160));
                  toast.success("Excerpt generated from content");
                }}>
                  <FileText className="h-3 w-3 mr-1" /> Generate Excerpt
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={() => toast.info("Analyzing SEO...")}>
                  <Wand2 className="h-3 w-3 mr-1" /> Improve SEO
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile fixed footer */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t p-3 flex gap-2 z-50">
        <Button variant="outline" className="flex-1" onClick={saveDraft} disabled={saving}>Save</Button>
        <Button className="flex-1" onClick={publish} disabled={saving}>
          {status === "scheduled" ? "Schedule" : "Publish"}
        </Button>
      </div>

      {/* Modals */}
      <MediaPickerModal
        open={mediaPicker}
        onClose={() => setMediaPicker(false)}
        onSelect={(url, alt) => {
          if (mediaForContent) {
            insertMediaToContent(url, alt);
          } else {
            setFeaturedImage(url);
            setFeaturedImageAlt(alt);
          }
        }}
      />
      <AiDraftModal
        open={aiModal}
        onClose={() => setAiModal(false)}
        onInsert={(r) => {
          setTitle(r.title);
          setExcerpt(r.excerpt);
          setContent(r.content);
          setTags(r.tags.slice(0, 8));
          setMetaTitle(r.metaTitle);
          setMetaDescription(r.metaDescription);
        }}
      />
    </div>
  );
}
