import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export type MediaFolder = "all" | "blog" | "brand" | "og-images" | "uncategorised";
export type MediaAssetType = "blog-image" | "brand" | "og-image" | "misc";

export const MEDIA_FOLDERS: Array<{ value: Exclude<MediaFolder, "all">; label: string; assetType: MediaAssetType }> = [
  { value: "blog", label: "Blog Images", assetType: "blog-image" },
  { value: "brand", label: "Brand Assets", assetType: "brand" },
  { value: "og-images", label: "OG Images", assetType: "og-image" },
  { value: "uncategorised", label: "Uncategorised", assetType: "misc" },
];

export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"] as const;

const SVG_MAX_BYTES = 512 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function formatBytes(bytes: number | null | undefined) {
  const value = bytes || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function getAssetTypeForFolder(folder: string): MediaAssetType {
  return MEDIA_FOLDERS.find((item) => item.value === folder)?.assetType || "misc";
}

export function validateMediaFile(file: File) {
  if (!ALLOWED_MEDIA_TYPES.includes(file.type as (typeof ALLOWED_MEDIA_TYPES)[number])) {
    throw new Error(`${file.name}: unsupported format.`);
  }

  const maxSize = file.type === "image/svg+xml" ? SVG_MAX_BYTES : IMAGE_MAX_BYTES;
  if (file.size > maxSize) {
    throw new Error(`${file.name} exceeds ${file.type === "image/svg+xml" ? "512KB" : "5MB"} limit.`);
  }
}

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (file.type === "image/svg+xml") return Promise.resolve({ width: 0, height: 0 });

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function uploadMediaAsset(params: {
  file: File;
  altText: string;
  folder: Exclude<MediaFolder, "all">;
  uploadedBy: string;
}) {
  const { file, altText, folder, uploadedBy } = params;
  const cleanAlt = altText.trim();
  if (!cleanAlt) throw new Error("Alt text is required before uploading.");

  validateMediaFile(file);
  const dimensions = await getImageDimensions(file);
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}.${ext}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("blog-media")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("blog-media").getPublicUrl(uploadData.path);

  const payload: TablesInsert<"blog_media"> = {
    file_name: file.name,
    file_url: urlData.publicUrl,
    file_size: file.size,
    file_type: file.type,
    alt_text: cleanAlt,
    folder,
    asset_type: getAssetTypeForFolder(folder),
    width: dimensions.width,
    height: dimensions.height,
    uploaded_by: uploadedBy,
  };

  const { data, error: dbError } = await supabase
    .from("blog_media")
    .insert(payload)
    .select("*")
    .single();

  if (dbError) {
    await supabase.storage.from("blog-media").remove([uploadData.path]);
    throw dbError;
  }

  return data;
}

export function getStoragePathFromPublicUrl(fileUrl: string) {
  return decodeURIComponent(fileUrl.split("/blog-media/")[1] || "");
}
