import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { identifyUser, resetUser } from "@/lib/posthog";
import { clearSentryUser, setSentryUser } from "@/lib/sentry";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setLoading(false);

        if (event === 'SIGNED_IN' && session) {
          // Identify user for Posthog
          supabase.from("users")
            .select("active_plan, country, currency_preference, created_at")
            .eq("id", session.user.id)
            .single()
            .then(({ data }) => {
              if (data) {
                identifyUser(session.user.id, {
                  email: session.user.email,
                  plan: data.active_plan,
                  country: data.country,
                  currency: data.currency_preference,
                  signup_date: data.created_at,
                });
                setSentryUser(session.user.id, data.active_plan ?? "free");
              }
            });
          console.log('User signed in:', session.user.email);
        }
        if (event === 'SIGNED_OUT') {
          console.log('User signed out');
          resetUser();
          clearSentryUser();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
