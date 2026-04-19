import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/common/SEOHead";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  Sparkles,
  Wrench,
  Globe,
  CreditCard,
  Rocket,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const TAB_CONFIG = [
  { value: "general", label: "🌐 General", icon: Globe },
  { value: "ai-config", label: "🤖 AI Configuration", icon: Sparkles },
  { value: "credits-plans", label: "💳 Credits & Plans", icon: CreditCard },
  { value: "email", label: "📧 Email", icon: Mail },
  { value: "feature-flags", label: "🚀 Feature Flags", icon: Rocket },
  { value: "security", label: "🔒 Security", icon: Shield },
  { value: "maintenance", label: "🛠️ Maintenance", icon: Wrench },
] as const;

type TabValue = (typeof TAB_CONFIG)[number]["value"];

const MODEL_OPTIONS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-20250514"];
const STORE_LEVEL_OPTIONS = ["basic", "standard", "all"];

const DEFAULT_SETTINGS = {
  site_name: "GiftMind",
  site_tagline: "AI-Powered Gift Recommendations",
  support_email: "support@giftmind.in",
  default_currency: "USD",
  default_language: "en",
  free_credits: 3,
  free_credit_validity_days: 14,
  referral_bonus_referred: 2,
  referral_bonus_referrer: 3,
  referral_credit_validity_days: 14,
  max_referrals_per_user: 10,
  ai_model_free: "claude-haiku-4-5-20251001",
  ai_model_pro: "claude-sonnet-4-20250514",
  ai_model_signal: "claude-sonnet-4-20250514",
  gift_session_cost: 1,
  signal_check_cost: 0.5,
  max_gift_sessions_per_hour: 10,
  signal_checks_per_day: 30,
  product_clicks_per_hour: 100,
  referrals_per_hour: 3,
  blog_ai_generations_per_day: 50,
  email_from_name: "GiftMind",
  email_from_email: "noreply@giftmind.in",
  email_reply_to: "support@giftmind.in",
  email_subject_expiry_warning: "⏰ [X] credits expiring in [Y] days!",
  email_subject_reminder_14: "🎂 [Name]'s [Occasion] is in 2 weeks",
  email_subject_reminder_3: "⏰ [Name]'s [Occasion] is in 3 days!",
  email_subject_welcome: "Welcome to GiftMind! 🎁",
  signup_enabled: true,
  google_oauth_enabled: true,
  blog_enabled: true,
  posthog_enabled: true,
  cookie_consent_required: true,
  feature_signup_enabled: true,
  feature_google_oauth: true,
  feature_blog_enabled: true,
  feature_signal_check: true,
  feature_cross_border_gifting: true,
  feature_occasion_reminders: true,
  feature_credit_expiry_warnings: true,
  feature_posthog_enabled: true,
  feature_cookie_consent_required: true,
  maintenance_mode: false,
  allowed_origins: ["https://giftmind.in", "http://localhost:5173"],
  maintenance_last_credit_expiry_run: null,
  maintenance_last_recalculate_run: null,
  maintenance_last_expired_batch_clear_run: null,
};

type SettingsRecord = typeof DEFAULT_SETTINGS;

type CreditPackageRow = {
  id: string;
  name: string;
  credits: number;
  price_inr: number | null;
  price_usd: number | null;
  price_eur: number | null;
  price_gbp: number | null;
  price_aed: number | null;
  price_cad: number | null;
  price_aud: number | null;
  price_sgd: number | null;
  validity_days: number;
  max_recipients: number | null;
  max_regenerations: number | null;
  stores_level: string | null;
  has_signal_check: boolean | null;
  has_batch_mode: boolean | null;
  has_priority_ai: boolean | null;
  has_history_export: boolean | null;
  badge: string | null;
  sort_order: number | null;
};

type SecurityEvent = {
  id: string;
  date: string;
  event: string;
  user: string;
  details: string;
};

type CreditGrantRow = Pick<Tables<"credit_transactions">, "id" | "created_at" | "amount" | "user_id">;
type ElevatedUserRow = Pick<Tables<"users">, "id" | "email" | "role" | "updated_at">;
type UserEmailRow = Pick<Tables<"users">, "id" | "email">;
type AIModelFieldKey = "ai_model_free" | "ai_model_pro" | "ai_model_signal";
type PackageNumericField = "credits" | "price_usd" | "validity_days" | "max_recipients" | "max_regenerations";
type PackageBooleanField = "has_signal_check" | "has_batch_mode" | "has_priority_ai" | "has_history_export";
type SecurityLimitField =
  | "max_gift_sessions_per_hour"
  | "signal_checks_per_day"
  | "product_clicks_per_hour"
  | "referrals_per_hour"
  | "blog_ai_generations_per_day";
type AdminRpcName = "run_credit_expiry" | "recalculate_all_balances";

const AI_MODEL_FIELDS: Array<{ key: AIModelFieldKey; label: string; note: string; cost: string }> = [
  { key: "ai_model_free", label: "Model for Spark/Thoughtful/Confident plans", note: "Cheaper model for standard users.", cost: "Cost: ~$0.003 per gift session." },
  { key: "ai_model_pro", label: "Model for Gifting Pro plan", note: "Premium model for Gifting Pro users. Better quality.", cost: "Cost: ~$0.035 per gift session." },
  { key: "ai_model_signal", label: "Model for Signal Check", note: "Always Sonnet — this is the premium differentiator.", cost: "Cost: ~$0.01 per signal check." },
];

const PACKAGE_NUMERIC_FIELDS: Array<{ label: string; field: PackageNumericField }> = [
  { label: "Credits", field: "credits" },
  { label: "USD", field: "price_usd" },
  { label: "Validity (days)", field: "validity_days" },
  { label: "Max People", field: "max_recipients" },
  { label: "Max Regens", field: "max_regenerations" },
];

const PACKAGE_BOOLEAN_FIELDS: Array<{ label: string; field: PackageBooleanField }> = [
  { label: "Signal", field: "has_signal_check" },
  { label: "Batch", field: "has_batch_mode" },
  { label: "Priority AI", field: "has_priority_ai" },
  { label: "Export", field: "has_history_export" },
];

const SECURITY_LIMIT_FIELDS: Array<{ label: string; field: SecurityLimitField }> = [
  { label: "Gift sessions per hour (per user)", field: "max_gift_sessions_per_hour" },
  { label: "Signal checks per day (per user)", field: "signal_checks_per_day" },
  { label: "Product clicks per hour (per user)", field: "product_clicks_per_hour" },
  { label: "Referrals per hour (per IP)", field: "referrals_per_hour" },
  { label: "Blog AI generations per day (admin)", field: "blog_ai_generations_per_day" },
];

function parseTabFromHash(hash: string): TabValue {
  const clean = hash.replace(/^#/, "") as TabValue;
  return TAB_CONFIG.some((tab) => tab.value === clean) ? clean : "general";
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function formatCurrencyAmount(value: number) {
  return `$${value.toFixed(2)}`;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : fallback;
}

function buildTemplatePreview(template: string, settings: SettingsRecord) {
  const brand = settings.site_name;
  const supportEmail = settings.support_email;
  const wrappers = {
    expiry_warning: {
      subject: settings.email_subject_expiry_warning,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
          <h2 style="color:#D4A04A; margin-bottom: 12px;">Your GiftMind credits are expiring soon</h2>
          <p>Hi Priya,</p>
          <p>You have <strong>3 credits</strong> expiring in <strong>2 days</strong>.</p>
          <p>Use them now to find a thoughtful gift with confidence.</p>
          <a href="https://giftmind.in/gift-flow" style="display:inline-block; padding: 12px 18px; background:#D4A04A; color:#2B1F0F; text-decoration:none; border-radius:8px; font-weight:600;">Find a gift</a>
          <p style="margin-top:24px; font-size:13px; color:#6B7280;">Need help? Reply to ${supportEmail}</p>
        </div>`,
    },
    reminder_14: {
      subject: settings.email_subject_reminder_14,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
          <h2 style="color:#D4A04A; margin-bottom: 12px;">Upcoming occasion reminder</h2>
          <p>Hi Priya,</p>
          <p>Arjun's birthday is in 2 weeks.</p>
          <p>${brand} can help you pick something thoughtful before the rush starts.</p>
          <a href="https://giftmind.in/gift-flow" style="display:inline-block; padding: 12px 18px; background:#D4A04A; color:#2B1F0F; text-decoration:none; border-radius:8px; font-weight:600;">Start gift flow</a>
        </div>`,
    },
    reminder_3: {
      subject: settings.email_subject_reminder_3,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
          <h2 style="color:#DC2626; margin-bottom: 12px;">Last-minute reminder</h2>
          <p>Hi Priya,</p>
          <p>Arjun's birthday is in 3 days.</p>
          <p>Open ${brand} now to get region-aware gift ideas quickly.</p>
          <a href="https://giftmind.in/gift-flow" style="display:inline-block; padding: 12px 18px; background:#111827; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">Find a gift now</a>
        </div>`,
    },
    welcome: {
      subject: settings.email_subject_welcome,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
          <h2 style="color:#D4A04A; margin-bottom: 12px;">Welcome to ${brand}</h2>
          <p>Hi Priya,</p>
          <p>You now have <strong>${settings.free_credits} free credits on Spark ✨ — no card needed</strong> to try AI gift recommendations.</p>
          <p>Add your first person, choose an occasion, and get 3 gift ideas with confidence scores.</p>
          <a href="https://giftmind.in/onboarding" style="display:inline-block; padding: 12px 18px; background:#D4A04A; color:#2B1F0F; text-decoration:none; border-radius:8px; font-weight:600;">Get started</a>
        </div>`,
    },
  } as const;

  return wrappers[template as keyof typeof wrappers] ?? wrappers.welcome;
}

function FeatureFlagRow({
  title,
  description,
  checked,
  saving,
  saved,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  saving?: boolean;
  saved?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {saved && <span className="text-xs font-medium text-emerald-600">✓ Saved</span>}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

const AdminSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [roleChecked, setRoleChecked] = useState(false);
  const queryClient = useQueryClient();
  const { settings, isLoading, isSaving, updateSetting, updateMultipleSettings, refresh } = usePlatformSettings(roleChecked);

  const [activeTab, setActiveTab] = useState<TabValue>(() => parseTabFromHash(window.location.hash));
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [resetAnalyticsOpen, setResetAnalyticsOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [maintenanceConfirmOpen, setMaintenanceConfirmOpen] = useState(false);
  const [pendingMaintenanceValue, setPendingMaintenanceValue] = useState<boolean | null>(null);
  const [monthlySessionsCount, setMonthlySessionsCount] = useState(1000);
  const [savedFeatureKey, setSavedFeatureKey] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [secretsStatus, setSecretsStatus] = useState<Record<string, boolean>>({});
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [maintenanceStats, setMaintenanceStats] = useState<Record<string, number>>({});
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState<string | null>(null);

  const rpc = supabase.rpc as (
    fn: AdminRpcName,
    args?: Record<string, never>,
  ) => Promise<{ error: { message: string } | null }>;

  const settingsWithDefaults: SettingsRecord = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...settings }),
    [settings],
  );

  const generalInitial = useMemo(() => ({
    site_name: asString(settingsWithDefaults.site_name, DEFAULT_SETTINGS.site_name),
    site_tagline: asString(settingsWithDefaults.site_tagline, DEFAULT_SETTINGS.site_tagline),
    support_email: asString(settingsWithDefaults.support_email, DEFAULT_SETTINGS.support_email),
    default_currency: asString(settingsWithDefaults.default_currency, DEFAULT_SETTINGS.default_currency),
    default_language: asString(settingsWithDefaults.default_language, DEFAULT_SETTINGS.default_language),
  }), [settingsWithDefaults]);
  const [generalForm, setGeneralForm] = useState(generalInitial);

  const aiInitial = useMemo(() => ({
    ai_model_free: asString(settingsWithDefaults.ai_model_free, DEFAULT_SETTINGS.ai_model_free),
    ai_model_pro: asString(settingsWithDefaults.ai_model_pro, DEFAULT_SETTINGS.ai_model_pro),
    ai_model_signal: asString(settingsWithDefaults.ai_model_signal, DEFAULT_SETTINGS.ai_model_signal),
    gift_session_cost: asNumber(settingsWithDefaults.gift_session_cost, DEFAULT_SETTINGS.gift_session_cost),
    signal_check_cost: asNumber(settingsWithDefaults.signal_check_cost, DEFAULT_SETTINGS.signal_check_cost),
    max_gift_sessions_per_hour: asNumber(settingsWithDefaults.max_gift_sessions_per_hour, DEFAULT_SETTINGS.max_gift_sessions_per_hour),
  }), [settingsWithDefaults]);
  const [aiForm, setAiForm] = useState(aiInitial);

  const creditsInitial = useMemo(() => ({
    free_credits: asNumber(settingsWithDefaults.free_credits, DEFAULT_SETTINGS.free_credits),
    free_credit_validity_days: asNumber(settingsWithDefaults.free_credit_validity_days, DEFAULT_SETTINGS.free_credit_validity_days),
    referral_bonus_referred: asNumber(settingsWithDefaults.referral_bonus_referred, DEFAULT_SETTINGS.referral_bonus_referred),
    referral_bonus_referrer: asNumber(settingsWithDefaults.referral_bonus_referrer, DEFAULT_SETTINGS.referral_bonus_referrer),
    referral_credit_validity_days: asNumber(settingsWithDefaults.referral_credit_validity_days, DEFAULT_SETTINGS.referral_credit_validity_days),
    max_referrals_per_user: asNumber(settingsWithDefaults.max_referrals_per_user, DEFAULT_SETTINGS.max_referrals_per_user),
  }), [settingsWithDefaults]);
  const [creditsForm, setCreditsForm] = useState(creditsInitial);

  const emailInitial = useMemo(() => ({
    email_from_name: asString(settingsWithDefaults.email_from_name, DEFAULT_SETTINGS.email_from_name),
    email_from_email: asString(settingsWithDefaults.email_from_email, DEFAULT_SETTINGS.email_from_email),
    email_reply_to: asString(settingsWithDefaults.email_reply_to, DEFAULT_SETTINGS.email_reply_to),
    email_subject_expiry_warning: asString(settingsWithDefaults.email_subject_expiry_warning, DEFAULT_SETTINGS.email_subject_expiry_warning),
    email_subject_reminder_14: asString(settingsWithDefaults.email_subject_reminder_14, DEFAULT_SETTINGS.email_subject_reminder_14),
    email_subject_reminder_3: asString(settingsWithDefaults.email_subject_reminder_3, DEFAULT_SETTINGS.email_subject_reminder_3),
    email_subject_welcome: asString(settingsWithDefaults.email_subject_welcome, DEFAULT_SETTINGS.email_subject_welcome),
  }), [settingsWithDefaults]);
  const [emailForm, setEmailForm] = useState(emailInitial);

  const featureInitial = useMemo(() => ({
    feature_signup_enabled: asBoolean(settingsWithDefaults.feature_signup_enabled ?? settingsWithDefaults.signup_enabled, true),
    feature_google_oauth: asBoolean(settingsWithDefaults.feature_google_oauth ?? settingsWithDefaults.google_oauth_enabled, true),
    feature_blog_enabled: asBoolean(settingsWithDefaults.feature_blog_enabled ?? settingsWithDefaults.blog_enabled, true),
    feature_signal_check: asBoolean(settingsWithDefaults.feature_signal_check, true),
    feature_cross_border_gifting: asBoolean(settingsWithDefaults.feature_cross_border_gifting, true),
    feature_occasion_reminders: asBoolean(settingsWithDefaults.feature_occasion_reminders, true),
    feature_credit_expiry_warnings: asBoolean(settingsWithDefaults.feature_credit_expiry_warnings, true),
    feature_posthog_enabled: asBoolean(settingsWithDefaults.feature_posthog_enabled ?? settingsWithDefaults.posthog_enabled, true),
    feature_cookie_consent_required: asBoolean(settingsWithDefaults.feature_cookie_consent_required ?? settingsWithDefaults.cookie_consent_required, true),
    maintenance_mode: asBoolean(settingsWithDefaults.maintenance_mode, false),
  }), [settingsWithDefaults]);
  const [featureFlags, setFeatureFlags] = useState(featureInitial);

  const securityInitial = useMemo(() => ({
    allowed_origins: asStringArray(settingsWithDefaults.allowed_origins, DEFAULT_SETTINGS.allowed_origins),
    max_gift_sessions_per_hour: asNumber(settingsWithDefaults.max_gift_sessions_per_hour, DEFAULT_SETTINGS.max_gift_sessions_per_hour),
    signal_checks_per_day: asNumber(settingsWithDefaults.signal_checks_per_day, DEFAULT_SETTINGS.signal_checks_per_day),
    product_clicks_per_hour: asNumber(settingsWithDefaults.product_clicks_per_hour, DEFAULT_SETTINGS.product_clicks_per_hour),
    referrals_per_hour: asNumber(settingsWithDefaults.referrals_per_hour, DEFAULT_SETTINGS.referrals_per_hour),
    blog_ai_generations_per_day: asNumber(settingsWithDefaults.blog_ai_generations_per_day, DEFAULT_SETTINGS.blog_ai_generations_per_day),
  }), [settingsWithDefaults]);
  const [securityForm, setSecurityForm] = useState(securityInitial);

  const [packageDrafts, setPackageDrafts] = useState<CreditPackageRow[]>([]);

  const { data: creditPackages = [], isLoading: packagesLoading } = useQuery({
    queryKey: ["admin-credit-packages-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as CreditPackageRow[];
    },
    enabled: roleChecked,
  });

  useEffect(() => {
    setPackageDrafts((creditPackages || []).map((pkg) => ({ ...pkg })));
  }, [creditPackages]);

  useEffect(() => setGeneralForm(generalInitial), [generalInitial]);
  useEffect(() => setAiForm(aiInitial), [aiInitial]);
  useEffect(() => setCreditsForm(creditsInitial), [creditsInitial]);
  useEffect(() => setEmailForm(emailInitial), [emailInitial]);
  useEffect(() => setFeatureFlags(featureInitial), [featureInitial]);
  useEffect(() => setSecurityForm(securityInitial), [securityInitial]);

  useEffect(() => {
    const nextTab = parseTabFromHash(location.hash);
    setActiveTab(nextTab);
  }, [location.hash]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;

    const checkRole = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (cancelled) return;

      if (error || data?.role !== "superadmin") {
        navigate("/dashboard", { replace: true });
        return;
      }

      setRoleChecked(true);
    };

    void checkRole();

    return () => {
      cancelled = true;
    };
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (!roleChecked || activeTab !== "security") return;
    void loadSecretStatus();
    void loadSecurityEvents();
  }, [roleChecked, activeTab]);

  useEffect(() => {
    if (!roleChecked || activeTab !== "maintenance") return;
    void refreshMaintenanceStats();
  }, [roleChecked, activeTab]);

  useEffect(() => {
    if (!savedFeatureKey) return;
    const timer = window.setTimeout(() => setSavedFeatureKey(null), 1800);
    return () => window.clearTimeout(timer);
  }, [savedFeatureKey]);

  const generalDirty = JSON.stringify(generalForm) !== JSON.stringify(generalInitial);
  const aiDirty = JSON.stringify(aiForm) !== JSON.stringify(aiInitial);
  const creditsDirty = JSON.stringify(creditsForm) !== JSON.stringify(creditsInitial);
  const emailDirty = JSON.stringify(emailForm) !== JSON.stringify(emailInitial);
  const securityDirty = JSON.stringify(securityForm) !== JSON.stringify(securityInitial);
  const packagesDirty = JSON.stringify(packageDrafts) !== JSON.stringify(creditPackages || []);

  const hasUnsavedChanges = generalDirty || aiDirty || creditsDirty || emailDirty || securityDirty || packagesDirty;

  const monthlyFreeCost = monthlySessionsCount * 0.8 * 0.003;
  const monthlyProCost = monthlySessionsCount * 0.2 * 0.035;
  const monthlySignalCost = monthlySessionsCount * 0.15 * 0.01;
  const monthlyTotalCost = monthlyFreeCost + monthlyProCost + monthlySignalCost;

  async function loadSecretStatus() {
    const response = await supabase.functions.invoke("check-secrets", { body: {} });
    if (!response.error && response.data) {
      setSecretsStatus(response.data);
    }
  }

  async function loadSecurityEvents() {
    try {
      const { data: grants } = await supabase
        .from("credit_transactions")
        .select("id, created_at, amount, user_id")
        .eq("type", "admin_grant")
        .order("created_at", { ascending: false })
        .limit(10);

      const { data: elevatedUsers } = await supabase
        .from("users")
        .select("id, email, role, updated_at")
        .in("role", ["admin", "superadmin"])
        .order("updated_at", { ascending: false })
        .limit(10);

      const typedGrants = (grants || []) as CreditGrantRow[];
      const typedElevatedUsers = (elevatedUsers || []) as ElevatedUserRow[];
      const userIds = Array.from(new Set(typedGrants.map((grant) => grant.user_id).filter(Boolean)));

      let userRows: UserEmailRow[] = [];
      if (userIds.length > 0) {
        const { data } = await supabase.from("users").select("id, email").in("id", userIds);
        userRows = (data || []) as UserEmailRow[];
      }

      const emailMap = Object.fromEntries(userRows.map((row) => [row.id, row.email]));

      const events: SecurityEvent[] = [
        ...typedGrants.map((grant) => ({
          id: `grant-${grant.id}`,
          date: grant.created_at,
          event: "Credits granted",
          user: emailMap[grant.user_id] || "Unknown user",
          details: `+${grant.amount} credits`,
        })),
        ...typedElevatedUsers.map((row) => ({
          id: `role-${row.id}-${row.updated_at}`,
          date: row.updated_at,
          event: "Elevated role",
          user: row.email,
          details: `Current role: ${row.role}`,
        })),
      ]
        .filter((event) => !!event.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);

      setSecurityEvents(events);
    } catch (error: unknown) {
      console.error("Failed to load security events", error);
    }
  }

  async function refreshMaintenanceStats() {
    setMaintenanceLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [
        usersRes,
        activeUsersRes,
        sessionsRes,
        txRes,
        clicksRes,
        blogRes,
        marketplaceRes,
      ] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("users").select("id", { count: "exact", head: true }).gte("last_active_at", sevenDaysAgo),
        supabase.from("gift_sessions").select("id", { count: "exact", head: true }),
        supabase.from("credit_transactions").select("id", { count: "exact", head: true }),
        supabase.from("product_clicks").select("id", { count: "exact", head: true }),
        supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("marketplace_config").select("id", { count: "exact", head: true }),
      ]);

      setMaintenanceStats({
        users: usersRes.count || 0,
        activeUsers: activeUsersRes.count || 0,
        sessions: sessionsRes.count || 0,
        transactions: txRes.count || 0,
        clicks: clicksRes.count || 0,
        posts: blogRes.count || 0,
        marketplaces: marketplaceRes.count || 0,
      });
    } finally {
      setMaintenanceLoading(false);
    }
  }

  function discardDrafts() {
    setGeneralForm(generalInitial);
    setAiForm(aiInitial);
    setCreditsForm(creditsInitial);
    setEmailForm(emailInitial);
    setSecurityForm(securityInitial);
    setFeatureFlags(featureInitial);
    setPackageDrafts((creditPackages || []).map((pkg) => ({ ...pkg })));
  }

  function handleTabChange(nextTab: string) {
    if (nextTab === activeTab) return;
    if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Discard?")) {
      return;
    }
    if (hasUnsavedChanges) {
      discardDrafts();
    }
    navigate({ hash: `#${nextTab}` }, { replace: true });
  }

  async function handleSaveGeneral() {
    const { error } = await updateMultipleSettings(generalForm);
    if (error) {
      toast.error("Failed to save settings");
      return;
    }
    toast.success("✓ Settings saved");
  }

  async function handleSaveAi() {
    const { error } = await updateMultipleSettings(aiForm);
    if (error) {
      toast.error("Failed to save settings");
      return;
    }
    toast.success("✓ Settings saved");
  }

  async function handleSaveCredits() {
    const { error } = await updateMultipleSettings(creditsForm);
    if (error) {
      toast.error("Failed to save settings");
      return;
    }
    toast.success("✓ Settings saved");
  }

  async function handleSaveEmail() {
    const { error } = await updateMultipleSettings(emailForm);
    if (error) {
      toast.error("Failed to save settings");
      return;
    }
    toast.success("✓ Settings saved");
  }

  async function handleSaveSecurity() {
    const updates = {
      allowed_origins: securityForm.allowed_origins.filter(Boolean),
      max_gift_sessions_per_hour: securityForm.max_gift_sessions_per_hour,
      signal_checks_per_day: securityForm.signal_checks_per_day,
      product_clicks_per_hour: securityForm.product_clicks_per_hour,
      referrals_per_hour: securityForm.referrals_per_hour,
      blog_ai_generations_per_day: securityForm.blog_ai_generations_per_day,
    };
    const { error } = await updateMultipleSettings(updates);
    if (error) {
      toast.error("Failed to save settings");
      return;
    }
    toast.success("✓ Settings saved");
  }

  async function handleSavePackage(pkg: CreditPackageRow) {
    const { error } = await supabase
      .from("credit_packages")
      .update({
        credits: pkg.credits,
        price_inr: pkg.price_inr,
        price_usd: pkg.price_usd,
        price_eur: pkg.price_eur,
        price_gbp: pkg.price_gbp,
        price_aed: pkg.price_aed,
        price_cad: pkg.price_cad,
        price_aud: pkg.price_aud,
        price_sgd: pkg.price_sgd,
        validity_days: pkg.validity_days,
        max_recipients: pkg.max_recipients,
        max_regenerations: pkg.max_regenerations,
        stores_level: pkg.stores_level,
        has_signal_check: pkg.has_signal_check,
        has_batch_mode: pkg.has_batch_mode,
        has_priority_ai: pkg.has_priority_ai,
        has_history_export: pkg.has_history_export,
        badge: pkg.badge,
      })
      .eq("id", pkg.id);

    if (error) {
      toast.error("Failed to save package");
      return;
    }

    toast.success(`${pkg.name} saved`);
    await queryClient.invalidateQueries({ queryKey: ["admin-credit-packages-settings"] });
  }

  async function handleFeatureToggle(key: keyof typeof featureFlags, value: boolean) {
    if (key === "maintenance_mode" && value) {
      setPendingMaintenanceValue(true);
      setMaintenanceConfirmOpen(true);
      return;
    }

    setFeatureFlags((prev) => ({ ...prev, [key]: value }));
    const { error } = await updateSetting(key, value);
    if (error) {
      setFeatureFlags((prev) => ({ ...prev, [key]: !value }));
      toast.error("Failed to save setting");
      return;
    }
    setSavedFeatureKey(key);
  }

  async function confirmMaintenanceToggle() {
    const value = pendingMaintenanceValue ?? true;
    setFeatureFlags((prev) => ({ ...prev, maintenance_mode: value }));
    setMaintenanceConfirmOpen(false);
    setPendingMaintenanceValue(null);
    const { error } = await updateSetting("maintenance_mode", value);
    if (error) {
      setFeatureFlags((prev) => ({ ...prev, maintenance_mode: false }));
      toast.error("Failed to save setting");
      return;
    }
    setSavedFeatureKey("maintenance_mode");
  }

  async function sendTestEmail(template: string) {
    if (!user?.email) return;
    setSendingTemplate(template);
    const response = await supabase.functions.invoke("send-test-email", {
      body: { template, to: user.email },
    });
    setSendingTemplate(null);
    if (response.error || response.data?.error) {
      toast.error("Failed to send test email");
      return;
    }
    toast.success("Test email sent");
  }

  async function runMaintenanceAction(key: string, action: () => Promise<void>) {
    setRunningAction(key);
    try {
      await action();
    } finally {
      setRunningAction(null);
    }
  }

  async function handleRunCreditExpiry() {
    await runMaintenanceAction("credit-expiry", async () => {
      const { error } = await rpc("run_credit_expiry");
      if (error) {
        toast.error("Failed to run credit expiry check");
        return;
      }
      await updateSetting("maintenance_last_credit_expiry_run", new Date().toISOString());
      toast.success("Credit expiry check completed");
      await refreshMaintenanceStats();
    });
  }

  async function handleRecalculateBalances() {
    await runMaintenanceAction("recalculate", async () => {
      const { error } = await rpc("recalculate_all_balances");
      if (error) {
        toast.error("Failed to recalculate balances");
        return;
      }
      await updateSetting("maintenance_last_recalculate_run", new Date().toISOString());
      toast.success("Balances recalculated");
      await refreshMaintenanceStats();
    });
  }

  async function handleClearExpiredBatches() {
    await runMaintenanceAction("clear-expired", async () => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("credit_batches")
        .update({ is_expired: true })
        .lt("expires_at", now)
        .eq("is_expired", false);
      if (error) {
        toast.error("Failed to clear expired batches");
        return;
      }
      await rpc("recalculate_all_balances");
      await updateSetting("maintenance_last_expired_batch_clear_run", new Date().toISOString());
      toast.success("Expired batches updated");
      await refreshMaintenanceStats();
    });
  }

  async function handlePurgeAbandonedSessions() {
    if (!window.confirm("Delete abandoned sessions older than 30 days? This cannot be undone.")) {
      return;
    }

    await runMaintenanceAction("purge-abandoned", async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("gift_sessions")
        .delete()
        .eq("status", "abandoned")
        .lt("created_at", cutoff);
      if (error) {
        toast.error("Failed to purge abandoned sessions");
        return;
      }
      toast.success("Abandoned sessions purged");
      await refreshMaintenanceStats();
    });
  }

  async function handleResetAnalytics() {
    await runMaintenanceAction("reset-analytics", async () => {
      const { error } = await supabase
        .from("blog_posts")
        .update({ view_count: 0, cta_click_count: 0 })
        .not("id", "is", null);
      if (error) {
        toast.error("Failed to reset analytics counters");
        return;
      }
      setResetAnalyticsOpen(false);
      setResetConfirm("");
      toast.success("Analytics counters reset");
      await refreshMaintenanceStats();
    });
  }

  if (authLoading || !roleChecked || isLoading) {
    return (
      <div className="space-y-6">
        <SEOHead title="Admin Settings - GiftMind" description="Platform settings" noIndex={true} />
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
      </div>
    );
  }

  const preview = buildTemplatePreview(previewTemplate || "welcome", {
    ...settingsWithDefaults,
    ...emailForm,
  } as SettingsRecord);

  return (
    <div className="space-y-6">
      <SEOHead title="Admin Settings - GiftMind" description="Platform settings" noIndex={true} />

      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">⚙️ Platform Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure GiftMind's global settings. Changes take effect immediately.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex h-auto min-w-max gap-1 bg-muted/70 p-1">
            {TAB_CONFIG.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2 px-4 py-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="site_name">Site Name</Label>
                <Input id="site_name" value={generalForm.site_name} onChange={(e) => setGeneralForm((prev) => ({ ...prev, site_name: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Displayed in navbar, emails, and browser title.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="site_tagline">Tagline</Label>
                <Input id="site_tagline" value={generalForm.site_tagline} onChange={(e) => setGeneralForm((prev) => ({ ...prev, site_tagline: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Shown on landing page hero section.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="support_email">Support Email</Label>
                <Input id="support_email" type="email" value={generalForm.support_email} onChange={(e) => setGeneralForm((prev) => ({ ...prev, support_email: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Public contact email for user inquiries.</p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default Language</Label>
                  <Select value={generalForm.default_language} onValueChange={(value) => setGeneralForm((prev) => ({ ...prev, default_language: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Only English is supported currently.</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveGeneral} disabled={!generalDirty || isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save General Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Model Selection</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {AI_MODEL_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2 rounded-lg border p-4">
                      <Label>{field.label}</Label>
                      <Select value={aiForm[field.key]} onValueChange={(value) => setAiForm((prev) => ({ ...prev, [field.key]: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MODEL_OPTIONS.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{field.note}</p>
                      <p className="text-xs text-muted-foreground">{field.cost}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Credits per gift session</Label>
                  <Input type="number" min="0" step="0.1" value={aiForm.gift_session_cost} onChange={(e) => setAiForm((prev) => ({ ...prev, gift_session_cost: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">How many credits are deducted per session.</p>
                </div>
                <div className="space-y-2">
                  <Label>Credits per Signal Check</Label>
                  <Input type="number" min="0" max="1" step="0.1" value={aiForm.signal_check_cost} onChange={(e) => setAiForm((prev) => ({ ...prev, signal_check_cost: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Must be less than 1. Decimal allowed.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Max gift sessions per hour (per user)</Label>
                <Input type="number" min="1" value={aiForm.max_gift_sessions_per_hour} onChange={(e) => setAiForm((prev) => ({ ...prev, max_gift_sessions_per_hour: Number(e.target.value) }))} />
                <p className="text-xs text-muted-foreground">Prevents abuse. Recommended: 10-20.</p>
              </div>

              <Card className="border-dashed bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-base">📊 Monthly AI Cost Estimate</CardTitle>
                  <CardDescription>Adjust monthly session volume to recalculate in real time.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>Spark/Thoughtful/Confident sessions (80%): <strong>{Math.round(monthlySessionsCount * 0.8)}</strong> × $0.003 = <strong>{formatCurrencyAmount(monthlyFreeCost)}</strong></div>
                    <div>Gifting Pro sessions (20%): <strong>{Math.round(monthlySessionsCount * 0.2)}</strong> × $0.035 = <strong>{formatCurrencyAmount(monthlyProCost)}</strong></div>
                    <div>Signal Checks (15% of sessions): <strong>{Math.round(monthlySessionsCount * 0.15)}</strong> × $0.010 = <strong>{formatCurrencyAmount(monthlySignalCost)}</strong></div>
                    <div className="font-semibold text-foreground">Estimated total: {formatCurrencyAmount(monthlyTotalCost)}/month</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly sessions</Label>
                    <Input type="number" min="0" value={monthlySessionsCount} onChange={(e) => setMonthlySessionsCount(Number(e.target.value) || 0)} />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSaveAi} disabled={!aiDirty || isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save AI Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits-plans" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Credits & Plans</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Free credits on signup</Label>
                  <Input type="number" min="0" value={creditsForm.free_credits} onChange={(e) => setCreditsForm((prev) => ({ ...prev, free_credits: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Credits given to every new user. Changes affect new signups only.</p>
                </div>
                <div className="space-y-2">
                  <Label>Free credit validity (days)</Label>
                  <Input type="number" min="1" value={creditsForm.free_credit_validity_days} onChange={(e) => setCreditsForm((prev) => ({ ...prev, free_credit_validity_days: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">How many days before free credits expire.</p>
                </div>
                <div className="space-y-2">
                  <Label>Bonus credits for referred user</Label>
                  <Input type="number" min="0" value={creditsForm.referral_bonus_referred} onChange={(e) => setCreditsForm((prev) => ({ ...prev, referral_bonus_referred: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Extra credits on top of free_credits.</p>
                </div>
                <div className="space-y-2">
                  <Label>Reward credits for referrer</Label>
                  <Input type="number" min="0" value={creditsForm.referral_bonus_referrer} onChange={(e) => setCreditsForm((prev) => ({ ...prev, referral_bonus_referrer: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Awarded when referred user completes first session.</p>
                </div>
                <div className="space-y-2">
                  <Label>Referral credit validity (days)</Label>
                  <Input type="number" min="1" value={creditsForm.referral_credit_validity_days} onChange={(e) => setCreditsForm((prev) => ({ ...prev, referral_credit_validity_days: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Validity of referral bonus credits.</p>
                </div>
                <div className="space-y-2">
                  <Label>Max referrals per user</Label>
                  <Input type="number" min="1" value={creditsForm.max_referrals_per_user} onChange={(e) => setCreditsForm((prev) => ({ ...prev, max_referrals_per_user: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Cap on how many friends one user can refer.</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveCredits} disabled={!creditsDirty || isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Credit Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan Configuration</CardTitle>
              <CardDescription>Changing prices affects new purchases only. Existing batches keep original terms.</CardDescription>
            </CardHeader>
            <CardContent>
              {packagesLoading ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  {[1, 2, 3].map((item) => <Skeleton key={item} className="h-[520px] rounded-xl" />)}
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  {packageDrafts.map((pkg, index) => {
                    const original = creditPackages[index];
                    const dirty = JSON.stringify(pkg) !== JSON.stringify(original);
                    return (
                      <Card key={pkg.id} className="border-border/60">
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between text-lg">
                            <span>{pkg.name}</span>
                            {pkg.badge ? <Badge>{pkg.badge}</Badge> : null}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {PACKAGE_NUMERIC_FIELDS.map(({ label, field }) => (
                            <div key={field} className="space-y-1">
                              <Label>{label}</Label>
                              <Input
                                type="number"
                                value={pkg[field] ?? 0}
                                onChange={(e) => setPackageDrafts((prev) => prev.map((row) => row.id === pkg.id ? { ...row, [field]: Number(e.target.value) } : row))}
                              />
                            </div>
                          ))}

                          <div className="space-y-1">
                            <Label>Stores</Label>
                            <Select value={pkg.stores_level || "basic"} onValueChange={(value) => setPackageDrafts((prev) => prev.map((row) => row.id === pkg.id ? { ...row, stores_level: value } : row))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STORE_LEVEL_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-1">
                            {PACKAGE_BOOLEAN_FIELDS.map(({ label, field }) => (
                              <div key={field} className="flex items-center justify-between rounded-md border p-2 text-sm">
                                <span>{label}</span>
                                <Switch checked={Boolean(pkg[field])} onCheckedChange={(checked) => setPackageDrafts((prev) => prev.map((row) => row.id === pkg.id ? { ...row, [field]: checked } : row))} />
                              </div>
                            ))}
                          </div>

                          <div className="space-y-1">
                            <Label>Badge</Label>
                            <Input value={pkg.badge || ""} onChange={(e) => setPackageDrafts((prev) => prev.map((row) => row.id === pkg.id ? { ...row, badge: e.target.value } : row))} />
                          </div>

                          <Button className="w-full" disabled={!dirty} onClick={() => handleSavePackage(pkg)}>
                            Save
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">-1 means unlimited.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>From name</Label>
                  <Input value={emailForm.email_from_name} onChange={(e) => setEmailForm((prev) => ({ ...prev, email_from_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>From email</Label>
                  <Input type="email" value={emailForm.email_from_email} onChange={(e) => setEmailForm((prev) => ({ ...prev, email_from_email: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Must match your Resend verified domain.</p>
                </div>
                <div className="space-y-2">
                  <Label>Reply-to email</Label>
                  <Input type="email" value={emailForm.email_reply_to} onChange={(e) => setEmailForm((prev) => ({ ...prev, email_reply_to: e.target.value }))} />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                {[
                  ["expiry_warning", "Credit Expiry Warning", emailForm.email_subject_expiry_warning],
                  ["reminder_14", "Occasion Reminder (14-day)", emailForm.email_subject_reminder_14],
                  ["reminder_3", "Occasion Reminder (3-day)", emailForm.email_subject_reminder_3],
                  ["welcome", "Welcome Email", emailForm.email_subject_welcome],
                ].map(([key, label, subject]) => (
                  <div key={key} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Subject: {subject}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setPreviewTemplate(String(key))}>Preview</Button>
                        <Button variant="outline" onClick={() => sendTestEmail(String(key))} disabled={sendingTemplate === key}>
                          {sendingTemplate === key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Send Test Email
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveEmail} disabled={!emailDirty || isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Email Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feature-flags" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Toggle features on or off instantly. Feature flags save automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeatureFlagRow title="Allow new signups" description="When OFF, signup page should show registrations paused." checked={featureFlags.feature_signup_enabled} saved={savedFeatureKey === "feature_signup_enabled"} onChange={(checked) => handleFeatureToggle("feature_signup_enabled", checked)} />
              <FeatureFlagRow title="Google OAuth login" description="When OFF, only email/password login is available." checked={featureFlags.feature_google_oauth} saved={savedFeatureKey === "feature_google_oauth"} onChange={(checked) => handleFeatureToggle("feature_google_oauth", checked)} />
              <FeatureFlagRow title="Public blog" description="When OFF, /blog should be hidden from users." checked={featureFlags.feature_blog_enabled} saved={savedFeatureKey === "feature_blog_enabled"} onChange={(checked) => handleFeatureToggle("feature_blog_enabled", checked)} />
              <FeatureFlagRow title="Signal Check" description="When OFF, Signal Check is hidden for all plans." checked={featureFlags.feature_signal_check} saved={savedFeatureKey === "feature_signal_check"} onChange={(checked) => handleFeatureToggle("feature_signal_check", checked)} />
              <FeatureFlagRow title="Cross-border gifting" description="When OFF, recipient location controls should be hidden." checked={featureFlags.feature_cross_border_gifting} saved={savedFeatureKey === "feature_cross_border_gifting"} onChange={(checked) => handleFeatureToggle("feature_cross_border_gifting", checked)} />
              <FeatureFlagRow title="Occasion reminders (email)" description="When OFF, cron job should skip reminder emails." checked={featureFlags.feature_occasion_reminders} saved={savedFeatureKey === "feature_occasion_reminders"} onChange={(checked) => handleFeatureToggle("feature_occasion_reminders", checked)} />
              <FeatureFlagRow title="Credit expiry warnings (email)" description="When OFF, cron job should skip expiry warning emails." checked={featureFlags.feature_credit_expiry_warnings} saved={savedFeatureKey === "feature_credit_expiry_warnings"} onChange={(checked) => handleFeatureToggle("feature_credit_expiry_warnings", checked)} />
              <FeatureFlagRow title="Posthog analytics" description="When OFF, Posthog should not initialize." checked={featureFlags.feature_posthog_enabled} saved={savedFeatureKey === "feature_posthog_enabled"} onChange={(checked) => handleFeatureToggle("feature_posthog_enabled", checked)} />
              <FeatureFlagRow title="Cookie consent required" description="When OFF, analytics load without asking. Not recommended for compliance." checked={featureFlags.feature_cookie_consent_required} saved={savedFeatureKey === "feature_cookie_consent_required"} onChange={(checked) => handleFeatureToggle("feature_cookie_consent_required", checked)} />
              <FeatureFlagRow title="🚧 Maintenance mode" description="When ON, all non-admin pages should show maintenance mode." checked={featureFlags.maintenance_mode} saved={savedFeatureKey === "maintenance_mode"} onChange={(checked) => handleFeatureToggle("maintenance_mode", checked)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground">API Keys Status</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Anthropic API Key", Boolean(secretsStatus.anthropic)],
                    ["Resend API Key", Boolean(secretsStatus.resend)],
                    ["Cron Secret", Boolean(secretsStatus.cron)],
                    ["PayPal Client ID", Boolean(import.meta.env.VITE_PAYPAL_CLIENT_ID) || Boolean(secretsStatus.paypal)],
                    ["Razorpay Key ID", Boolean(import.meta.env.VITE_RAZORPAY_KEY_ID) || Boolean(secretsStatus.razorpay)],
                    ["Posthog API Key", Boolean(import.meta.env.VITE_POSTHOG_API_KEY)],
                    ["Sentry DSN", Boolean(import.meta.env.VITE_SENTRY_DSN)],
                  ].map(([label, connected]) => (
                    <div key={String(label)} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                      <span>{label}</span>
                      <span className={connected ? "text-emerald-600" : "text-muted-foreground"}>
                        {connected ? "● Connected" : "○ Not configured"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">API keys are set via Supabase secrets or env files and cannot be edited from this dashboard.</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">CORS Configuration</h3>
                {securityForm.allowed_origins.map((origin, index) => (
                  <div key={`${origin}-${index}`} className="flex gap-2">
                    <Input value={origin} onChange={(e) => setSecurityForm((prev) => ({ ...prev, allowed_origins: prev.allowed_origins.map((item, idx) => idx === index ? e.target.value : item) }))} />
                    <Button variant="outline" onClick={() => setSecurityForm((prev) => ({ ...prev, allowed_origins: prev.allowed_origins.filter((_, idx) => idx !== index) }))}>Remove</Button>
                  </div>
                ))}
                <Button variant="outline" onClick={() => setSecurityForm((prev) => ({ ...prev, allowed_origins: [...prev.allowed_origins, ""] }))}>+ Add origin</Button>
                <p className="text-xs text-muted-foreground">Currently development still allows all origins in edge functions. Restrict this for production.</p>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {SECURITY_LIMIT_FIELDS.map(({ label, field }) => (
                  <div key={field} className="space-y-2">
                    <Label>{label}</Label>
                    <Input type="number" min="0" value={securityForm[field]} onChange={(e) => setSecurityForm((prev) => ({ ...prev, [field]: Number(e.target.value) }))} />
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Recent Security Events</h3>
                  <Button variant="outline" size="sm" onClick={() => loadSecurityEvents()}>Refresh</Button>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {securityEvents.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No notable events available.</TableCell></TableRow>
                      ) : securityEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>{new Date(event.date).toLocaleString()}</TableCell>
                          <TableCell>{event.event}</TableCell>
                          <TableCell>{event.user}</TableCell>
                          <TableCell>{event.details}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveSecurity} disabled={!securityDirty || isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Security Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Maintenance Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Database Health</h3>
                  <Button variant="outline" size="sm" onClick={() => refreshMaintenanceStats()} disabled={maintenanceLoading}>
                    {maintenanceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh Stats
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Total users", maintenanceStats.users],
                    ["Active users (7 days)", maintenanceStats.activeUsers],
                    ["Total gift sessions", maintenanceStats.sessions],
                    ["Total credit transactions", maintenanceStats.transactions],
                    ["Total product clicks", maintenanceStats.clicks],
                    ["Blog posts (published)", maintenanceStats.posts],
                    ["Marketplace stores", maintenanceStats.marketplaces],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{maintenanceLoading ? "..." : Number(value || 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Run Credit Expiry Check</CardTitle>
                    <CardDescription>Normally runs daily via cron.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Last run: {formatTimestamp(asString(settingsWithDefaults.maintenance_last_credit_expiry_run, ""))}</p>
                    <Button className="w-full" onClick={handleRunCreditExpiry} disabled={runningAction === "credit-expiry"}>
                      {runningAction === "credit-expiry" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run Now
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recalculate All User Balances</CardTitle>
                    <CardDescription>Touches every user record. Use sparingly.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Last run: {formatTimestamp(asString(settingsWithDefaults.maintenance_last_recalculate_run, ""))}</p>
                    <Button className="w-full" onClick={handleRecalculateBalances} disabled={runningAction === "recalculate"}>
                      {runningAction === "recalculate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run Now
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Clear Expired Credit Batches</CardTitle>
                    <CardDescription>Marks expired batches and refreshes balances.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Last run: {formatTimestamp(asString(settingsWithDefaults.maintenance_last_expired_batch_clear_run, ""))}</p>
                    <Button className="w-full" onClick={handleClearExpiredBatches} disabled={runningAction === "clear-expired"}>
                      {runningAction === "clear-expired" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run Now
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              <div className="space-y-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Danger Zone</h3>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Purge abandoned sessions</CardTitle>
                      <CardDescription>Deletes sessions with status='abandoned' older than 30 days.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="destructive" onClick={handlePurgeAbandonedSessions} disabled={runningAction === "purge-abandoned"}>
                        {runningAction === "purge-abandoned" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Purge
                      </Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Reset analytics counters</CardTitle>
                      <CardDescription>Resets blog view_count and cta_click_count to 0.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="destructive" onClick={() => setResetAnalyticsOpen(true)}>Reset</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(previewTemplate)} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>{preview.subject}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto rounded-lg border bg-white p-6">
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={maintenanceConfirmOpen} onOpenChange={setMaintenanceConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable maintenance mode?</AlertDialogTitle>
            <AlertDialogDescription>
              This will block all non-admin users from accessing GiftMind. Only admins will be able to use the site.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setMaintenanceConfirmOpen(false); setPendingMaintenanceValue(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMaintenanceToggle}>Enable Maintenance Mode</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetAnalyticsOpen} onOpenChange={setResetAnalyticsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset analytics counters</DialogTitle>
            <DialogDescription>Type RESET to confirm. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Confirmation</Label>
            <Input id="reset-confirm" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="RESET" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetAnalyticsOpen(false); setResetConfirm(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleResetAnalytics} disabled={resetConfirm !== "RESET" || runningAction === "reset-analytics"}>
              {runningAction === "reset-analytics" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reset Analytics
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSettings;
