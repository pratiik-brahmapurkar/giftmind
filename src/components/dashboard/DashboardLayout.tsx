import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import {
  Gift,
  LayoutDashboard,
  Users,
  History,
  Coins,
  LogOut,
  User,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Link2,
  FileText,
  HelpCircle,
  MoreHorizontal,
  Home,
  ShoppingBag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/* ── Sidebar nav items ── */
const sidebarItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "My People", path: "/my-people", icon: Users },
  { label: "Find a Gift", path: "/gift-flow", icon: Gift, accent: true },
  { label: "Gift History", path: "/gift-history", icon: History },
  { label: "Credits", path: "/credits", icon: Coins },
  { label: "Refer a Friend", path: "/settings", icon: Link2 },
];

const sidebarSecondary = [
  { label: "Blog", path: "/blog", icon: FileText, external: true },
  { label: "Settings", path: "/settings", icon: Settings },
];

/* ── Mobile bottom nav ── */
const bottomNavItems = [
  { label: "Home", path: "/dashboard", icon: Home },
  { label: "People", path: "/my-people", icon: Users },
  { label: "Gift", path: "/gift-flow", icon: Gift, center: true },
  { label: "History", path: "/gift-history", icon: History },
  { label: "More", path: "__more__", icon: MoreHorizontal },
];

/* ── Credit Pill ── */
interface CreditPillProps {
  credits: number;
  nearestExpiry: { credits: number; daysLeft: number } | null;
}

const CreditPill = ({ credits, nearestExpiry }: CreditPillProps) => {
  const pillClass = credits === 0
    ? "bg-destructive/10 text-destructive"
    : credits <= 3
    ? "bg-warning/10 text-warning animate-pulse"
    : "bg-primary/10 text-primary";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer", pillClass)}>
          <Coins className="w-4 h-4" />
          <span>{credits}</span>
          {nearestExpiry && (
            <span className="text-[10px] font-normal opacity-80">
              · {nearestExpiry.credits} expiring
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <p className="text-sm font-medium text-foreground mb-3">Your credits</p>
        {credits > 0 ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-foreground">{credits}</span>
              <span className="text-xs text-muted-foreground">available</span>
            </div>
            {nearestExpiry && (
              <div className="rounded-md bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
                ⏳ {nearestExpiry.credits} credit{nearestExpiry.credits !== 1 ? "s" : ""} expiring
                in {nearestExpiry.daysLeft} day{nearestExpiry.daysLeft !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No credits remaining</p>
        )}
        <div className="border-t border-border mt-3 pt-3">
          <Link to="/credits" className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
            + Buy More Credits
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  const name = user?.user_metadata?.full_name || "User";
  const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  // Realtime credit balance (updates live without polling)
  const { balance: credits, nearestExpiry } = useCredits();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Desktop Sidebar ── */}
      <aside className={cn(
        "hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 relative shrink-0",
        sidebarOpen ? "w-60" : "w-16"
      )}>
        {/* Logo */}
        <div className="p-4 flex items-center gap-2 border-b border-border h-14">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
              <Gift className="w-4 h-4 text-primary-foreground" />
            </div>
            {sidebarOpen && <span className="text-lg font-heading font-bold text-foreground truncate">GiftMind</span>}
          </Link>
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 p-2 space-y-1">
          {sidebarItems.map((item) => (
            <Link key={item.path + item.label} to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.path)
                  ? "bg-primary text-primary-foreground"
                  : item.accent
                  ? "bg-accent/10 text-accent hover:bg-accent/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
              <item.icon className="w-5 h-5 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}

          <div className="border-t border-border my-2" />

          {sidebarSecondary.map((item) => (
            item.external ? (
              <a key={item.label} href={item.path} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <item.icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </a>
            ) : (
              <Link key={item.path} to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive(item.path)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                <item.icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            )
          ))}
        </nav>

        {/* Collapse toggle */}
        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10">
          {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top navbar */}
        <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
          {/* Mobile logo */}
          <Link to="/dashboard" className="md:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
              <Gift className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-base font-heading font-bold text-foreground">GiftMind</span>
          </Link>
          <div className="hidden md:block" />

          {/* Right section */}
          <div className="flex items-center gap-3">
            <CreditPill credits={credits} nearestExpiry={nearestExpiry} />
            {credits === 0 && (
              <Link to="/credits" className="text-xs text-destructive font-medium hover:underline hidden sm:block">Top up</Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-foreground truncate">{name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}><User className="w-4 h-4 mr-2" /> Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive"><LogOut className="w-4 h-4 mr-2" /> Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border px-2 py-1.5 flex justify-around items-end z-50">
        {bottomNavItems.map((item) => {
          if (item.path === "__more__") {
            return (
              <Sheet key="more" open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger asChild>
                  <button className="flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    <MoreHorizontal className="w-5 h-5" />
                    <span>More</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl">
                  <SheetHeader>
                    <SheetTitle>More</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-1 py-4">
                    {[
                      { label: "Credits", path: "/credits", icon: Coins },
                      { label: "Refer a Friend", path: "/settings", icon: Link2 },
                      { label: "Settings", path: "/settings", icon: Settings },
                      { label: "Blog", path: "/blog", icon: FileText },
                      { label: "Help", path: "/settings", icon: HelpCircle },
                    ].map((m) => (
                      <Link key={m.label} to={m.path} onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors">
                        <m.icon className="w-5 h-5 text-muted-foreground" />
                        {m.label}
                      </Link>
                    ))}
                    <button onClick={() => { setMoreOpen(false); handleSignOut(); }}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors w-full">
                      <LogOut className="w-5 h-5" />
                      Logout
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            );
          }

          if (item.center) {
            return (
              <Link key={item.path} to={item.path}
                className="flex flex-col items-center gap-0.5 -mt-4">
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center shadow-lg">
                  <item.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <span className="text-[10px] font-medium text-primary">{item.label}</span>
              </Link>
            );
          }

          return (
            <Link key={item.path} to={item.path}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium transition-colors",
                isActive(item.path) ? "text-primary" : "text-muted-foreground"
              )}>
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default DashboardLayout;
