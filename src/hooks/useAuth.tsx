import React, { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from "react";
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
  isOwner: boolean;
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
    isOwner: false,
  });

  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.warn("fetchProfile error:", error.message);
        return null;
      }
      return data as Profile | null;
    } catch {
      return null;
    }
  }, []);

  const fetchRoles = useCallback(async (userId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) {
        console.warn("fetchRoles error:", error.message);
        return [];
      }
      return data?.map((r: any) => r.role) || [];
    } catch {
      return [];
    }
  }, []);

  const loadUserData = useCallback(async (session: Session) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [profile, roles] = await Promise.all([
        fetchProfile(session.user.id),
        fetchRoles(session.user.id),
      ]);
      if (!mountedRef.current) return;
      const isAdmin = roles.includes("admin");
      const isOwner = roles.includes("owner");
      setAuth({ isReady: true, session, user: session.user, profile, roles, isAdmin, isOwner });
    } catch (err) {
      console.warn("loadUserData error:", err);
      if (mountedRef.current) {
        setAuth(prev => ({ ...prev, isReady: true }));
      }
    } finally {
      loadingRef.current = false;
    }
  }, [fetchProfile, fetchRoles]);

  // Debounced version to prevent rapid-fire auth state changes
  const debouncedLoadUserData = useCallback((session: Session) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadUserData(session);
    }, 300);
  }, [loadUserData]);

  useEffect(() => {
    mountedRef.current = true;
    let initialLoadDone = false;

    // Get initial session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      initialLoadDone = true;
      if (session?.user) {
        await loadUserData(session);
      } else if (mountedRef.current) {
        setAuth(prev => ({ ...prev, isReady: true }));
      }
    });

    // Listen for auth state changes AFTER initial load
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initialLoadDone) return;
      if (!mountedRef.current) return;

      if (session?.user) {
        // Use debounced version for auth state changes to prevent storms
        debouncedLoadUserData(session);
      } else {
        setAuth({ isReady: true, session: null, user: null, profile: null, roles: [], isAdmin: false, isOwner: false });
      }
    });

    // Periodic session validation - every 2 minutes to avoid rate limits
    const sessionCheck = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { error } = await supabase.auth.getUser();
          if (error) {
            await supabase.auth.signOut();
          }
        }
      } catch {
        // ignore errors in periodic check
      }
    }, 120000);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      clearInterval(sessionCheck);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Listen for role/profile changes in realtime
  useEffect(() => {
    if (!auth.user) return;
    const channel = supabase
      .channel("user-roles-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        if (auth.user && mountedRef.current) {
          fetchRoles(auth.user.id).then((roles) => {
            if (mountedRef.current) {
              setAuth((prev) => ({ ...prev, roles, isAdmin: roles.includes("admin"), isOwner: roles.includes("owner") }));
            }
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${auth.user.id}` }, () => {
        if (auth.user && mountedRef.current) {
          fetchProfile(auth.user.id).then((profile) => {
            if (profile && mountedRef.current) setAuth((prev) => ({ ...prev, profile }));
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [auth.user?.id, fetchProfile, fetchRoles]);

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

  const hasPermission = useCallback((key: string) => {
    if (ALWAYS_ALLOWED.has(key)) return true;
    if (!auth.profile) return false;
    if (auth.profile.status !== "نشط") return false;
    if (auth.isAdmin) return true;
    if (auth.isOwner && key === "settings") return true;
    return auth.profile.permissions?.includes(key) ?? false;
  }, [auth.profile, auth.isAdmin, auth.isOwner]);

  const value = useMemo(() => ({ auth, login, signup, logout, hasPermission }), [auth, hasPermission]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
