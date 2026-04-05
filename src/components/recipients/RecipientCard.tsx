import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gift, Pencil, Trash2 } from "lucide-react";
import { RELATIONSHIP_TYPES, RELATIONSHIP_COLORS } from "./constants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface RecipientCardProps {
  recipient: {
    id: string;
    name: string;
    relationship_type: string;
    interests: string[];
    last_gift_date: string | null;
  };
  onEdit: () => void;
  onFindGift: () => void;
}

const RecipientCard = ({ recipient, onEdit, onFindGift }: RecipientCardProps) => {
  const initial = recipient.name.charAt(0).toUpperCase();
  const relLabel =
    RELATIONSHIP_TYPES.find((r) => r.value === recipient.relationship_type)?.label ??
    recipient.relationship_type;
  const avatarColor = RELATIONSHIP_COLORS[recipient.relationship_type] || "bg-primary";

  return (
    <Card className="group border-border/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={cn(
              "w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-primary-foreground shrink-0",
              avatarColor
            )}
          >
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-heading font-semibold text-foreground truncate">
              {recipient.name}
            </h3>
            <Badge variant="outline" className="text-[10px] mt-0.5">
              {relLabel}
            </Badge>
          </div>
        </div>

        {/* Interests */}
        {recipient.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {recipient.interests.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] font-normal">
                {tag}
              </Badge>
            ))}
            {recipient.interests.length > 3 && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                +{recipient.interests.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Last gift */}
        <p className="text-[11px] text-muted-foreground mt-3">
          {recipient.last_gift_date
            ? `Last gift: ${format(new Date(recipient.last_gift_date), "MMM d, yyyy")}`
            : "No gifts yet"}
        </p>

        {/* Hover actions */}
        <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="hero" size="sm" className="flex-1 h-8 text-xs" onClick={onFindGift}>
            <Gift className="w-3 h-3 mr-1" /> Find a Gift
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onEdit}>
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RecipientCard;
