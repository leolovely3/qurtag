import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authClient, clearDataPass, forgetSession } from './authClient';
import { db } from './db';

/**
 * Who is signed in, for every screen. Owners sign up and in with email and password
 * through QuR Tag's own sign-in service (src/lib/authClient.ts). Finders never sign in.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

type Result = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  signUp: (input: { email: string; password: string; name: string }) => Promise<(Result & { needsConfirmation?: boolean })>;
  signIn: (email: string, password: string) => Promise<Result>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<Result>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The sign-in service's codes, in plain words. */
function words(error: { code?: string; message?: string; status?: number } | null | undefined, fallback: string): string {
  switch (error?.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email and password do not match. Check them and try again.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'There is already an account with that email. Sign in instead.';
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 8 characters for your password.';
    case 'PASSWORD_TOO_LONG':
      return 'That password is too long.';
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Confirm your email first: open the link we sent you.';
  }
  if (error?.status === 429) return 'Too many tries. Wait a minute and try again.';
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await authClient.getSession();
      setUser(data?.user ? { id: data.user.id, email: data.user.email, name: data.user.name } : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const signUp = useCallback<AuthContextValue['signUp']>(
    async ({ email, password, name }) => {
      const e = email.trim().toLowerCase();
      if (!EMAIL.test(e)) return { ok: false, error: 'Enter a valid email address.' };
      if (password.length < 8) return { ok: false, error: 'Use at least 8 characters for your password.' };
      forgetSession();
      const { data, error } = await authClient.signUp.email({
        email: e,
        password,
        name: name.trim() || e.split('@')[0],
        callbackURL: '/start/setup',
      });
      if (error) return { ok: false, error: words(error, 'Could not create the account. Try again.') };
      await refresh();
      return { ok: true, needsConfirmation: !data?.token };
    },
    [refresh],
  );

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      forgetSession();
      const { error } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      if (error) return { ok: false, error: words(error, 'Could not sign in. Try again.') };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    clearDataPass();
    try {
      await authClient.signOut();
    } finally {
      forgetSession();
      setUser(null);
    }
  }, []);

  const deleteAccount = useCallback<AuthContextValue['deleteAccount']>(async () => {
    const { error } = await db.rpc('delete_my_account');
    if (error) return { ok: false, error: 'Could not delete the account. Try again, or email info@impactconsulting.ai.' };
    clearDataPass();
    await authClient.signOut().catch(() => {});
    forgetSession();
    setUser(null);
    return { ok: true };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signUp, signIn, signOut, deleteAccount }),
    [user, loading, signUp, signIn, signOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useUser() {
  return useAuth().user;
}
