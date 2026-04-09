import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, alt: string) => void;
}

export default function MediaPickerModal({ open, onClose, onSelect }: MediaPickerModalProps) {
  const [search, setSearch] = useState("");

  const { data: media = [] } = useQuery({
    queryKey: ["blog-media-picker"],
    queryFn: async () => {
      const { data } = await supabase.from("blog_media").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    enabled: open,
  });

  const filtered = media.filter((m) => m.file_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Image</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search media..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 overflow-y-auto flex-1 py-2">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => { onSelect(m.file_url, m.alt_text || m.file_name); onClose(); }}
              className="aspect-square rounded-md overflow-hidden border hover:ring-2 ring-primary transition-all"
            >
              <img
                src={m.file_url}
                alt={m.alt_text || m.file_name}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                width={640}
                height={640}
              />
            </button>
          ))}
          {filtered.length === 0 && <p className="col-span-full text-center text-muted-foreground py-8">No media found</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
