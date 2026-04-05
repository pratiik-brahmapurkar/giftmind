import { Gift } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="py-12 bg-card border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Gift className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-lg">GiftMind</span>
          </Link>

          <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link to="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/refund-policy" className="hover:text-primary transition-colors">Refund Policy</Link>
            <Link to="/blog" className="hover:text-primary transition-colors">Blog</Link>
          </nav>

          <p className="text-sm text-muted-foreground">
            Made with 💜 in India
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
