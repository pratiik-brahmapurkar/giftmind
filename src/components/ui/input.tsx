import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  state?: 'default' | 'error' | 'success' | 'disabled';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, hint, error, leading, trailing, state = 'default', required, disabled, ...props }, ref) => {
    const isError = state === 'error' || error;
    const isSuccess = state === 'success';
    const isDisabled = state === 'disabled' || disabled;

    return (
      <div className="flex flex-col gap-1 w-full text-left">
        {label && (
          <label className="font-body font-medium text-sm text-[#403A31]">
            {label}
            {required && <span className="text-amber-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {leading && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {leading}
            </div>
          )}
          <input
            type={type}
            className={cn(
              "flex h-10 w-full rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 font-body text-base text-neutral-900 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-100",
              isError && "border-error focus-visible:ring-2 focus-visible:ring-error/20 focus-visible:border-error",
              isSuccess && "border-success focus-visible:ring-2 focus-visible:ring-success/20 focus-visible:border-success",
              !isError && !isSuccess && "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
              leading && "pl-10",
              trailing && "pr-10",
              className
            )}
            ref={ref}
            disabled={isDisabled}
            required={required}
            {...props}
          />
          {trailing && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {trailing}
            </div>
          )}
        </div>
        {error ? (
          <p className="flex items-center gap-1 text-xs font-body text-error mt-1">
            <AlertCircle size={12} strokeWidth={1.5} />
            {error}
          </p>
        ) : hint ? (
          <p className="text-xs font-body text-muted-foreground mt-1">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
