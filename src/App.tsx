import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import MyPeople from "./pages/MyPeople";
import GiftFlow from "./pages/GiftFlow";
import GiftHistory from "./pages/GiftHistory";
import Credits from "./pages/Credits";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AdminGuard from "@/components/admin/AdminGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminPlaceholder from "@/pages/admin/AdminPlaceholder";
import AdminUsers from "@/pages/admin/AdminUsers";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/my-people" element={<AuthGuard><MyPeople /></AuthGuard>} />
            <Route path="/gift-flow" element={<AuthGuard><GiftFlow /></AuthGuard>} />
            <Route path="/gift-history" element={<AuthGuard><GiftHistory /></AuthGuard>} />
            <Route path="/credits" element={<AuthGuard><Credits /></AuthGuard>} />
            <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
            <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
            {/* Admin routes */}
            <Route path="/admin" element={<AuthGuard><AdminGuard><AdminLayout><AdminOverview /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/users" element={<AuthGuard><AdminGuard><AdminLayout><AdminUsers /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/credits" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/gifts" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/blog" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/blog/new" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/blog/categories" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/media" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/blog/analytics" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/marketplaces" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="/admin/settings" element={<AuthGuard><AdminGuard><AdminLayout><AdminPlaceholder /></AdminLayout></AdminGuard></AuthGuard>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
