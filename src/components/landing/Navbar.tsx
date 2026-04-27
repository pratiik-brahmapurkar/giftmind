import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 rounded-md transition-transform duration-200 hover:scale-[1.03] focus-visible:scale-[1.03]">
          <img src="/brand/giftmind-lockup.png" alt="GiftMind" className="h-9 w-auto object-contain" />
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-9">
          <a href="#how" className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">How It Works</a>
          <a href="#pricing" className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Pricing</a>
          <Link to="/blog" className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Blog</Link>
          
          {user ? (
            <Link to="/dashboard">
              <Button variant="hero" size="sm" className="rounded-lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Log In</Link>
              <Link to="/signup">
                <Button variant="hero" size="sm" className="rounded-lg">
                  Get Started Free
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-background border-b border-border p-4 space-y-4">
          <a href="#how" className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>How It Works</a>
          <a href="#pricing" className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>Pricing</a>
          <Link to="/blog" className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>Blog</Link>
          
          {user ? (
            <Link to="/dashboard" onClick={() => setOpen(false)}>
              <Button variant="hero" size="sm" className="w-full rounded-lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>Log In</Link>
              <Link to="/signup" onClick={() => setOpen(false)}>
                <Button variant="hero" size="sm" className="w-full rounded-lg">
                  Get Started Free
                </Button>
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
