import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import AdminGuard from "@/components/admin/AdminGuard";
import CookieConsent from "@/components/CookieConsent";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";
import { InstallPrompt } from "@/components/common/InstallPrompt";
import PageLoader from "@/components/common/PageLoader";
import { initPosthog } from "@/lib/posthog";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const MyPeople = lazy(() => import("./pages/MyPeople"));
const GiftFlow = lazy(() => import("./pages/GiftFlow"));
const GiftHistory = lazy(() => import("./pages/GiftHistory"));
const Credits = lazy(() => import("./pages/Credits"));
const Plans = lazy(() => import("./pages/Plans"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const BlogListing = lazy(() => import("./pages/BlogListing"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const BlogCategory = lazy(() => import("./pages/BlogCategory"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const AdminOverview = lazy(() => import("@/pages/admin/AdminOverview"));
const AdminPlaceholder = lazy(() => import("@/pages/admin/AdminPlaceholder"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminCredits = lazy(() => import("@/pages/admin/AdminCredits"));
const AdminGiftAnalytics = lazy(() => import("@/pages/admin/AdminGiftAnalytics"));
const AdminBlogPosts = lazy(() => import("@/pages/admin/AdminBlogPosts"));
const AdminBlogCategories = lazy(() => import("@/pages/admin/AdminBlogCategories"));
const AdminMediaLibrary = lazy(() => import("@/pages/admin/AdminMediaLibrary"));
const AdminBlogAnalytics = lazy(() => import("@/pages/admin/AdminBlogAnalytics"));
const AdminBlogEditor = lazy(() => import("@/pages/admin/AdminBlogEditor"));
const AdminMarketplaces = lazy(() => import("@/pages/admin/AdminMarketplaces"));
const AdminAuditLog = lazy(() => import("@/pages/admin/AdminAuditLog"));

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    initPosthog();
  }, []);

  const routeWithLoader = (element: ReactNode) => (
    <Suspense fallback={<PageLoader />}>{element}</Suspense>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <AppErrorBoundary>
              <Routes>
                <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
              <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
              <Route path="/my-people" element={routeWithLoader(<AuthGuard><MyPeople /></AuthGuard>)} />
              <Route path="/my-people/:recipientId" element={routeWithLoader(<AuthGuard><MyPeople /></AuthGuard>)} />
              <Route path="/gift-flow" element={routeWithLoader(<AuthGuard><GiftFlow /></AuthGuard>)} />
              <Route path="/gift-history" element={routeWithLoader(<AuthGuard><GiftHistory /></AuthGuard>)} />
              <Route path="/credits" element={routeWithLoader(<AuthGuard><Credits /></AuthGuard>)} />
              <Route path="/plans" element={routeWithLoader(<AuthGuard><Plans /></AuthGuard>)} />
              <Route path="/profile" element={routeWithLoader(<AuthGuard><Profile /></AuthGuard>)} />
              <Route path="/settings" element={routeWithLoader(<AuthGuard><Settings /></AuthGuard>)} />
              <Route path="/blog" element={routeWithLoader(<BlogListing />)} />
              <Route path="/blog/:slug" element={routeWithLoader(<BlogPost />)} />
              <Route path="/blog/category/:slug" element={routeWithLoader(<BlogCategory />)} />
              <Route path="/privacy-policy" element={routeWithLoader(<PrivacyPolicy />)} />
              <Route path="/terms" element={routeWithLoader(<TermsOfService />)} />
              <Route path="/refund-policy" element={routeWithLoader(<RefundPolicy />)} />
              <Route
                path="/admin"
                element={routeWithLoader(<AuthGuard><AdminGuard><AdminLayout><AdminOverview /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/users"
                element={routeWithLoader(<AuthGuard><AdminGuard><AdminLayout><AdminUsers /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/credits"
                element={routeWithLoader(<AuthGuard><AdminGuard><AdminLayout><AdminCredits /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/gifts"
                element={routeWithLoader(<AuthGuard><AdminGuard><AdminLayout><AdminGiftAnalytics /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/blog"
                element={routeWithLoader(<AuthGuard><AdminGuard requiredRole="admin"><AdminLayout><AdminBlogPosts /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/blog/new"
                element={routeWithLoader(<AuthGuard><AdminGuard requiredRole="admin"><AdminLayout><AdminBlogEditor /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/blog/edit/:id"
                element={routeWithLoader(<AuthGuard><AdminGuard requiredRole="admin"><AdminLayout><AdminBlogEditor /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/blog/categories"
                element={routeWithLoader(<AuthGuard><AdminGuard requiredRole="admin"><AdminLayout><AdminBlogCategories /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/media"
                element={routeWithLoader(<AuthGuard><AdminGuard requiredRole="admin"><AdminLayout><AdminMediaLibrary /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/blog/analytics"
                element={routeWithLoader(<AuthGuard><AdminGuard><AdminLayout><AdminBlogAnalytics /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/marketplaces"
                element={routeWithLoader(<AuthGuard><AdminGuard requiredRole="admin"><AdminLayout><AdminMarketplaces /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/audit-log"
                element={routeWithLoader(<AuthGuard><AdminGuard><AdminLayout><AdminAuditLog /></AdminLayout></AdminGuard></AuthGuard>)}
              />
              <Route
                path="/admin/settings"
                element={routeWithLoader(<AuthGuard><AdminGuard requiredRole="superadmin"><AdminLayout><AdminSettings /></AdminLayout></AdminGuard></AuthGuard>)}
              />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppErrorBoundary>
            <InstallPrompt />
            <CookieConsent />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
