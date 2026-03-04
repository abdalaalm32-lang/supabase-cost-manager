import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string;
  company_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  permissions: string[];
  status: string;
}

interface AuthState {
  isReady: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: string[];
  isAdmin: boolean;
}

interface AuthContextType {
  auth: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    email: string;
    password: string;
    fullName: string;
    companyName: string;
    companyCode?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

const AuthCtx = createContext<AuthContextType>({} as AuthContextType);

const ALWAYS_ALLOWED = new Set(["dashboard"]);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>({
    isReady: false,
    session: null,
    user: null,
    profile: null,
    roles: [],
    isAdmin: false,
  });

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    return data as Profile | null;
  };

  const fetchRoles = async (userId: string): Promise<string[]> => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    return data?.map((r: any) => r.role) || [];
  };

  const loadUserData = async (session: Session) => {
    const [profile, roles] = await Promise.all([
      fetchProfile(session.user.id),
      fetchRoles(session.user.id),
    ]);
    const isAdmin = roles.includes("admin");
    setAuth({ isReady: true, session, user: session.user, profile, roles, isAdmin });
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setTimeout(() => loadUserData(session), 0);
      } else {
        setAuth({ isReady: true, session: null, user: null, profile: null, roles: [], isAdmin: false });
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserData(session);
      } else {
        setAuth(prev => ({ ...prev, isReady: true }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Listen for role changes in realtime
  useEffect(() => {
    if (!auth.user) return;
    const channel = supabase
      .channel("user-roles-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        if (auth.user) {
          fetchRoles(auth.user.id).then((roles) => {
            setAuth((prev) => ({ ...prev, roles, isAdmin: roles.includes("admin") }));
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${auth.user.id}` }, () => {
        if (auth.user) {
          fetchProfile(auth.user.id).then((profile) => {
            if (profile) setAuth((prev) => ({ ...prev, profile }));
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [auth.user?.id]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signup = async (data: {
    email: string;
    password: string;
    fullName: string;
    companyName: string;
    companyCode?: string;
  }) => {
    const code = data.companyCode || `GSC-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({ name: data.companyName, code })
      .select()
      .single();
    
    if (companyError) throw new Error(companyError.message);

    const { error: signupError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          company_id: company.id,
          role: "مستخدم",
        },
        emailRedirectTo: window.location.origin,
      },
    });

    if (signupError) throw new Error(signupError.message);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const hasPermission = (key: string) => {
    if (ALWAYS_ALLOWED.has(key)) return true;
    if (!auth.profile) return false;
    if (auth.profile.status !== "نشط") return false;
    if (auth.isAdmin) return true;
    // For all other users, check their specific permissions array
    return auth.profile.permissions?.includes(key) ?? false;
  };

  const value = useMemo(() => ({ auth, login, signup, logout, hasPermission }), [auth]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
