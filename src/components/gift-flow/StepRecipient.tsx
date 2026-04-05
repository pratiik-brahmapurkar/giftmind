import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, User } from "lucide-react";
import { RELATIONSHIP_COLORS, RELATIONSHIP_TYPES } from "@/components/recipients/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StepRecipientProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}

const StepRecipient = ({ selectedId, onSelect, onAddNew }: StepRecipientProps) => {
  const { user } = useAuth();

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("id, name, relationship_type, interests")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Who is this for?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select a saved person or add someone new
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="p-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted mb-2" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {recipients.map((r: any) => {
            const avatarColor = RELATIONSHIP_COLORS[r.relationship_type] || "bg-primary";
            const relLabel = RELATIONSHIP_TYPES.find((t) => t.value === r.relationship_type)?.label;
            return (
              <Card
                key={r.id}
                className={cn(
                  "cursor-pointer border-2 transition-all hover:shadow-md",
                  selectedId === r.id
                    ? "border-primary shadow-md"
                    : "border-border/50 hover:border-primary/30"
                )}
                onClick={() => onSelect(r.id)}
              >
                <CardContent className="p-4">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground mb-2",
                      avatarColor
                    )}
                  >
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="font-medium text-sm text-foreground truncate">{r.name}</p>
                  {relLabel && (
                    <Badge variant="outline" className="text-[9px] mt-1">{relLabel}</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Add new card */}
          <Card
            className="cursor-pointer border-2 border-dashed border-border/50 hover:border-primary/30 transition-all"
            onClick={onAddNew}
          >
            <CardContent className="p-4 flex flex-col items-center justify-center text-center min-h-[120px]">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Add Someone New</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StepRecipient;
