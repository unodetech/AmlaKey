import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; userId?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  isPasswordRecovery: false,
  signIn: async () => null,
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => null,
  clearPasswordRecovery: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Safety timeout: if getSession takes > 4s (e.g. new device, slow network),
    // assume no session and show auth screen instead of hanging on splash.
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        mounted = false; // Ignore late getSession response
        setSession(null);
        setLoading(false);
      }
    }, 4000);

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        clearTimeout(timeout);
        setSession(session);
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) setSession(session);
      // When user clicks password reset link, flag recovery mode and navigate
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        router.replace("/reset-password");
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<{ error: string | null; userId?: string }> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return error ? { error: error.message } : { error: null, userId: data.user?.id };
  }, []);

  const signOut = useCallback(async () => {
    setIsPasswordRecovery(false);
    try {
      // Clear user-scoped data to prevent leaking to next user
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(k => k.startsWith("user:"));
      if (userKeys.length > 0) await AsyncStorage.multiRemove(userKeys);
    } catch {}
    try { await supabase.auth.signOut(); } catch {}
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<string | null> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Platform.OS === "web"
        ? `${window.location.origin}/reset-password`
        : "propertymanager://reset-password",
    });
    return error ? error.message : null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isPasswordRecovery,
        signIn,
        signUp,
        signOut,
        resetPassword,
        clearPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
