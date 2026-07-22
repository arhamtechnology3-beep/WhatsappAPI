"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  isAccountRole,
  type AccountRole,
} from "@/lib/auth/roles";

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
  account_id: string | null;
  account_role: AccountRole | null;
  beta_features: string[];
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
  workspaces: any[];
  activeWorkspace: any | null;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        const list = data.workspaces || [];
        setWorkspaces(list);

        // Get cookie helper
        const cookiesMap = document.cookie.split("; ").reduce((acc: any, row) => {
          const [key, val] = row.split("=");
          if (key) acc[key] = val;
          return acc;
        }, {});
        const cookieActiveId = cookiesMap["wacrm_active_workspace_id"];

        const currentActive = list.find((w: any) => w.id === cookieActiveId) || list[0] || null;
        if (currentActive) {
          setActiveWorkspaceId(currentActive.id);
          if (!cookieActiveId) {
            document.cookie = `wacrm_active_workspace_id=${currentActive.id}; path=/; max-age=31536000; SameSite=Lax`;
          }
        }
      }
    } catch (err) {
      console.error("[AuthProvider] Error fetching workspaces:", err);
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = createClient();
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, role, account_id, account_role, beta_features")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[AuthProvider] fetchProfile error:", error.message);
        return;
      }

      if (data) {
        const role = isAccountRole(data.account_role)
          ? (data.account_role as AccountRole)
          : null;

        setProfile({
          id: data.id,
          full_name: data.full_name,
          email: data.email,
          avatar_url: data.avatar_url,
          role: data.role,
          account_id: data.account_id ?? null,
          account_role: role,
          beta_features: data.beta_features ?? [],
        });
      }
    } catch (err) {
      console.error("[AuthProvider] fetchProfile threw:", err);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === activeWorkspaceId) || null;
  }, [workspaces, activeWorkspaceId]);

  const accountId = activeWorkspace?.id || profile?.account_id || null;
  const accountRole = useMemo(() => {
    if (activeWorkspace) {
      if (activeWorkspace.role === "member") return "agent" as AccountRole;
      return activeWorkspace.role as AccountRole;
    }
    return profile?.account_role ?? null;
  }, [activeWorkspace, profile?.account_role]);

  const account = useMemo(() => {
    const id = accountId;
    if (!id) return null;
    return {
      id,
      name: activeWorkspace?.name || profile?.full_name || "My Account",
      default_currency: DEFAULT_CURRENCY,
    };
  }, [accountId, activeWorkspace?.name, profile?.full_name]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    try {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        // Clear caches and reload
        window.location.reload();
      }
    } catch (err) {
      console.error("[AuthProvider] Failed to switch workspace:", err);
    }
  }, []);

  const createWorkspace = useCallback(async (name: string) => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to create workspace");
    }
    const data = await res.json();
    await fetchWorkspaces();
    return data.workspace;
  }, [fetchWorkspaces]);

  const init = useCallback(async () => {
    const supabase = createClient();
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) console.error("[AuthProvider] getSession error:", error.message);

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await Promise.all([
          fetchProfile(currentUser.id),
          fetchWorkspaces(),
        ]);
      } else {
        setProfileLoading(false);
      }
    } catch (err) {
      console.error("[AuthProvider] init threw:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchProfile, fetchWorkspaces]);

  useEffect(() => {
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setLoading(false);
        setProfileLoading(false);
      }
    }, 3000);

    init().finally(() => {
      clearTimeout(safetyTimer);
    });

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await Promise.all([
          fetchProfile(currentUser.id),
          fetchWorkspaces(),
        ]);
      } else {
        setProfile(null);
        setWorkspaces([]);
        setActiveWorkspaceId(null);
        setProfileLoading(false);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [init, fetchProfile, fetchWorkspaces]);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    window.location.href = "/login";
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    await Promise.all([
      fetchProfile(user.id),
      fetchWorkspaces(),
    ]);
  }, [user?.id, fetchProfile, fetchWorkspaces]);

  const derived = useMemo(() => {
    const role = accountRole;
    return {
      accountRole: role,
      accountId,
      isOwner: role === "owner",
      isAdmin: role === "admin",
      isAgent: role === "agent",
      isViewer: role === "viewer",
      canManageMembers: role ? canManageMembersFor(role) : false,
      canEditSettings: role ? canEditSettingsFor(role) : false,
      canSendMessages: role ? canSendMessagesFor(role) : false,
    };
  }, [accountRole, accountId]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        profileLoading,
        signOut,
        refreshProfile,
        account,
        defaultCurrency: activeWorkspace?.default_currency || DEFAULT_CURRENCY,
        workspaces,
        activeWorkspace,
        switchWorkspace,
        createWorkspace,
        ...derived,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      profile: null,
      loading: false,
      profileLoading: false,
      signOut: async () => {
        window.location.href = "/login";
      },
      refreshProfile: async () => {},
      account: null,
      defaultCurrency: DEFAULT_CURRENCY,
      accountId: null,
      accountRole: null,
      isOwner: false,
      isAdmin: false,
      isAgent: false,
      isViewer: false,
      canManageMembers: false,
      canEditSettings: false,
      canSendMessages: false,
      workspaces: [],
      activeWorkspace: null,
      switchWorkspace: async () => {},
      createWorkspace: async () => ({}),
    };
  }
  return ctx;
}
