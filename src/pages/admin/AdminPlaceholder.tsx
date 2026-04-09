import { SEOHead } from "@/components/common/SEOHead";
import { useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

const AdminPlaceholder = () => {
  const location = useLocation();
  const pageName = location.pathname.split("/").filter(Boolean).pop() || "Page";
  const title = pageName.charAt(0).toUpperCase() + pageName.slice(1);

  return (
    <div className="space-y-6">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      <h1 className="text-2xl font-heading font-bold text-foreground">{title}</h1>
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">This section is coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPlaceholder;
