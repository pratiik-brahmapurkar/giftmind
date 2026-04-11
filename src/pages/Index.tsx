import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import OccasionsGrid from "@/components/landing/OccasionsGrid";
import ValueProps from "@/components/landing/ValueProps";
import ProductPreview from "@/components/landing/ProductPreview";
import SocialProof from "@/components/landing/SocialProof";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import { SEOHead } from "@/components/common/SEOHead";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;
    supabase
      .from("users")
      .select("has_completed_onboarding")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && !data.has_completed_onboarding) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      });
  }, [user, loading, navigate]);
  return (
    <div className="min-h-screen">
      <SEOHead 
        title="AI Gift Recommendations with Confidence"
        description="Stop guessing. Get 3 AI-powered gift recommendations with confidence scores, cultural intelligence, and buy links for your region. Start free."
        keywords={['gift ideas', 'AI gift finder', 'gift recommendations', 'what to gift']}
      />
      <Navbar />
      <Hero />
      <div id="how">
        <HowItWorks />
      </div>
      <OccasionsGrid />
      <ValueProps />
      <ProductPreview />
      <SocialProof />
      <div id="pricing">
        <Pricing />
      </div>
      <div id="faq">
        <FAQ />
      </div>
      <FinalCTA />
      <Footer />
    </div>
  );
};

export default Index;
