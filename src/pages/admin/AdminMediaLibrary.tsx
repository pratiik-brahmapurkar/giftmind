import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Upload, Copy, Trash2, ImageIcon, X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const AdminMediaLibrary = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingAlt, setEditingAlt] = useState("");

  const { data: mediaItems = [], isLoading } = useQuery({
    queryKey: ["admin-blog-media"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_media")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    let list = mediaItems;
    if (typeFilter !== "all") list = list.filter((m) => m.file_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.file_name.toLowerCase().includes(q));
    }
    return list;
  }, [mediaItems, typeFilter, search]);

  const fileTypes = useMemo(() => {
    const types = new Set(mediaItems.map((m) => m.file_type));
    return Array.from(types).sort();
  }, [mediaItems]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!user) return;
    setUploading(true);
    const fileArr = Array.from(files);
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    for (const file of fileArr) {
      if (file.size > maxSize) { toast.error(`${file.name} exceeds 5MB limit`); continue; }
      if (!allowed.includes(file.type)) { toast.error(`${file.name}: unsupported format`); continue; }

      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("blog-media")
        .upload(path, file, { contentType: file.type });

      if (uploadError) { toast.error(`Upload failed: ${uploadError.message}`); continue; }

      const { data: urlData } = supabase.storage.from("blog-media").getPublicUrl(path);

      const { error: dbError } = await supabase.from("blog_media").insert({
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
      });

      if (dbError) toast.error(`DB error: ${dbError.message}`);
    }

    queryClient.invalidateQueries({ queryKey: ["admin-blog-media"] });
    setUploading(false);
    toast.success(`${fileArr.length} file(s) uploaded`);
  }, [user, queryClient]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied");
  };

  const handleDelete = async (id: string) => {
    const item = mediaItems.find((m) => m.id === id);
    if (item) {
      // Extract path from URL
      const urlParts = item.file_url.split("/blog-media/");
      if (urlParts[1]) {
        await supabase.storage.from("blog-media").remove([urlParts[1]]);
      }
    }
    const { error } = await supabase.from("blog_media").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-blog-media"] });
    if (selectedMedia?.id === id) setSelectedMedia(null);
    toast.success("Media deleted");
    setDeleteId(null);
  };

  const saveAltText = async () => {
    if (!selectedMedia) return;
    const { error } = await supabase.from("blog_media").update({ alt_text: editingAlt }).eq("id", selectedMedia.id);
    if (error) { toast.error("Failed to save"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-blog-media"] });
    setSelectedMedia({ ...selectedMedia, alt_text: editingAlt });
    toast.success("Alt text saved");
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Media Library</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage images for your blog</p>
      </div>

      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">{uploading ? "Uploading..." : "Drag & drop images here"}</p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse · JPG, PNG, WebP, GIF · Max 5MB</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by file name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="File type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {fileTypes.map((t) => <SelectItem key={t} value={t}>{t.split("/")[1]?.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} file{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">No media files yet. Upload your first image!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="group relative border rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => { setSelectedMedia(m); setEditingAlt(m.alt_text || ""); }}
            >
              <div className="aspect-square bg-muted">
                <img src={m.file_url} alt={m.alt_text || m.file_name} className="w-full h-full object-cover" loading="lazy" />
              </div>
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button size="icon" variant="ghost" className="w-8 h-8 text-white hover:text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); copyUrl(m.file_url); }}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="w-8 h-8 text-white hover:text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setDeleteId(m.id); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-2">
                <p className="text-xs font-medium truncate">{m.file_name}</p>
                <p className="text-[10px] text-muted-foreground">{formatSize(m.file_size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedMedia} onOpenChange={(o) => !o && setSelectedMedia(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Media Details</SheetTitle>
            <SheetDescription>View and edit media properties</SheetDescription>
          </SheetHeader>
          {selectedMedia && (
            <div className="mt-6 space-y-5">
              <div className="rounded-lg overflow-hidden border bg-muted">
                <img src={selectedMedia.file_url} alt={selectedMedia.alt_text || selectedMedia.file_name} className="w-full max-h-72 object-contain" />
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">File Name</Label>
                  <p className="text-sm font-medium">{selectedMedia.file_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input readOnly value={selectedMedia.file_url} className="text-xs font-mono" />
                    <Button size="icon" variant="outline" className="shrink-0" onClick={() => copyUrl(selectedMedia.file_url)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Alt Text</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={editingAlt} onChange={(e) => setEditingAlt(e.target.value)} placeholder="Describe the image..." />
                    <Button size="sm" onClick={saveAltText}>Save</Button>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">File Size</Label>
                    <p>{formatSize(selectedMedia.file_size)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <p>{selectedMedia.file_type}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Uploaded</Label>
                    <p>{format(new Date(selectedMedia.created_at), "MMM d, yyyy")}</p>
                  </div>
                </div>
                <Separator />
                <Button variant="destructive" size="sm" className="w-full" onClick={() => setDeleteId(selectedMedia.id)}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete Image
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this file from storage. This action cannot be undone.</AlertDialogDescription>
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

export default AdminMediaLibrary;
