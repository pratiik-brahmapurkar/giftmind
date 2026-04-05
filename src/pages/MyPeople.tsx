import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import RecipientCard from "@/components/recipients/RecipientCard";
import RecipientFormModal from "@/components/recipients/RecipientFormModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import type { RecipientFormData } from "@/components/recipients/constants";

const MyPeople = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch recipients
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Create
  const createMutation = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const { error } = await supabase.from("recipients").insert({
        user_id: user!.id,
        name: form.name,
        relationship_type: form.relationship_type as any,
        relationship_depth: form.relationship_depth as any,
        age_range: form.age_range ? (form.age_range as any) : null,
        gender: form.gender ? (form.gender as any) : null,
        interests: form.interests,
        cultural_context: form.cultural_context ? (form.cultural_context as any) : null,
        notes: form.notes || null,
        important_dates: form.important_dates as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      setModalOpen(false);
      toast.success("Person added!");
    },
    onError: () => toast.error("Failed to add person"),
  });

  // Update
  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: RecipientFormData }) => {
      const { error } = await supabase
        .from("recipients")
        .update({
          name: form.name,
          relationship_type: form.relationship_type as any,
          relationship_depth: form.relationship_depth as any,
          age_range: form.age_range ? (form.age_range as any) : null,
          gender: form.gender ? (form.gender as any) : null,
          interests: form.interests,
          cultural_context: form.cultural_context ? (form.cultural_context as any) : null,
          notes: form.notes || null,
          important_dates: form.important_dates as any,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      setEditingId(null);
      setModalOpen(false);
      toast.success("Person updated!");
    },
    onError: () => toast.error("Failed to update"),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      setDeletingId(null);
      toast.success("Person removed");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const openEdit = (id: string) => {
    setEditingId(id);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setModalOpen(true);
  };

  const editingRecipient = editingId
    ? recipients.find((r: any) => r.id === editingId)
    : null;

  const editInitialData: RecipientFormData | undefined = editingRecipient
    ? {
        name: editingRecipient.name,
        relationship_type: editingRecipient.relationship_type,
        relationship_depth: editingRecipient.relationship_depth,
        age_range: editingRecipient.age_range || "",
        gender: editingRecipient.gender || "",
        interests: editingRecipient.interests || [],
        cultural_context: editingRecipient.cultural_context || "",
        notes: editingRecipient.notes || "",
        important_dates: (editingRecipient.important_dates as any) || [],
      }
    : undefined;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto pb-20 md:pb-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
            My People
          </h1>
          <Button variant="hero" size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Add Person
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-5 space-y-3 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-11 h-11 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-2/3" />
                      <div className="h-3 bg-muted rounded w-1/3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : recipients.length === 0 ? (
          /* Empty state */
          <Card className="border-border/50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <Users className="w-10 h-10 text-primary/50" />
              </div>
              <p className="text-foreground font-heading font-semibold mb-1">
                No people added yet
              </p>
              <p className="text-muted-foreground text-sm max-w-xs mb-5">
                Add someone you care about to get started with personalized gift recommendations
              </p>
              <Button variant="hero" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> Add Person
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipients.map((r: any) => (
              <RecipientCard
                key={r.id}
                recipient={r}
                onEdit={() => openEdit(r.id)}
                onDelete={() => setDeletingId(r.id)}
                onFindGift={() => navigate(`/gift-flow?recipient=${r.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      <RecipientFormModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditingId(null);
        }}
        onSubmit={(data) => {
          if (editingId) {
            updateMutation.mutate({ id: editingId, form: data });
          } else {
            createMutation.mutate(data);
          }
        }}
        initialData={editInitialData}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this person?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete their profile and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default MyPeople;
