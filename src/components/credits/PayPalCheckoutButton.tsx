import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/posthog";

type CreditPackage = Database["public"]["Tables"]["credit_packages"]["Row"];

type PayPalNamespace = {
  Buttons: (options: {
    style?: Record<string, string>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
  }) => {
    render: (selector: string) => Promise<void>;
    close?: () => void;
  };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let paypalScriptPromise: Promise<void> | null = null;

function loadPayPalScript(clientId: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("PayPal requires a browser"));
  if (window.paypal?.Buttons) return Promise.resolve();
  if (paypalScriptPromise) return paypalScriptPromise;

  paypalScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      "client-id": clientId,
      currency: "USD",
      intent: "capture",
      components: "buttons",
    });

    script.id = "paypal-js-sdk";
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      paypalScriptPromise = null;
      reject(new Error("PayPal could not be loaded"));
    };

    document.head.appendChild(script);
  });

  return paypalScriptPromise;
}

async function invokePayPalCheckout<T>(body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error("Please sign in before buying credits.");
  }

  supabase.functions.setAuth(accessToken);
  const response = await supabase.functions.invoke<T>("paypal-checkout", { body });

  if (response.error) {
    let message = response.error.message || "PayPal checkout failed";

    const context = (response.error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();
        message = payload?.error || payload?.message || message;
      } catch {
        // Keep the Supabase fallback message.
      }
    }

    throw new Error(message);
  }

  if (!response.data) {
    throw new Error("PayPal checkout did not return a response.");
  }

  return response.data;
}

interface PayPalCheckoutButtonProps {
  creditPackage: CreditPackage;
  disabled?: boolean;
  onPurchaseComplete?: () => void | Promise<void>;
}

export function PayPalCheckoutButton({
  creditPackage,
  disabled = false,
  onPurchaseComplete,
}: PayPalCheckoutButtonProps) {
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
  const reactId = useId();
  const containerId = useMemo(
    () => `paypal-button-${creditPackage.id}-${reactId.replace(/:/g, "")}`,
    [creditPackage.id, reactId],
  );
  const buttonsRef = useRef<ReturnType<PayPalNamespace["Buttons"]> | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(clientId));
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || disabled) {
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setLoadError(null);

    loadPayPalScript(clientId)
      .then(async () => {
        if (!active || !window.paypal?.Buttons) return;

        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";

        const buttons = window.paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "paypal",
          },
          createOrder: async () => {
            trackEvent("credit_purchase_checkout_opened", {
              provider: "paypal",
              package_id: creditPackage.id,
              package_name: creditPackage.name,
              currency: "USD",
            });

            const response = await invokePayPalCheckout<{ order_id: string }>({
              action: "create_order",
              package_id: creditPackage.id,
              currency: "USD",
            });

            return response.order_id;
          },
          onApprove: async (data) => {
            setIsProcessing(true);
            try {
              const response = await invokePayPalCheckout<{
                credits_added: number;
                credits_balance: number;
              }>({
                action: "capture_order",
                order_id: data.orderID,
              });

              trackEvent("credit_purchase_completed", {
                provider: "paypal",
                package_id: creditPackage.id,
                package_name: creditPackage.name,
                credits_added: response.credits_added,
                credits_balance: response.credits_balance,
                currency: "USD",
              });

              toast.success(`${response.credits_added} credits added to your account.`);
              await onPurchaseComplete?.();
            } catch (error) {
              const message = error instanceof Error ? error.message : "PayPal capture failed";
              trackEvent("credit_purchase_failed", {
                provider: "paypal",
                package_id: creditPackage.id,
                stage: "capture",
                message,
              });
              toast.error(message);
            } finally {
              setIsProcessing(false);
            }
          },
          onCancel: () => {
            trackEvent("credit_purchase_cancelled", {
              provider: "paypal",
              package_id: creditPackage.id,
            });
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : "PayPal checkout failed";
            trackEvent("credit_purchase_failed", {
              provider: "paypal",
              package_id: creditPackage.id,
              stage: "paypal_button",
              message,
            });
            toast.error(message);
          },
        });

        buttonsRef.current = buttons;
        await buttons.render(`#${containerId}`);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "PayPal could not be loaded");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      buttonsRef.current?.close?.();
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = "";
    };
  }, [clientId, containerId, creditPackage, disabled, onPurchaseComplete]);

  if (!clientId) {
    return (
      <Button type="button" className="w-full" disabled>
        PayPal unavailable
      </Button>
    );
  }

  if (disabled) {
    return (
      <Button type="button" className="w-full" disabled>
        PayPal unavailable
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div
        id={containerId}
        className={isLoading || isProcessing ? "pointer-events-none opacity-60" : undefined}
      />
      {(isLoading || isProcessing) && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {isProcessing ? "Adding credits..." : "Loading PayPal..."}
        </div>
      )}
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
    </div>
  );
}
