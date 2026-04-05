import { ReactNode } from "react";
import { Gift } from "lucide-react";
import { Link } from "react-router-dom";

const AuthLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen gradient-mesh flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-md space-y-6">
      <Link to="/" className="flex items-center justify-center gap-2">
        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
          <Gift className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-2xl font-heading font-bold text-foreground">GiftMind</span>
      </Link>
      {children}
    </div>
  </div>
);

export default AuthLayout;
