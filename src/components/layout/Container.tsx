import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ContainerProps {
  size?: "prose" | "narrow" | "default" | "wide" | "full";
  children: ReactNode;
  className?: string;
}

const sizeMap = {
  prose: "max-w-[640px]",
  narrow: "max-w-[768px]",
  default: "max-w-[1024px]",
  wide: "max-w-[1280px]",
  full: "max-w-[1440px]",
} as const;

export function Container({ size = "default", children, className }: ContainerProps) {
  return <div className={cn("mx-auto w-full px-4 md:px-6 lg:px-8", sizeMap[size], className)}>{children}</div>;
}
