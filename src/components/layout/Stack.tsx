import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StackProps {
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "stretch";
  children: ReactNode;
  className?: string;
}

const gapMap = {
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
} as const;

const alignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
} as const;

export function Stack({ gap = "md", align = "stretch", children, className }: StackProps) {
  return <div className={cn("flex flex-col", gapMap[gap], alignMap[align], className)}>{children}</div>;
}
