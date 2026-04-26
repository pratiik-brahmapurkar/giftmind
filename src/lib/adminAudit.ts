import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";

export async function logAdminAction(params: {
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  payload?: Record<string, unknown>;
}) {
  const { error } = await supabase.functions.invoke("log-admin-action", {
    body: params,
  });

  if (error) {
    captureError(error, { action: "log-admin-action", audit_action: params.action });
  }
}
