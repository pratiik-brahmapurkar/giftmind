import { SEOHead } from "@/components/common/SEOHead";
import { useState, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Archive, Copy, FolderOpen, ImageIcon, Loader2, Search, Tags, Trash2, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import {
  ALLOWED_MEDIA_TYPES,
  MEDIA_FOLDERS,
  formatBytes,
  getAssetTypeForFolder,
  getStoragePathFromPublicUrl,
  uploadMediaAsset,
  type MediaFolder,
} from "@/lib/mediaLibrary";
import { trackEvent } from "@/lib/posthog";

type BlogMediaRow = Tables<"blog_media">;
type BlogPostUsage = Pick<Tables<"blog_posts">, "id" | "title" | "slug" | "featured_image_url" | "content">;
type SortKey = "newest" | "oldest" | "largest" | "smallest" | "most-used";
type Orphan = { path: string; size: number; last_modified: string };

const folderLabels: Record<MediaFolder, string> = {
  all: "All Files",
  blog: "Blog Images",
  brand: "Brand Assets",
  "og-images": "OG Images",
  uncategorised: "Uncategorised",
};

function getPostsUsingMedia(media: BlogMediaRow | null, posts: BlogPostUsage[]) {
  if (!media) return [];
  return posts.filter((post) => (
    post.featured_image_url === media.file_url ||
    post.featured_image_url?.includes(media.id) ||
    post.content?.includes(media.file_url) ||
    post.content?.includes(media.id)
  ));
}

const AdminMediaLibrary = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState<MediaFolder>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [selectedMedia, setSelectedMedia] = useState<BlogMediaRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadFilesPending, setUploadFilesPending] = useState<File[]>([]);
  const [uploadAltText, setUploadAltText] = useState("");
  const [uploadFolder, setUploadFolder] = useState<Exclude<MediaFolder, "all">>("blog");
  const [editingAlt, setEditingAlt] = useState("");
  const [editingFolder, setEditingFolder] = useState<Exclude<MediaFolder, "all">>("blog");
  const [editingTags, setEditingTags] = useState("");
  const [orphansOpen, setOrphansOpen] = useState(false);
  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [findingOrphans, setFindingOrphans] = useState(false);
  const [deletingOrphans, setDeletingOrphans] = useState(false);

  const { data: mediaItems = [], isLoading } = useQuery({
    queryKey: ["admin-blog-media"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_media")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BlogMediaRow[];
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["admin-media-usage-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id,title,slug,featured_image_url,content");
      if (error) throw error;
      return (data || []) as BlogPostUsage[];
    },
  });

  const { data: storageStats } = useQuery({
    queryKey: ["media-storage-stats"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ file_count: number; total_bytes: number }>("get-storage-stats", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
  });

  const folderCounts = useMemo(() => {
    const counts: Record<MediaFolder, number> = { all: mediaItems.length, blog: 0, brand: 0, "og-images": 0, uncategorised: 0 };
    for (const item of mediaItems) {
      const folder = (item.folder || "uncategorised") as MediaFolder;
      if (folder !== "all" && counts[folder] !== undefined) counts[folder] += 1;
    }
    return counts;
  }, [mediaItems]);

  const filtered = useMemo(() => {
    let list = mediaItems;
    if (folderFilter !== "all") list = list.filter((m) => (m.folder || "uncategorised") === folderFilter);
    if (typeFilter !== "all") list = list.filter((m) => m.file_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => (
        m.file_name.toLowerCase().includes(q) ||
        (m.alt_text || "").toLowerCase().includes(q) ||
        (m.tags || []).some((tag) => tag.toLowerCase().includes(q))
      ));
    }

    return [...list].sort((a, b) => {
      if (sortKey === "oldest") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      if (sortKey === "largest") return (b.file_size || 0) - (a.file_size || 0);
      if (sortKey === "smallest") return (a.file_size || 0) - (b.file_size || 0);
      if (sortKey === "most-used") return (b.usage_count || 0) - (a.usage_count || 0);
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [mediaItems, folderFilter, typeFilter, search, sortKey]);

  const fileTypes = useMemo(() => {
    const types = new Set([...mediaItems.map((m) => m.file_type).filter(Boolean), ...ALLOWED_MEDIA_TYPES]);
    return Array.from(types).sort() as string[];
  }, [mediaItems]);

  const selectedUsage = useMemo(() => getPostsUsingMedia(selectedMedia, posts), [selectedMedia, posts]);
  const deleteItem = useMemo(() => mediaItems.find((m) => m.id === deleteId) || null, [deleteId, mediaItems]);
  const deleteUsage = useMemo(() => getPostsUsingMedia(deleteItem, posts), [deleteItem, posts]);

  const prepareFiles = useCallback((files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    setUploadFilesPending(nextFiles);
    if (nextFiles.length === 1) {
      setUploadAltText(nextFiles[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    } else {
      setUploadAltText("");
    }
  }, []);

  const uploadPreparedFiles = useCallback(async () => {
    if (!user || !uploadFilesPending.length || !uploadAltText.trim()) return;
    setUploading(true);
    let uploadedCount = 0;

    for (const file of uploadFilesPending) {
      try {
        await uploadMediaAsset({ file, altText: uploadAltText, folder: uploadFolder, uploadedBy: user.id });
        trackEvent("media_uploaded", {
          file_type: file.type,
          file_size: file.size,
          folder: uploadFolder,
          has_alt_text: true,
        });
        uploadedCount += 1;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Failed to upload ${file.name}`);
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["admin-blog-media"] });
    await queryClient.invalidateQueries({ queryKey: ["media-storage-stats"] });
    setUploading(false);
    setUploadFilesPending([]);
    setUploadAltText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (uploadedCount) toast.success(`${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded`);
  }, [queryClient, uploadAltText, uploadFilesPending, uploadFolder, user]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) prepareFiles(e.dataTransfer.files);
  };

  const openMedia = (media: BlogMediaRow) => {
    setSelectedMedia(media);
    setEditingAlt(media.alt_text || "");
    setEditingFolder((media.folder || "uncategorised") as Exclude<MediaFolder, "all">);
    setEditingTags((media.tags || []).join(", "));
  };

  const copyText = async (text: string, label = "Copied") => {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const handleDelete = async (id: string) => {
    const item = mediaItems.find((m) => m.id === id);
    if (item) {
      const path = getStoragePathFromPublicUrl(item.file_url);
      if (path) await supabase.storage.from("blog-media").remove([path]);
    }

    const { error } = await supabase.from("blog_media").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete media");
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["admin-blog-media"] });
    queryClient.invalidateQueries({ queryKey: ["media-storage-stats"] });
    trackEvent("media_deleted", {
      file_id: id,
      usage_count: item?.usage_count || deleteUsage.length || 0,
      forced: Boolean((item?.usage_count || 0) > 0 || deleteUsage.length > 0),
    });
    if (selectedMedia?.id === id) setSelectedMedia(null);
    toast.success("Media deleted");
    setDeleteId(null);
  };

  const saveDetails = async () => {
    if (!selectedMedia) return;
    const tags = editingTags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    const { error } = await supabase
      .from("blog_media")
      .update({
        alt_text: editingAlt.trim(),
        folder: editingFolder,
        asset_type: getAssetTypeForFolder(editingFolder),
        tags,
      })
      .eq("id", selectedMedia.id);

    if (error) {
      toast.error("Failed to save details");
      return;
    }

    const updated = { ...selectedMedia, alt_text: editingAlt.trim(), folder: editingFolder, asset_type: getAssetTypeForFolder(editingFolder), tags };
    setSelectedMedia(updated);
    queryClient.invalidateQueries({ queryKey: ["admin-blog-media"] });
    toast.success("Media details saved");
  };

  const findOrphans = async () => {
    setFindingOrphans(true);
    setOrphansOpen(true);
    const { data, error } = await supabase.functions.invoke<{ orphans: Orphan[] }>("find-media-orphans", {
      body: { action: "find" },
    });
    setFindingOrphans(false);
    if (error) {
      toast.error(error.message || "Failed to find orphans");
      return;
    }
    setOrphans(data?.orphans || []);
    trackEvent("media_orphans_found", {
      orphan_count: data?.orphans?.length || 0,
      total_bytes_orphaned: (data?.orphans || []).reduce((sum, orphan) => sum + orphan.size, 0),
    });
  };

  const deleteOrphans = async (paths: string[]) => {
    setDeletingOrphans(true);
    const { data, error } = await supabase.functions.invoke<{ orphans: Orphan[]; deleted_count: number }>("find-media-orphans", {
      body: { action: "delete", paths },
    });
    setDeletingOrphans(false);
    if (error) {
      toast.error(error.message || "Failed to delete orphans");
      return;
    }
    setOrphans(data?.orphans || []);
    queryClient.invalidateQueries({ queryKey: ["media-storage-stats"] });
    trackEvent("media_orphans_deleted", {
      deleted_count: data?.deleted_count || 0,
      bytes_recovered: paths.reduce((sum, path) => sum + (orphans.find((orphan) => orphan.path === path)?.size || 0), 0),
    });
    toast.success(`${data?.deleted_count || 0} orphaned file${data?.deleted_count === 1 ? "" : "s"} deleted`);
  };

  return (
    <div className="space-y-6">
      <SEOHead title="Admin - Media Library" description="GiftMind Media Library" noIndex={true} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Media Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage reusable content assets, blog images, brand files, and OG images.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            Storage: <span className="font-medium text-foreground">{formatBytes(storageStats?.total_bytes)}</span>
            <span className="px-1">·</span>
            <span className="font-medium text-foreground">{storageStats?.file_count ?? mediaItems.length}</span> files
          </div>
          <Button variant="outline" onClick={() => void findOrphans()} disabled={findingOrphans}>
            {findingOrphans ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
            Find Orphans
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {(["all", ...MEDIA_FOLDERS.map((item) => item.value)] as MediaFolder[]).map((folder) => (
            <button
              key={folder}
              type="button"
              onClick={() => {
                setFolderFilter(folder);
                trackEvent("media_folder_navigated", { folder });
              }}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                folderFilter === folder ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />{folderLabels[folder]}</span>
              <span className="text-xs opacity-80">{folderCounts[folder]}</span>
            </button>
          ))}
        </aside>

        <div className="space-y-5">
          <div
            className={`rounded-lg border-2 border-dashed p-5 transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <button
                type="button"
                className="flex min-h-28 flex-col items-center justify-center rounded-md bg-muted/40 text-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Drop images here or click to upload</span>
                <span className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP, GIF up to 5MB · SVG up to 512KB</span>
              </button>
              <div className="space-y-3">
                <div>
                  <Label>Folder</Label>
                  <Select value={uploadFolder} onValueChange={(value) => setUploadFolder(value as Exclude<MediaFolder, "all">)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEDIA_FOLDERS.map((folder) => <SelectItem key={folder.value} value={folder.value}>{folder.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={!uploadFilesPending.length || !uploadAltText.trim() || uploading} onClick={() => void uploadPreparedFiles()}>
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload
                </Button>
              </div>
            </div>
            {uploadFilesPending.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div>
                  <Label htmlFor="upload-alt">Alt text</Label>
                  <Textarea
                    id="upload-alt"
                    value={uploadAltText}
                    onChange={(e) => setUploadAltText(e.target.value)}
                    placeholder="Describe the image before uploading"
                    className="mt-1 min-h-20"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{uploadFilesPending.length} selected file{uploadFilesPending.length === 1 ? "" : "s"}</p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Clear selected files" onClick={() => setUploadFilesPending([])}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload media files"
              multiple
              accept={ALLOWED_MEDIA_TYPES.join(",")}
              className="hidden"
              onChange={(e) => e.target.files && prepareFiles(e.target.files)}
            />
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search filename, alt text, or tags..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full xl:w-40"><SelectValue placeholder="File type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {fileTypes.map((type) => <SelectItem key={type} value={type}>{type.split("/")[1]?.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
              <SelectTrigger className="w-full xl:w-40"><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="largest">Largest</SelectItem>
                <SelectItem value="smallest">Smallest</SelectItem>
                <SelectItem value="most-used">Most Used</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{filtered.length} file{filtered.length === 1 ? "" : "s"}</span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading media...</p>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ImageIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No media files found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((media) => {
                const usage = getPostsUsingMedia(media, posts);
                return (
                  <div
                    key={media.id}
                    className="group relative cursor-pointer overflow-hidden rounded-lg border transition-all hover:ring-2 hover:ring-primary/50"
                    onClick={() => openMedia(media)}
                  >
                    <div className="aspect-square bg-muted">
                      <img src={media.file_url} alt={media.alt_text || media.file_name} className="h-full w-full object-cover" loading="lazy" decoding="async" width={640} height={640} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white" aria-label="Copy media URL" onClick={(e) => { e.stopPropagation(); void copyText(media.file_url, "URL copied"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white" aria-label="Delete media item" onClick={(e) => { e.stopPropagation(); setDeleteId(media.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-medium">{media.file_name}</p>
                        {media.usage_count || usage.length ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Badge variant="secondary" className="text-[10px]">Used {media.usage_count || usage.length}</Badge>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="space-y-2 text-sm" onClick={(e) => e.stopPropagation()}>
                              <p className="font-medium">Used in posts</p>
                              {usage.length ? usage.map((post) => (
                                <Link key={post.id} to={`/admin/blog/edit/${post.id}`} className="block text-primary hover:underline">{post.title}</Link>
                              )) : <p className="text-muted-foreground">Usage count will refresh after posts are saved.</p>}
                            </PopoverContent>
                          </Popover>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{formatBytes(media.file_size)} · {media.folder || "uncategorised"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!selectedMedia} onOpenChange={(open) => !open && setSelectedMedia(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Media Details</SheetTitle>
            <SheetDescription>View and edit asset metadata</SheetDescription>
          </SheetHeader>
          {selectedMedia ? (
            <div className="mt-6 space-y-5">
              <div className="overflow-hidden rounded-lg border bg-muted">
                <img src={selectedMedia.file_url} alt={selectedMedia.alt_text || selectedMedia.file_name} className="max-h-72 w-full object-contain" loading="lazy" decoding="async" width={1200} height={900} />
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">File Name</Label>
                  <p className="text-sm font-medium break-words">{selectedMedia.file_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">URL</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input readOnly value={selectedMedia.file_url} className="text-xs font-mono" />
                    <Button size="icon" variant="outline" className="shrink-0" aria-label="Copy selected media URL" onClick={() => void copyText(selectedMedia.file_url, "URL copied")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="detail-alt">Alt Text</Label>
                  <Textarea id="detail-alt" value={editingAlt} onChange={(e) => setEditingAlt(e.target.value)} placeholder="Describe the image..." className="mt-1 min-h-20" />
                </div>
                <div>
                  <Label>Folder</Label>
                  <Select value={editingFolder} onValueChange={(value) => setEditingFolder(value as Exclude<MediaFolder, "all">)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEDIA_FOLDERS.map((folder) => <SelectItem key={folder.value} value={folder.value}>{folder.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="detail-tags" className="flex items-center gap-2"><Tags className="h-3.5 w-3.5" />Tags</Label>
                  <Input id="detail-tags" value={editingTags} onChange={(e) => setEditingTags(e.target.value)} placeholder="holiday, social, logo" className="mt-1" />
                </div>
                <Button size="sm" onClick={() => void saveDetails()}>Save Details</Button>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><Label className="text-xs text-muted-foreground">File Size</Label><p>{formatBytes(selectedMedia.file_size)}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Type</Label><p>{selectedMedia.file_type}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Dimensions</Label><p>{selectedMedia.width && selectedMedia.height ? `${selectedMedia.width} x ${selectedMedia.height} px` : "Not available"}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Uploaded</Label><p>{selectedMedia.created_at ? format(new Date(selectedMedia.created_at), "MMM d, yyyy") : "Unknown"}</p></div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Used in posts</Label>
                  {selectedUsage.length ? selectedUsage.map((post) => (
                    <Link key={post.id} to={`/admin/blog/edit/${post.id}`} className="block text-sm text-primary hover:underline">{post.title}</Link>
                  )) : <p className="text-sm text-muted-foreground">Not currently used in blog posts.</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => void copyText(`![${editingAlt || selectedMedia.file_name}](${selectedMedia.file_url})`, "Markdown copied")}>
                    <Copy className="mr-1.5 h-4 w-4" /> Markdown
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(selectedMedia.id)}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteUsage.length || deleteItem?.usage_count ? "Delete in-use media?" : "Delete Media"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This will permanently delete this file from storage.</p>
                {deleteUsage.length || deleteItem?.usage_count ? (
                  <div>
                    <p className="font-medium text-foreground">This asset is used in {deleteUsage.length || deleteItem?.usage_count} post{(deleteUsage.length || deleteItem?.usage_count || 0) === 1 ? "" : "s"}:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {deleteUsage.map((post) => <li key={post.id}>{post.title}</li>)}
                    </ul>
                    <p className="mt-2">Deleting it may break those pages.</p>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && void handleDelete(deleteId)}>
              {deleteUsage.length || deleteItem?.usage_count ? "Delete Anyway" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={orphansOpen} onOpenChange={setOrphansOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Orphaned Storage Objects</DialogTitle>
          </DialogHeader>
          {findingOrphans ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Scanning storage...</div>
          ) : orphans.length ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{orphans.length} orphaned file{orphans.length === 1 ? "" : "s"} found in storage.</p>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {orphans.map((orphan) => (
                  <div key={orphan.path} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{orphan.path}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(orphan.size)} · {format(new Date(orphan.last_modified), "MMM d, yyyy")}</p>
                    </div>
                    <Button variant="outline" size="sm" disabled={deletingOrphans} onClick={() => void deleteOrphans([orphan.path])}>Delete</Button>
                  </div>
                ))}
              </div>
              <Button variant="destructive" disabled={deletingOrphans} onClick={() => void deleteOrphans(orphans.map((item) => item.path))}>
                {deletingOrphans ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete All Orphans
              </Button>
            </div>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">No orphaned files found.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMediaLibrary;
