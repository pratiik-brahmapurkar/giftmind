import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gift, MoreVertical, Pencil, Trash2, ArrowRight, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_AVATAR_COLORS,
  RELATIONSHIP_BADGE_COLORS,
  COUNTRY_OPTIONS,
} from "./constants";
import { cn } from "@/lib/utils";

interface RecipientCardProps {
  recipient: {
    id: string;
    name: string;
    relationship?: string | null;
    relationship_type?: string | null;
    interests: string[];
    last_gift_date: string | null;
    gift_count?: number;
    important_dates: Array<{ label?: string; date?: string; recurring?: boolean }> | null;
    country?: string;
  };
  userCountry?: string;
  onEdit: () => void;
  onDelete: () => void;
  onFindGift: () => void;
  onCardClick: () => void;
  isLocked?: boolean;
}

/** Check if MM-DD date is within next N days */
function isWithinDays(mmdd: string, days: number): boolean {
  const diff = getDaysUntil(mmdd);
  return diff !== null && diff >= 0 && diff <= days;
}

function getDaysUntil(mmdd: string): number | null {
  if (!mmdd || mmdd.length < 4) return null;
  const [mm, dd] = mmdd.split("-").map(Number);
  if (!mm || !dd) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(today.getFullYear(), mm - 1, dd);
  if (target < today) target = new Date(today.getFullYear() + 1, mm - 1, dd);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isPriorityDateLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return normalized.includes("birthday") || normalized.includes("anniversary");
}

function formatMMDD(mmdd: string): string {
  if (!mmdd) return "";
  const [mm, dd] = mmdd.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[(mm || 1) - 1]} ${dd}`;
}

const RecipientCard = ({ recipient, userCountry, onEdit, onDelete, onFindGift, onCardClick, isLocked = false }: RecipientCardProps) => {
  const initial = recipient.name.charAt(0).toUpperCase();
  const relationship = recipient.relationship ?? recipient.relationship_type ?? "";
  const rel = RELATIONSHIP_TYPES.find((r) => r.value === relationship);
  const relLabel = rel?.label ?? relationship;
  const avatarColor = RELATIONSHIP_AVATAR_COLORS[relationship] || "#D4A04A";
  const badgeClass = RELATIONSHIP_BADGE_COLORS[relationship] || "bg-muted text-muted-foreground";

  const dates: { label: string; date: string; recurring?: boolean }[] =
    [...(Array.isArray(recipient.important_dates) ? recipient.important_dates : [])].sort((a, b) => {
      const priorityA = isPriorityDateLabel(a.label || "") ? 0 : 1;
      const priorityB = isPriorityDateLabel(b.label || "") ? 0 : 1;
      if (priorityA !== priorityB) return priorityA - priorityB;

      const daysA = getDaysUntil(a.date || "");
      const daysB = getDaysUntil(b.date || "");
      if (daysA === null && daysB === null) return 0;
      if (daysA === null) return 1;
      if (daysB === null) return -1;
      return daysA - daysB;
    });

  const maxInterests = 3;
  const interests = recipient.interests ?? [];
  const shownInterests = interests.slice(0, maxInterests);
  const overflow = interests.length - maxInterests;
  const giftCount = recipient.gift_count || 0;

  return (
    <Card
      onClick={onCardClick}
      className={cn(
        "group relative cursor-pointer border-border/50 transition-all duration-200",
        isLocked
          ? "bg-muted/30 opacity-60"
          : "hover:shadow-lg hover:-translate-y-0.5",
      )}
    >
      <CardContent className="p-5">
        {isLocked && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background/55 backdrop-blur-[1px]">
            <div className="mx-4 rounded-xl border border-border bg-card/95 px-4 py-3 text-center text-sm text-muted-foreground shadow-sm">
              <Lock className="mx-auto mb-1 h-4 w-4" />
              🔒 Upgrade to use this person in gift sessions
            </div>
          </div>
        )}
        {/* Top row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
              style={{ backgroundColor: avatarColor }}
            >
              {initial}
            </div>
            <div className="min-w-0">
              <h3 className="font-heading font-semibold text-lg text-foreground truncate leading-tight">
                {recipient.name}
                {recipient.country && recipient.country !== "" && recipient.country !== userCountry && (
                  <span className="ml-1 text-[13px]">{COUNTRY_OPTIONS.find((c) => c.value === recipient.country)?.flag}</span>
                )}
              </h3>
              <Badge variant="outline" className={cn("text-[10px] mt-1 border", badgeClass)}>
                {relLabel}
              </Badge>
            </div>
          </div>

          {/* Three-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onEdit(); }}>
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onFindGift(); }} disabled={isLocked}>
                <Gift className="w-3.5 h-3.5 mr-2" /> Find a Gift
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(event) => { event.stopPropagation(); onDelete(); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Interests */}
        {recipient.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {shownInterests.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] font-normal bg-muted text-muted-foreground">
                {tag}
              </Badge>
            ))}
            {overflow > 0 && (
              <Badge variant="secondary" className="text-[10px] font-normal bg-muted text-muted-foreground">
                +{overflow} more
              </Badge>
            )}
          </div>
        )}

        {/* Important dates */}
        {dates.length > 0 && (
          <div className="space-y-1 mb-3">
            {dates.slice(0, 2).map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{d.label?.toLowerCase().includes("birthday") ? "🎂" : "💍"}</span>
                <span>{d.label}: {formatMMDD(d.date)}</span>
                {isWithinDays(d.date, 14) && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-warning/10 text-warning border-warning/20 ml-1" variant="outline">
                    Coming up!
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Last gift */}
        <p className="text-[11px] text-muted-foreground">
          {giftCount > 0 ? `${giftCount} gift${giftCount === 1 ? "" : "s"} chosen` : "No gifts yet"}
          {recipient.last_gift_date
            ? ` · Last gift: ${new Date(recipient.last_gift_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`
            : ""}
        </p>

        <div className="mt-3">
          <Button
            variant="hero"
            size="sm"
            className="h-8 w-full text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onFindGift();
            }}
            disabled={isLocked}
          >
            Find a Gift <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RecipientCard;
