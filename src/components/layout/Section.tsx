import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  size?: "sm" | "md" | "lg";
  bg?: "default" | "subtle" | "amber" | "dark";
  children: ReactNode;
  className?: string;
}

const bgMap = {
  default: "bg-background",
  subtle: "bg-[#F2EDE4]",
  amber: "bg-[#FAF5E8]",
  dark: "bg-[#1A1816] text-[#F2EDE4]",
} as const;

const padMap = {
  sm: "py-12 md:py-16",
  md: "py-12 md:py-24",
  lg: "py-16 md:py-32",
} as const;

export function Section({ size = "md", bg = "default", children, className }: SectionProps) {
  return <section className={cn(bgMap[bg], padMap[size], className)}>{children}</section>;
}
