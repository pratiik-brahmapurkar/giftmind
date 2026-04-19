import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InlineProps {
  gap?: "xs" | "sm" | "md" | "lg";
  align?: "start" | "center" | "end";
  wrap?: boolean;
  children: ReactNode;
  className?: string;
}

const gapMap = {
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
} as const;

const alignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
} as const;

export function Inline({ gap = "sm", align = "center", wrap = false, children, className }: InlineProps) {
  return <div className={cn("flex", gapMap[gap], alignMap[align], wrap && "flex-wrap", className)}>{children}</div>;
}
