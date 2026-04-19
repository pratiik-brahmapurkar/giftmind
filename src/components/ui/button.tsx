import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-body font-medium transition-all duration-normal ease-snappy rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
       variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-amber-500 active:scale-[0.98] shadow-sm hover:shadow-md",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98] shadow-sm",
        outline:
          "border border-border bg-transparent hover:bg-muted hover:text-foreground active:scale-[0.98]",
        secondary:
          "border-2 border-indigo-600 text-indigo-600 bg-transparent hover:bg-indigo-50 active:bg-indigo-100 active:scale-[0.98]",
        ghost:
          "hover:bg-muted hover:text-foreground active:scale-[0.98]",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
        hero:
          "gradient-primary text-primary-foreground font-semibold shadow-md hover:shadow-glow-amber hover:brightness-105 active:scale-[0.98]",
        "hero-outline":
          "border-2 border-primary text-primary bg-transparent hover:bg-primary/10 active:scale-[0.98]",
      },
      size: {
        sm:      "h-8  px-3   text-xs",
        default: "h-10 px-4   py-2 text-sm",
        lg:      "h-12 px-6   text-base rounded-lg",
        xl:      "h-14 px-8   text-lg rounded-lg",
        icon:    "h-10 w-10   rounded-md",
        "icon-sm": "h-8 w-8   rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
