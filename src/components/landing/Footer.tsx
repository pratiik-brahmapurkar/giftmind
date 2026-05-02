import { Link } from "react-router-dom";

const SocialIcon = ({ href, label, children }: { href: string; label: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
    className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
    {children}
  </a>
);

const Footer = () => {
  return (
    <footer className="py-12 bg-card border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/brand/giftmind-lockup.png" alt="GiftMind" className="h-9 w-auto object-contain" />
          </Link>

          <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link to="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/refund-policy" className="hover:text-primary transition-colors">Refund Policy</Link>
            <Link to="/blog" className="hover:text-primary transition-colors">Blog</Link>
          </nav>

          {/* Social icons */}
          <div className="flex items-center gap-3">
            <SocialIcon href="https://www.linkedin.com/in/pratik-brahmapurkar/" label="LinkedIn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </SocialIcon>
          </div>
        </div>

        <div className="mt-8 text-center space-y-1">
          <p className="text-sm text-muted-foreground">Built with 💜 in India, for gifters everywhere 🌍</p>
          <p className="text-xs text-muted-foreground">Some links may be affiliate links.</p>
          <p className="text-xs text-muted-foreground mt-2">🌐 English</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
