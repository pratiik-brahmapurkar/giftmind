import { ReactNode, useState, useEffect } from "react";
import { Gift, Quote } from "lucide-react";
import { Link } from "react-router-dom";

const testimonials = [
  { text: "I found the perfect anniversary gift in 90 seconds.", author: "Early Tester" },
  { text: "Finally, a tool that tells me WHY a gift works.", author: "Beta User" },
  { text: "No more panic-buying the day before.", author: "Beta User" },
];

const TestimonialPanel = () => {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % testimonials.length);
        setFade(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const t = testimonials[index];

  return (
    <div className="hidden md:flex w-1/2 relative items-center justify-center p-12 bg-[#2A2724]">
      {/* Decorative elements */}
      <div className="absolute top-8 left-8">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
          <Gift className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="absolute bottom-8 right-8 text-white/20 text-xs">GiftMind</div>

      <div className={`max-w-sm text-center transition-opacity duration-300 ${fade ? "opacity-100" : "opacity-0"}`}>
        <Quote className="w-8 h-8 text-white/30 mx-auto mb-4 rotate-180" strokeWidth={1.5} />
        <p className="text-xl text-white font-medium leading-relaxed mb-4">"{t.text}"</p>
        <p className="text-white/60 text-sm">— {t.author}</p>
      </div>

      {/* Dots */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
        {testimonials.map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/30"}`} />
        ))}
      </div>
    </div>
  );
};

const AuthLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen flex">
    <TestimonialPanel />
    <div className="flex-1 flex items-center justify-center px-4 py-12 bg-background">
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
  </div>
);

export default AuthLayout;
