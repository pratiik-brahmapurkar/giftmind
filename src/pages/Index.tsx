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

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;
    supabase
      .from("profiles")
      .select("has_completed_onboarding")
      .eq("user_id", user.id)
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
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
};

export default Index;
