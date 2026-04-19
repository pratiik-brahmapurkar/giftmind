import * as React from "react";
import { cn } from "@/lib/utils";
import { Edit2, Gift } from "lucide-react";
import { Badge } from "./badge";

export interface RecipientCardProps {
  name: string;
  relationship?: string;
  avatarColor?: string; // e.g. "bg-amber-100 text-amber-700"
  lastGiftDate?: string;
  giftCount: number;
  onSelect: () => void;
  onEdit: () => void;
  className?: string;
}

export function RecipientCard({
  name,
  relationship,
  avatarColor = "bg-amber-100 text-amber-700",
  lastGiftDate,
  giftCount,
  onSelect,
  onEdit,
  className
}: RecipientCardProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div 
      className={cn(
        "group flex items-center justify-between bg-card hover:bg-[#F2EDE4] border border-border hover:border-[#CFC7BB] rounded-lg p-[18px] transition-colors duration-200 cursor-pointer shadow-sm",
        className
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-heading font-semibold text-sm select-none", avatarColor)}>
          {initials}
        </div>
        
        {/* Content */}
        <div className="flex flex-col">
          <span className="font-body font-medium text-foreground">{name}</span>
          {relationship && (
            <span className="font-body text-xs text-muted-foreground">{relationship}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Metadata */}
        <div className="flex items-center gap-3">
          {lastGiftDate && (
            <span className="hidden sm:inline-block font-body text-xs text-muted-foreground">
              Last: {lastGiftDate}
            </span>
          )}
          <Badge variant="default" className="gap-1.5 font-sans">
            <Gift size={12} strokeWidth={1.5} />
            {giftCount}
          </Badge>
        </div>

        {/* Actions - visible on hover */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-foreground hover:bg-[#E8E3DB] rounded-md focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${name}`}
        >
          <Edit2 size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
