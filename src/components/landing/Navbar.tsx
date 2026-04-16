import { useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Gift className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-xl">GiftMind</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
          
          {user ? (
            <Link to="/dashboard">
              <Button variant="hero" size="sm" className="rounded-lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Log In</Link>
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
