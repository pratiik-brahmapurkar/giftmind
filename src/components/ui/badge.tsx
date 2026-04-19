import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full border font-mono font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:    "bg-[#F2EDE4] border-[#E8E3DB] text-[#403A31]",
        success:    "bg-[#3E8E7E]/10 border-[#3E8E7E]/30 text-[#3E8E7E]",
        warning:    "bg-[#D4A04A]/10 border-[#D4A04A]/30 text-[#946E32]",
        error:      "bg-[#C25450]/10 border-[#C25450]/30 text-[#C25450]",
        primary:    "bg-[#D4A04A]/10 border-[#D4A04A]/30 text-[#6F5326]",
        secondary:  "bg-[#4C2A85]/10 border-[#4C2A85]/30 text-[#4C2A85]",
        locked:     "bg-[#F2EDE4] border-[#E8E3DB] text-[#A69D8F] opacity-60",
        dark:       "bg-[#2A2724] border-[#403A31] text-[#E8E3DB]",
      },
      size: {
        sm: "text-[10px] px-2 py-0.5",
        md: "text-[12px] px-2.5 py-0.5",
        lg: "text-[13px] px-3 py-1",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
