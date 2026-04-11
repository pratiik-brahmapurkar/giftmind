import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type BlogPostRecord = Database["public"]["Tables"]["blog_posts"]["Row"];
export type BlogCategoryRecord = Database["public"]["Tables"]["blog_categories"]["Row"];
export type BlogMediaRecord = Database["public"]["Tables"]["blog_media"]["Row"];
export type BlogPostStatus = "draft" | "published" | "scheduled" | "archived";

export interface SeoChecklistItem {
  id: string;
  label: string;
  pass: boolean;
}

export interface SeoScoreReport {
  score: number;
  keywordDensity: number;
  wordCount: number;
  checklist: SeoChecklistItem[];
}

export const BLOG_STATUS_OPTIONS: Array<{ value: BlogPostStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "scheduled", label: "Scheduled" },
  { value: "archived", label: "Archived" },
];

export const BLOG_STATUS_META: Record<BlogPostStatus, { dotClass: string; pillClass: string; label: string }> = {
  published: {
    dotClass: "bg-emerald-500",
    pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Published",
  },
  draft: {
    dotClass: "bg-amber-500",
    pillClass: "border-amber-200 bg-amber-50 text-amber-700",
    label: "Draft",
  },
  scheduled: {
    dotClass: "bg-sky-500",
    pillClass: "border-sky-200 bg-sky-50 text-sky-700",
    label: "Scheduled",
  },
  archived: {
    dotClass: "bg-slate-500",
    pillClass: "border-slate-200 bg-slate-50 text-slate-700",
    label: "Archived",
  },
};

export const BLOG_CTA_OCCASIONS = [
  "birthday",
  "anniversary",
  "diwali",
  "christmas",
  "valentines",
  "holi",
  "eid",
  "raksha-bandhan",
  "wedding",
  "housewarming",
  "baby-shower",
  "corporate",
] as const;

export function createBlogSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}

export function getWordCount(content: string | null | undefined) {
  return (content || "").split(/\s+/).filter(Boolean).length;
}

export function getReadTimeMinutes(content: string | null | undefined) {
  return Math.max(1, Math.ceil(getWordCount(content) / 200));
}

export function buildBlogCtaUrl(ctaUrl: string | null | undefined, occasion: string | null | undefined) {
  const base = ctaUrl?.trim() || "/gift-flow";
  if (!occasion) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}occasion=${encodeURIComponent(occasion)}`;
}

export function getBlogPostDisplayDate(post: Pick<BlogPostRecord, "status" | "published_at" | "scheduled_at" | "created_at">) {
  const dateValue =
    post.status === "published"
      ? post.published_at
      : post.status === "scheduled"
        ? post.scheduled_at
        : post.created_at;

  return dateValue ? format(new Date(dateValue), "MMM d, yyyy") : "—";
}

export function getBlogPostStatusTitle(post: Pick<BlogPostRecord, "status" | "title" | "scheduled_at">) {
  if (post.status === "draft") return `[Draft] ${post.title}`;
  if (post.status === "scheduled" && post.scheduled_at) {
    return `[Scheduled for ${format(new Date(post.scheduled_at), "MMM d")}] ${post.title}`;
  }
  return post.title;
}

export function splitMarkdownForCta(content: string | null | undefined, paragraphIndex = 3) {
  const blocks = (content || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (blocks.length <= paragraphIndex) {
    return { before: content || "", after: "" };
  }

  return {
    before: `${blocks.slice(0, paragraphIndex).join("\n\n")}\n`,
    after: blocks.slice(paragraphIndex).join("\n\n"),
  };
}

export function getExcerptFallback(post: Pick<BlogPostRecord, "excerpt" | "content" | "meta_description">) {
  if (post.excerpt?.trim()) return post.excerpt.trim();
  if (post.meta_description?.trim()) return post.meta_description.trim();
  return (post.content || "").replace(/[#>*_`[\]()!-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function calculateSEOScore(post: Partial<BlogPostRecord> & { title?: string | null; content?: string | null }) {
  const keyword = post.focus_keyword?.toLowerCase().trim() || "";
  const title = post.title?.toLowerCase() || "";
  const content = post.content || "";
  const metaTitle = post.meta_title || post.title || "";
  const metaDescription = post.meta_description || post.excerpt || "";
  const firstParagraph = content.split(/\n\s*\n/)[0] || "";
  const words = content.toLowerCase().split(/\s+/).filter(Boolean);
  const h2s = content.match(/^## .+/gm) || [];
  const keywordCount = keyword
    ? words.filter((word) => word.includes(keyword)).length
    : 0;
  const keywordDensity = (keywordCount / Math.max(words.length, 1)) * 100;

  const checklist: SeoChecklistItem[] = [
    {
      id: "keyword-title",
      label: "Keyword in title",
      pass: !!keyword && title.includes(keyword),
    },
    {
      id: "keyword-first-paragraph",
      label: "Keyword in first paragraph",
      pass: !!keyword && firstParagraph.toLowerCase().includes(keyword),
    },
    {
      id: "keyword-meta-description",
      label: "Meta description has keyword",
      pass: !!keyword && metaDescription.toLowerCase().includes(keyword),
    },
    {
      id: "keyword-density",
      label: "Keyword density is between 0.5% and 3%",
      pass: !!keyword && keywordDensity >= 0.5 && keywordDensity <= 3,
    },
    {
      id: "keyword-h2",
      label: "An H2 includes the keyword",
      pass: !!keyword && h2s.some((heading) => heading.toLowerCase().includes(keyword)),
    },
    {
      id: "three-h2s",
      label: "At least 3 H2 headings",
      pass: h2s.length >= 3,
    },
    {
      id: "meta-title-length",
      label: "Meta title is 40-60 characters",
      pass: metaTitle.length >= 40 && metaTitle.length <= 60,
    },
    {
      id: "meta-description-length",
      label: "Meta description is 140-160 characters",
      pass: metaDescription.length >= 140 && metaDescription.length <= 160,
    },
    {
      id: "content-length",
      label: "Content is at least 800 words",
      pass: words.length >= 800,
    },
    {
      id: "has-image",
      label: "Has a featured image or markdown image",
      pass: !!post.featured_image_url || content.includes("!["),
    },
    {
      id: "image-alt",
      label: "Featured image has alt text",
      pass: !!post.featured_image_alt,
    },
    {
      id: "internal-links",
      label: "Has internal links to /gift-flow or /blog",
      pass: content.includes("/gift-flow") || content.includes("/blog/"),
    },
    {
      id: "cta",
      label: "CTA is enabled",
      pass: post.cta_type !== "none" && !!post.cta_text,
    },
  ];

  if (!keyword) {
    return { score: 0, keywordDensity: 0, wordCount: words.length, checklist };
  }

  let score = 0;
  if (checklist[0].pass) score += 15;
  if (checklist[1].pass) score += 10;
  if (checklist[2].pass) score += 10;
  if (checklist[3].pass) score += 10;
  if (checklist[4].pass) score += 10;
  if (checklist[5].pass) score += 5;
  if (checklist[6].pass) score += 5;
  if (checklist[7].pass) score += 5;
  if (checklist[8].pass) score += 10;
  if (checklist[9].pass) score += 5;
  if (checklist[10].pass) score += 5;
  if (checklist[11].pass) score += 5;
  if (checklist[12].pass) score += 5;

  return {
    score: Math.min(score, 100),
    keywordDensity,
    wordCount: words.length,
    checklist,
  };
}

export function getPrimarySeoIssue(report: SeoScoreReport) {
  const firstFail = report.checklist.find((item) => !item.pass);
  return firstFail?.label || "Needs a manual review";
}
