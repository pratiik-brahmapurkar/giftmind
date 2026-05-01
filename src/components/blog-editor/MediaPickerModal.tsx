import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Loader2, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { ALLOWED_MEDIA_TYPES, MEDIA_FOLDERS, uploadMediaAsset, type MediaFolder } from "@/lib/mediaLibrary";
import { trackEvent } from "@/lib/posthog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, alt: string, mediaId?: string) => void;
}

type BlogMediaRow = Tables<"blog_media">;
const PAGE_SIZE = 24;

export default function MediaPickerModal({ open, onClose, onSelect }: MediaPickerModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<MediaFolder>("all");
  const [page, setPage] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingNoAlt, setPendingNoAlt] = useState<BlogMediaRow | null>(null);
  const [fallbackAlt, setFallbackAlt] = useState("");

  useEffect(() => {
    if (open) setPage(0);
  }, [open, search, folder]);

  const { data: media = [], isFetching } = useQuery({
    queryKey: ["blog-media-picker", search, folder, page],
    queryFn: async () => {
      let query = supabase
        .from("blog_media")
        .select("*")
        .order("created_at", { ascending: false })
        .range(0, (page + 1) * PAGE_SIZE - 1);

      if (folder !== "all") query = query.eq("folder", folder);
      if (search.trim()) query = query.ilike("file_name", `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BlogMediaRow[];
    },
    enabled: open,
  });

  const hasMore = media.length === (page + 1) * PAGE_SIZE;

  const folderTabs = useMemo(() => [
    { value: "all" as const, label: "All" },
    ...MEDIA_FOLDERS.filter((item) => item.value !== "uncategorised").map((item) => ({ value: item.value, label: item.label.replace(" Images", "") })),
  ], []);

  const chooseFile = (file: File) => {
    setUploadFile(file);
    setUploadAlt(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const upload = async () => {
    if (!user || !uploadFile || !uploadAlt.trim()) return;
    setUploading(true);
    try {
      const item = await uploadMediaAsset({ file: uploadFile, altText: uploadAlt, folder: "blog", uploadedBy: user.id });
      queryClient.invalidateQueries({ queryKey: ["blog-media-picker"] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-media"] });
      setUploadFile(null);
      setUploadAlt("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      trackEvent("media_uploaded", {
        file_type: uploadFile.type,
        file_size: uploadFile.size,
        folder: "blog",
        has_alt_text: true,
      });
      toast.success("Image uploaded");
      onSelect(item.file_url, item.alt_text || uploadAlt, item.id);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const selectMedia = (item: BlogMediaRow) => {
    if (!item.alt_text?.trim()) {
      setPendingNoAlt(item);
      setFallbackAlt(item.file_name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
      return;
    }

    onSelect(item.file_url, item.alt_text, item.id);
    onClose();
  };

  const insertWithoutStoredAlt = () => {
    if (!pendingNoAlt) return;
    onSelect(pendingNoAlt.file_url, fallbackAlt.trim() || pendingNoAlt.file_name, pendingNoAlt.id);
    setPendingNoAlt(null);
    onClose();
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
        <DialogContent className="flex max-h-[86vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Select Image</DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <button
                type="button"
                className="flex min-h-20 items-center justify-center rounded-md border border-dashed bg-muted/40 px-4 text-sm text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) chooseFile(file);
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Drop image here or click to upload
              </button>
              <Button disabled={!uploadFile || !uploadAlt.trim() || uploading} onClick={() => void upload()}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                Upload
              </Button>
            </div>
            {uploadFile ? (
              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div>
                  <Label htmlFor="picker-upload-alt">Alt text</Label>
                  <Input id="picker-upload-alt" value={uploadAlt} onChange={(event) => setUploadAlt(event.target.value)} placeholder="Describe this image" />
                </div>
                <Button variant="ghost" size="icon" aria-label="Clear upload file" onClick={() => setUploadFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload image"
              accept={ALLOWED_MEDIA_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) chooseFile(file);
              }}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              {folderTabs.map((item) => (
                <Button key={item.value} type="button" size="sm" variant={folder === item.value ? "default" : "outline"} onClick={() => setFolder(item.value)}>
                  {item.label}
                </Button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search media..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto py-2 sm:grid-cols-4">
            {media.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectMedia(item)}
                className="group relative aspect-square overflow-hidden rounded-md border text-left transition-all hover:ring-2 hover:ring-primary"
              >
                <img src={item.file_url} alt={item.alt_text || item.file_name} className="h-full w-full object-cover" loading="lazy" decoding="async" width={640} height={640} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="absolute left-2 top-2">
                      {item.alt_text?.trim() ? (
                        <Badge className="gap-1 bg-emerald-600 text-white"><Check className="h-3 w-3" />Alt</Badge>
                      ) : (
                        <Badge variant="destructive">No alt</Badge>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">{item.alt_text || "No alt text set"}</TooltipContent>
                </Tooltip>
                <span className="absolute inset-x-0 bottom-0 bg-black/65 p-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {item.file_name}
                </span>
              </button>
            ))}
            {!isFetching && media.length === 0 ? <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No media found</p> : null}
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">{isFetching ? "Loading..." : `${media.length} loaded`}</span>
            {hasMore ? <Button variant="outline" onClick={() => setPage((current) => current + 1)}>Load more</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingNoAlt} onOpenChange={(value) => !value && setPendingNoAlt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alt text missing</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This image has no alt text. Add it before inserting for SEO and accessibility.</p>
          <div>
            <Label htmlFor="fallback-alt">Alt text for this insert</Label>
            <Textarea id="fallback-alt" value={fallbackAlt} onChange={(event) => setFallbackAlt(event.target.value)} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingNoAlt(null)}>Cancel</Button>
            <Button onClick={insertWithoutStoredAlt}>Insert anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
