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

import { getCachedData, setCachedData } from "@/lib/cache/page-cache";
import {
  WORKSPACE_COOKIE,
  WORKSPACE_STORAGE_KEY,
} from "@/lib/auth/workspace-cookie";

function readClientWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // private mode
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${WORKSPACE_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function persistClientWorkspaceId(id: string) {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
  } catch {
    // private mode
  }
  document.cookie = `${WORKSPACE_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
}

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
  const [profile, setProfile] = useState<Profile | null>(() => getCachedData<Profile>("user_profile"));
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(!profile);

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<any[]>(() => getCachedData<any[]>("user_workspaces") || []);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    () => readClientWorkspaceId(),
  );

  const fetchWorkspaces = useCallback(async () => {
    try {
      const cached = getCachedData<any[]>("user_workspaces");
      if (cached && cached.length > 0 && workspaces.length === 0) {
        setWorkspaces(cached);
      }
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        const list = data.workspaces || [];
        setWorkspaces(list);
        setCachedData("user_workspaces", list);

        const cookieActiveId = readClientWorkspaceId();
        const currentActive = list.find((w: any) => w.id === cookieActiveId) || list[0] || null;
        if (currentActive) {
          setActiveWorkspaceId(currentActive.id);
          persistClientWorkspaceId(currentActive.id);
        }
      }
    } catch (err) {
      console.error("[AuthProvider] Error fetching workspaces:", err);
    }
  }, [workspaces.length]);

  const fetchProfile = useCallback(async (userId: string) => {
    const cached = getCachedData<Profile>("user_profile");
    if (cached) {
      setProfile(cached);
      setProfileLoading(false);
    } else {
      setProfileLoading(true);
    }
    const supabase = createClient();
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

        const profData: Profile = {
          id: data.id,
          full_name: data.full_name,
          email: data.email,
          avatar_url: data.avatar_url,
          role: data.role,
          account_id: data.account_id ?? null,
          account_role: role,
          beta_features: data.beta_features ?? [],
        };
        setProfile(profData);
        setCachedData("user_profile", profData);
        if (profData.account_id && !readClientWorkspaceId()) {
          persistClientWorkspaceId(profData.account_id);
          setActiveWorkspaceId(profData.account_id);
        }
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

  const accountId = activeWorkspaceId || activeWorkspace?.id || profile?.account_id || null;
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

  // Use only onAuthStateChange (including INITIAL_SESSION). Calling
  // getSession() in parallel steals the navigator lock and hangs every
  // dashboard query after a hard refresh.
  useEffect(() => {
    let mounted = true;
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

      if (mounted) setLoading(false);
    });

    const failsafe = window.setTimeout(() => {
      if (mounted) {
        setLoading(false);
        setProfileLoading(false);
      }
    }, 8000);

    return () => {
      mounted = false;
      window.clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, [fetchProfile, fetchWorkspaces]);

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
