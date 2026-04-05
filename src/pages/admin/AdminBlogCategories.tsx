import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CategoryForm {
  id?: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
}

const emptyForm: CategoryForm = { name: "", slug: "", icon: "📁", description: "" };

const AdminBlogCategories = () => {
  const queryClient = useQueryClient();
  const [editCat, setEditCat] = useState<CategoryForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: categories = [], isLoading } = useQuery({
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

  // Count posts per category
  const { data: postCounts = {} } = useQuery({
    queryKey: ["admin-blog-post-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("category_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((p) => {
        if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      });
      return counts;
    },
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const openEdit = (cat?: any) => {
    if (cat) {
      setEditCat({ id: cat.id, name: cat.name, slug: cat.slug, icon: cat.icon || "📁", description: cat.description || "" });
    } else {
      setEditCat({ ...emptyForm });
    }
  };

  const handleSave = async () => {
    if (!editCat || !editCat.name) { toast.error("Name is required"); return; }
    setSaving(true);
    const slug = editCat.slug || generateSlug(editCat.name);
    try {
      const payload = { name: editCat.name, slug, icon: editCat.icon, description: editCat.description };
      if (editCat.id) {
        const { error } = await supabase.from("blog_categories").update(payload).eq("id", editCat.id);
        if (error) throw error;
        toast.success("Category updated");
      } else {
        const { error } = await supabase.from("blog_categories").insert({
          ...payload,
          sort_order: categories.length + 1,
        });
        if (error) throw error;
        toast.success("Category created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-blog-categories"] });
      setEditCat(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("blog_categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-blog-categories"] });
    toast.success("Category deleted");
    setDeleteId(null);
  };

  const deleteCategory = categories.find((c) => c.id === deleteId);
  const deletePostCount = deleteId ? (postCounts as Record<string, number>)[deleteId] || 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Blog Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">Organize your blog content</p>
        </div>
        <Button size="sm" onClick={() => openEdit()}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Category
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : categories.length === 0 ? (
        <p className="text-muted-foreground text-sm">No categories yet. Create your first one!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="group">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-2xl">{cat.icon || "📁"}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{cat.name}</h3>
                      {cat.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cat.description}</p>
                      )}
                      <Badge variant="outline" className="mt-2 text-xs">
                        {(postCounts as Record<string, number>)[cat.id] || 0} posts
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(cat)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" onClick={() => setDeleteId(cat.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      <Dialog open={!!editCat} onOpenChange={(o) => !o && setEditCat(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCat?.id ? "Edit Category" : "New Category"}</DialogTitle>
            <DialogDescription>Configure category details</DialogDescription>
          </DialogHeader>
          {editCat && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-[60px_1fr] gap-3">
                <div>
                  <Label>Icon</Label>
                  <Input value={editCat.icon} onChange={(e) => setEditCat({ ...editCat, icon: e.target.value })} className="text-center text-lg" maxLength={4} />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input value={editCat.name} onChange={(e) => setEditCat({ ...editCat, name: e.target.value, slug: editCat.id ? editCat.slug : generateSlug(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={editCat.slug} onChange={(e) => setEditCat({ ...editCat, slug: e.target.value })} className="font-mono text-sm" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editCat.description} onChange={(e) => setEditCat({ ...editCat, description: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCat(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePostCount > 0
                ? `Warning: This category has ${deletePostCount} post${deletePostCount > 1 ? "s" : ""}. They will become uncategorized.`
                : "Are you sure you want to delete this category?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBlogCategories;
