import React, { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";

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

const EMPTY_AUTH: AuthState = {
  isReady: false,
  session: null,
  user: null,
  profile: null,
  roles: [],
  isAdmin: false,
  isOwner: false,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>(EMPTY_AUTH);

  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRef = useRef<AuthState>(EMPTY_AUTH);
  const requestIdRef = useRef(0);

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

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

  const resetAuth = useCallback(() => {
    requestIdRef.current += 1;
    loadingRef.current = false;
    if (mountedRef.current) {
      setAuth({ ...EMPTY_AUTH, isReady: true });
    }
  }, []);

  const forceLogoutSuspendedUser = useCallback(async () => {
    requestIdRef.current += 1;
    loadingRef.current = false;
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setAuth({ ...EMPTY_AUTH, isReady: true });
    }
  }, []);

  const loadUserData = useCallback(async (session: Session, preserveExisting = true) => {
    const previousAuth = authRef.current;
    const sameUser = previousAuth.user?.id === session.user.id;

    if (mountedRef.current) {
      setAuth((prev) => ({
        ...prev,
        session,
        user: session.user,
        isReady: sameUser ? prev.isReady : false,
      }));
    }

    if (loadingRef.current) return;

    const requestId = ++requestIdRef.current;
    loadingRef.current = true;

    try {
      const [profileResult, rolesResult] = await Promise.all([
        fetchProfile(session.user.id),
        fetchRoles(session.user.id),
      ]);

      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      const profile = profileResult ?? (preserveExisting && sameUser ? previousAuth.profile : null);
      const roles = rolesResult.length > 0
        ? rolesResult
        : (preserveExisting && sameUser ? previousAuth.roles : []);

      if (profile?.status && profile.status !== "نشط") {
        await forceLogoutSuspendedUser();
        return;
      }

      const isAdmin = roles.includes("admin");
      const isOwner = roles.includes("owner");

      setAuth({ isReady: true, session, user: session.user, profile, roles, isAdmin, isOwner });
    } catch (err) {
      console.warn("loadUserData error:", err);
      if (mountedRef.current && requestId === requestIdRef.current) {
        setAuth((prev) => sameUser
          ? { ...prev, isReady: true, session, user: session.user }
          : { ...EMPTY_AUTH, isReady: true, session, user: session.user }
        );
      }
    } finally {
      loadingRef.current = false;
    }
  }, [fetchProfile, fetchRoles, forceLogoutSuspendedUser]);

  const scheduleSessionSync = useCallback((session: Session | null, event?: AuthChangeEvent) => {
    if (!mountedRef.current) return;

    if (!session?.user) {
      resetAuth();
      return;
    }

    if (event === "TOKEN_REFRESHED") {
      setAuth((prev) => {
        if (prev.user?.id !== session.user.id) return prev;
        return {
          ...prev,
          session,
          user: session.user,
          isReady: prev.isReady,
        };
      });
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void loadUserData(session);
    }, event === "SIGNED_IN" ? 120 : 0);
  }, [loadUserData, resetAuth]);

  useEffect(() => {
    mountedRef.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      scheduleSessionSync(session, event);
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      if (session?.user) {
        scheduleSessionSync(session, "INITIAL_SESSION");
      } else if (mountedRef.current) {
        setAuth((prev) => ({ ...prev, isReady: true }));
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [scheduleSessionSync]);

  // Listen for role/profile changes in realtime
  useEffect(() => {
    if (!auth.user) return;
    const channel = supabase
      .channel("user-roles-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${auth.user.id}` }, () => {
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
            if (!mountedRef.current || !profile) return;
            if (profile.status !== "نشط") {
              void forceLogoutSuspendedUser();
              return;
            }
            setAuth((prev) => ({ ...prev, profile }));
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [auth.user?.id, fetchProfile, fetchRoles, forceLogoutSuspendedUser]);

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
    if (auth.profile?.status && auth.profile.status !== "نشط") return false;
    if (auth.isAdmin) return true;
    if (auth.isOwner && key === "settings") return true;
    if (!auth.profile) return false;
    return auth.profile.permissions?.includes(key) ?? false;
  }, [auth.profile, auth.isAdmin, auth.isOwner]);

  const value = useMemo(() => ({ auth, login, signup, logout, hasPermission }), [auth, hasPermission]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
