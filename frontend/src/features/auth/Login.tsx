import { apiFetch } from '../../services/api';
import React, { useState } from 'react';
import { authClient } from '../../services/auth';
import { Mail, Lock, Loader2, AlertCircle, CheckCircle2, Moon, Sun, ArrowRight, UserPlus, LogIn, KeyRound, ChevronLeft, Eye, EyeOff, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot, MascotMood } from '../../components/mascot/Mascot';
import { BrandLockup } from '../../components/brand/BrandLogo';
import { useLanguage } from '../../i18n/LanguageContext';
import { isValidPassword, passwordRequirements, type PasswordRequirement } from '../../../../shared/passwordPolicy';

import { tr, trc, trServer, T } from '../../i18n/tr';
import { currentLanguage } from '../../i18n/currentLanguage';
async function loginLockStorageKey(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `cash-squirrel-login-lock:${hash}`;
}

interface LoginProps {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  onGuestLogin: (email: string) => void;
  /** Signing in to another account while the current one stays signed in (the account switcher). */
  addAccount?: { email?: string; onCancel: () => void };
}

const AUTH_STORIES: { title: string; description: string; accent: string; mood: MascotMood; icon: string; image: string }[] = [
  { title: T("เก็บทีละนิด"), description: T("ทุกเป้าหมายใหญ่ เริ่มต้นจากเงินก้อนเล็ก"), accent: T("จากเมล็ดเล็กสู่คลังใหญ่"), mood: 'happy', icon: '🪙', image: '/onboarding/save-coins.jpg' },
  { title: T("รู้ว่าเงินไปไหน"), description: T("เห็นภาพรายรับรายจ่ายได้ง่ายขึ้นในที่เดียว"), accent: T("จัดระเบียบให้เงินทำงาน"), mood: 'proud', icon: '📈', image: '/onboarding/track-spending.jpg' },
  { title: T("ไปถึงเป้าหมาย"), description: T("วางแผนวันนี้ เพื่อสิ่งที่อยากได้ในวันข้างหน้า"), accent: T("ค่อย ๆ ตุน เดี๋ยวก็ถึง"), mood: 'wave', icon: '🌱', image: '/onboarding/grow-goals.jpg' },
  { title: T("แชร์กับคนสำคัญ"), description: T("วางแผนเงินของกลุ่มร่วมกันได้อย่างโปร่งใส"), accent: T("ตุนไปด้วยกัน"), mood: 'celebrate', icon: '🤝', image: '/onboarding/shared-finance.jpg' },
  { title: T("พักได้เมื่อพร้อม"), description: T("เงินที่เป็นระบบ ช่วยให้ทุกวันเบาใจขึ้น"), accent: T("ค่อย ๆ ไปตามจังหวะ"), mood: 'sleepy', icon: '🌙', image: '/onboarding/calm-planning.jpg' },
];

function AuthStorySlider() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => setActiveIndex(current => (current + 1) % AUTH_STORIES.length), 5200);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const story = AUTH_STORIES[activeIndex];

  return (
    <aside
      aria-label={tr("เรื่องเล่ากระรอกตุนเงิน")}
      className="auth-story-panel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="auth-story-glow auth-story-glow-one" aria-hidden="true" />
      <div className="auth-story-glow auth-story-glow-two" aria-hidden="true" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black tracking-[0.16em] text-white/85">CASH SQUIRREL</span>
          <span className="text-lg" aria-hidden="true">{story.icon}</span>
        </div>

        <div className="auth-story-visual" aria-hidden="true">
          <span className="auth-story-coin auth-story-coin-one">{tr("฿")}</span>
          <span className="auth-story-coin auth-story-coin-two">✦</span>
          <Mascot mood={story.mood} size={190} className="auth-story-mascot" />
        </div>

        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tr(story.title)}
              initial={reducedMotion ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-xs font-bold text-[#FFD4A7]">{tr(story.accent)}</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-tight text-white">{tr(story.title)}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-white/70">{tr(story.description)}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-6 flex items-center gap-2" role="tablist" aria-label={tr("เลือกเรื่องเล่า")}>
            {AUTH_STORIES.map((item, index) => (
              <button
                key={tr(item.title)}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={tr("เรื่องเล่าที่ {0}: {1}", index + 1, tr(item.title))}
                onClick={() => setActiveIndex(index)}
                className={`auth-story-dot ${index === activeIndex ? 'is-active' : ''}`}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function AuthWelcome({ onContinue }: { onContinue: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => setActiveIndex(current => (current + 1) % AUTH_STORIES.length), 4800);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const story = AUTH_STORIES[activeIndex];

  return (
    <section className="auth-welcome" aria-label={tr("ยินดีต้อนรับสู่กระรอกตุนเงิน")}>
      <div className="auth-welcome-ambient auth-welcome-ambient-one" aria-hidden="true" />
      <div className="auth-welcome-ambient auth-welcome-ambient-two" aria-hidden="true" />
      <div className="auth-welcome-inner">
        <div className="auth-welcome-copy">
          <span className="auth-welcome-brand">CASH SQUIRREL</span>
          <p className="mt-7 text-sm font-bold text-[#A65F32]">{tr("วางแผนเงินอย่างสบายใจ")}</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight text-brand-text sm:text-6xl">{tr("กระรอกตุนเงิน")}</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-brand-muted sm:text-lg">{tr("จัดรายรับ รายจ่าย เป้าหมาย และเงินของกลุ่มไว้ในที่เดียว")}</p>
          <AnimatePresence mode="wait">
            <motion.div
              key={`mobile-feature-${tr(story.title)}`}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: .26, ease: [0.22, 1, 0.36, 1] }}
              className="auth-welcome-mobile-feature"
            >
              <span className="auth-welcome-mobile-feature-icon" aria-hidden="true">{story.icon}</span>
              <span className="auth-welcome-mobile-feature-text">
                <strong>{tr(story.title)}</strong>
                <small>{tr(story.description)}</small>
              </span>
            </motion.div>
          </AnimatePresence>
          <button type="button" onClick={onContinue} className="auth-welcome-cta mt-8">
            {tr("Go to กระรอกตุนเงิน")}<ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="auth-welcome-showcase">
          <div className="auth-welcome-glow" aria-hidden="true" />
          <div className="auth-welcome-slide-header relative z-10 flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-black tracking-[0.16em] text-white/90">CASH SQUIRREL</span>
            <span className="text-xl" aria-hidden="true">{story.icon}</span>
          </div>
          <div className="auth-welcome-visual" aria-hidden="true">
            <span className="auth-welcome-orbit auth-welcome-orbit-one">{tr("฿")}</span>
            <span className="auth-welcome-orbit auth-welcome-orbit-two">✦</span>
            <AnimatePresence mode="wait">
              <motion.div key={tr(story.title)} initial={reducedMotion ? false : { opacity: 0, scale: .92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, scale: 1.06, y: -12 }} transition={{ duration: .42, ease: [0.22, 1, 0.36, 1] }}>
                <img src={story.image} alt="" className="auth-welcome-image" />
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={tr(story.title)} initial={reducedMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? undefined : { opacity: 0, x: -18 }} transition={{ duration: .32 }} className="auth-welcome-slide-copy relative z-10">
              <p className="text-sm font-bold text-[#FFD4A7]">{tr(story.accent)}</p>
              <h2 className="mt-2 font-display text-3xl font-black text-white">{tr(story.title)}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">{tr(story.description)}</p>
            </motion.div>
          </AnimatePresence>
          <div className="auth-welcome-slide-dots relative z-10 mt-6 flex gap-2" role="tablist" aria-label={tr("เลือกเรื่องเล่า")}>
            {AUTH_STORIES.map((item, index) => <button key={tr(item.title)} type="button" role="tab" aria-selected={index === activeIndex} aria-label={tr("เรื่องเล่าที่ {0}", index + 1)} onClick={() => setActiveIndex(index)} className={`auth-story-dot ${index === activeIndex ? 'is-active' : ''}`} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function PasswordChecklist({ password, confirmation }: { password: string; confirmation: string }) {
  const { t } = useLanguage();
  const requirements = passwordRequirements(password);
  const rules: { key: PasswordRequirement | 'match'; met: boolean }[] = [
    ...(['length', 'letter', 'number'] as const).map(key => ({ key, met: requirements[key] })),
    { key: 'match', met: confirmation.length > 0 && password === confirmation },
  ];
  return (
    <div className="rounded-2xl border border-brand-border/50 bg-brand-bg/35 px-4 py-3">
      <p className="mb-2 text-[11px] font-extrabold text-brand-text">{t('login.passwordRequirements')}</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {rules.map(({ key, met }) => (
          <li key={key} className={`flex items-start gap-2 text-[11px] leading-5 ${met ? 'text-emerald-700 dark:text-emerald-300' : 'text-brand-muted'}`}>
            <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${met ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-brand-border'}`}>
              {met && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span>{t(`login.passwordRule.${key}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Login({ darkMode, setDarkMode, onGuestLogin, addAccount }: LoginProps) {
  const { t, toggleLanguage } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const initialParams = new URLSearchParams(window.location.search);
  const initialRecoveryToken = initialParams.get('r') || initialParams.get('recover') || '';
  const [accountRecoveryToken, setAccountRecoveryToken] = useState(initialRecoveryToken);
  const [isAccountRecovery, setIsAccountRecovery] = useState(() => window.location.pathname === '/recover' || initialRecoveryToken.length >= 24);
  const [loginLock, setLoginLock] = useState<{ email: string; until: number } | null>(null);
  const [loginLockSeconds, setLoginLockSeconds] = useState(0);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockCodeSent, setUnlockCodeSent] = useState(false);
  const [backupRecoveryEmail, setBackupRecoveryEmail] = useState('');
  const [backupRecoveryCode, setBackupRecoveryCode] = useState('');
  const [backupRecoverySent, setBackupRecoverySent] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(addAccount?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const signupPasswordValid = isValidPassword(password) && confirmPassword.length > 0 && password === confirmPassword;
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Google sign-in leaves this page with loading on. Coming back with the browser's Back button
  // (or cancelling on Google) restores the page from the back/forward cache with that state
  // intact, which used to leave the button spinning forever -- reset it whenever the page is
  // shown again, and if the redirect never happens at all.
  const oauthTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      if (oauthTimerRef.current) window.clearTimeout(oauthTimerRef.current);
    };
  }, []);
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('confirmationExpired') === '1' ? t('login.err.confirmationExpired')
      : params.get('authLinkError') === '1' ? t('login.err.authLink')
      : params.get('accountDeletionPending') === '1' ? t('login.accountDeletionPending')
      : (params.has('r') || params.has('recover')) && (params.get('r') || params.get('recover') || '').length < 24 ? t('login.invalidRecoveryLink') : null;
  });
  const [success, setSuccess] = useState<string | null>(() => new URLSearchParams(window.location.search).get('emailConfirmed') === '1' ? t('login.success.emailConfirmed') : null);
  const [mascotMood, setMascotMood] = useState<MascotMood>('happy');
  const [showWelcome, setShowWelcome] = useState(() => window.location.pathname === '/' && new URLSearchParams(window.location.search).get('emailConfirmed') !== '1' && !new URLSearchParams(window.location.search).has('recover') && !new URLSearchParams(window.location.search).has('r') && window.location.hash !== '#login');
  const [authEntry, setAuthEntry] = useState(0);
  // First screen of the card: choose how to sign in (no form). "Email" opens the existing form.
  // Coming back from an email confirmation link goes straight to the form, where the password is needed.
  const [authMethod, setAuthMethod] = useState<'choose' | 'email'>(() => addAccount?.email || new URLSearchParams(window.location.search).get('emailConfirmed') === '1' ? 'email' : 'choose');
  // Start from the last answer this browser saw, so a refresh does not draw Facebook faded and then
  // pop it in (owner, 2026-10-21). The server still refuses a provider that is switched off.
  const [providers, setProviders] = useState<{ google: boolean; facebook: boolean }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cashflow_auth_providers') || 'null');
      if (saved && typeof saved.facebook === 'boolean') return { google: saved.google !== false, facebook: saved.facebook };
    } catch { /* no saved answer */ }
    return { google: true, facebook: true };
  });
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/auth?providers=1', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).then(body => {
      if (cancelled || !body?.providers) return;
      const next = { google: body.providers.google !== false, facebook: body.providers.facebook === true };
      setProviders(next);
      try { localStorage.setItem('cashflow_auth_providers', JSON.stringify(next)); } catch { /* storage blocked */ }
    }).catch(() => { /* keep the last known state */ });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    let cancelled = false;
    void (async () => {
      try {
        const key = await loginLockStorageKey(normalized);
        const until = Number(localStorage.getItem(key));
        if (cancelled || email.trim().toLowerCase() !== normalized) return;
        if (until > Date.now()) setLoginLock({ email: normalized, until });
        else { localStorage.removeItem(key); setLoginLock(current => current?.email === normalized ? null : current); }
      } catch { /* The server still enforces the lock if browser storage is unavailable. */ }
    })();
    return () => { cancelled = true; };
  }, [email]);

  React.useEffect(() => {
    if (!loginLock) { setLoginLockSeconds(0); return; }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((loginLock.until - Date.now()) / 1000));
      setLoginLockSeconds(remaining);
      if (remaining === 0) {
        void loginLockStorageKey(loginLock.email).then(key => localStorage.removeItem(key)).catch(() => {});
        setLoginLock(current => current?.email === loginLock.email ? null : current);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [loginLock]);

  const normalizedEmail = email.trim().toLowerCase();
  const loginLockedForThisEmail = !isSignUp && !isForgotPassword && !isAccountRecovery && !!loginLock && loginLock.email === normalizedEmail && loginLockSeconds > 0;
  React.useEffect(() => {
    setUnlockCode('');
    setUnlockCodeSent(false);
  }, [normalizedEmail]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailConfirmed = params.get('emailConfirmed') === '1';
    if (emailConfirmed) params.delete('emailConfirmed');
    const authLinkError = params.get('authLinkError') === '1';
    if (authLinkError) params.delete('authLinkError');
    const confirmationExpired = params.get('confirmationExpired') === '1';
    if (confirmationExpired) params.delete('confirmationExpired');
    const accountDeletionPending = params.get('accountDeletionPending') === '1';
    if (accountDeletionPending) params.delete('accountDeletionPending');
    const hasRecoveryLink = params.has('r') || params.has('recover');
    const recoveryToken = params.get('r') || params.get('recover') || '';
    const invalidRecoveryLink = hasRecoveryLink && recoveryToken.length < 24;
    // Old links remain usable until their one-hour expiry, but do not keep
    // their secret in the browser's address bar after this page loads.
    params.delete('r'); params.delete('recover');
    const shouldUseRecoveryPath = (hasRecoveryLink && !invalidRecoveryLink) || window.location.pathname === '/recover';
    const shouldUseLoginPath = window.location.hash === '#login' || emailConfirmed || authLinkError || confirmationExpired || accountDeletionPending || invalidRecoveryLink;
    const nextPath = shouldUseRecoveryPath ? '/recover' : shouldUseLoginPath ? '/login' : window.location.pathname;
    const nextUrl = `${nextPath}${params.size ? `?${params}` : ''}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(null, '', nextUrl);
      window.dispatchEvent(new Event('cash-squirrel:navigate'));
    }
    const syncWelcomeWithHistory = () => {
      const currentParams = new URLSearchParams(window.location.search);
      setShowWelcome(window.location.pathname === '/' && !currentParams.has('recover') && !currentParams.has('r') && currentParams.get('emailConfirmed') !== '1' && window.location.hash !== '#login');
    };
    window.addEventListener('popstate', syncWelcomeWithHistory);
    return () => window.removeEventListener('popstate', syncWelcomeWithHistory);
  }, []);

  const openLogin = () => {
    window.history.pushState({ cashSquirrelView: 'login' }, '', `/login${window.location.search}`);
    window.dispatchEvent(new Event('cash-squirrel:navigate'));
    setAuthEntry(current => current + 1);
    setShowWelcome(false);
  };

  const returnToWelcome = () => {
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new Event('cash-squirrel:navigate'));
    setShowWelcome(true);
  };

  React.useEffect(() => {
    if (error) {
      setMascotMood('alert');
    } else if (success) {
      setMascotMood('celebrate');
    } else {
      setMascotMood('happy');
    }
  }, [error, success]);

  // The recovery code and new password are verified together by the server. This keeps the
  // password-changing authority off the browser while preserving a mobile-friendly OTP flow.
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify'>('request');
  const [otpToken, setOtpToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const resetPasswordValid = isValidPassword(resetNewPassword) && resetConfirmPassword.length > 0 && resetNewPassword === resetConfirmPassword;
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(300);

  React.useEffect(() => {
    if (!isForgotPassword || recoveryStep !== 'verify' || otpSecondsLeft <= 0) return;
    const timer = window.setInterval(() => setOtpSecondsLeft(current => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [isForgotPassword, recoveryStep, otpSecondsLeft]);

  const otpCountdown = `${Math.floor(otpSecondsLeft / 60)}:${String(otpSecondsLeft % 60).padStart(2, '0')}`;

  const closeAccountRecovery = () => {
    setIsAccountRecovery(false);
    setAccountRecoveryToken('');
    setBackupRecoverySent(false);
    setBackupRecoveryCode('');
    window.history.replaceState(null, '', '/login');
    window.dispatchEvent(new Event('cash-squirrel:navigate'));
  };

  const handleAccountRecovery = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null); setSuccess(null);
    try {
      if (accountRecoveryToken.trim().length < 24) throw new Error(t('login.invalidRecoveryLink'));
      const response = await apiFetch('/api/recover-account', { method: 'POST', body: JSON.stringify({
        action: backupRecoverySent ? 'verify' : 'request', email: backupRecoveryEmail.trim(), token: accountRecoveryToken.trim(),
        code: backupRecoverySent ? backupRecoveryCode : undefined
      }) });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ? trServer(body.error) : tr("ทำรายการไม่สำเร็จ"));
      }
      if (backupRecoverySent) {
        setSuccess(t('login.accountRecoverySuccess'));
        closeAccountRecovery(); setIsForgotPassword(false);
      } else { setBackupRecoverySent(true); setSuccess(t('login.accountRecoveryCodeSent')); }
    } catch (error) { setError((error as Error).message); }
    finally { setLoading(false); }
  };

  const handleUnlockRequest = async () => {
    if (!normalizedEmail || !password) { setError(t('login.unlockEnterPassword')); return; }
    setLoading(true); setError(null); setSuccess(null);
    try {
      const result = await authClient.auth.requestLoginUnlock({ email: normalizedEmail, password });
      if (result.error) throw result.error;
      setUnlockCodeSent(true);
      setSuccess(t('login.unlockCodeSent'));
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  };

  const handleUnlockSignIn = async () => {
    if (!normalizedEmail || !password || unlockCode.length !== 6) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      const result = await authClient.auth.signInWithUnlockCode({ email: normalizedEmail, password, code: unlockCode });
      if (result.error) throw result.error;
      try {
        const key = await loginLockStorageKey(normalizedEmail);
        localStorage.removeItem(key);
      } catch { /* Successful authentication must not depend on browser storage. */ }
      setLoginLock(null);
      setUnlockCode('');
      setUnlockCodeSent(false);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp && password !== confirmPassword) {
      setError(t('login.err.passwordMismatch'));
      return;
    }
    if (isSignUp && !signupPasswordValid) {
      setError(t('login.err.passwordRequirements'));
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        const { error: signUpErr, data } = await authClient.auth.signUp({
          email,
          password,
          displayName: displayName.trim(),
        });
        if (signUpErr) throw signUpErr;

        if (data?.session) {
          setSuccess(data?.signupEmailSent === false
            ? t('login.err.signupEmailFailed')
            : t('login.success.signUpWithSession'));
        } else {
          // Email confirmation is on, so there's no session yet: hop to the sign-in tab with the
          // email already filled in, so the user can sign in as soon as they've clicked the link.
          setIsSignUp(false);
          setPassword('');
          setConfirmPassword('');
          setSuccess(t('login.success.signUpNeedsConfirm'));
        }
      } else {
        const { error: signInErr } = await authClient.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        try {
          const key = await loginLockStorageKey(normalizedEmail);
          localStorage.removeItem(key);
        } catch { /* Successful authentication must not depend on browser storage. */ }
        setLoginLock(current => current?.email === normalizedEmail ? null : current);
      }
    } catch (err: any) {
      if (!isSignUp && err.code === 'login_locked') {
        const until = Date.now() + Math.max(1, Number(err.retryAfter) || 300) * 1000;
        const lockedEmail = normalizedEmail;
        setLoginLock({ email: lockedEmail, until });
        setError(null);
        void loginLockStorageKey(lockedEmail).then(key => localStorage.setItem(key, String(until))).catch(() => {});
        return;
      }
      let message = err.message || t('login.err.generic');
      if (message.toLowerCase().includes('invalid login credentials') || message.toLowerCase().includes('wrong password') || message.toLowerCase().includes('user not found') || message.toLowerCase().includes('invalid_credentials')) {
        message = t('login.err.invalidCredentials');
      } else if (message.toLowerCase().includes('email already in use') || message.toLowerCase().includes('user already exists')) {
        message = t('login.err.emailInUse');
      } else if (message.toLowerCase().includes('signup disabled')) {
        message = t('login.err.signupDisabled');
      } else if (
        message.toLowerCase().includes('too many requests') ||
        message.toLowerCase().includes('security purposes')
      ) {
        message = t('login.err.tooManyRequests');
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/password-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'request', email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ? trServer(data.error) : t('login.err.resetGeneric'));
      setSuccess(t('login.success.codeSent'));
      setOtpSecondsLeft(300);
      setRecoveryStep('verify');
    } catch (err: any) {
      setError(err.message || t('login.err.resetGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      setError(t('login.err.newPasswordMismatch'));
      return;
    }
    if (!resetPasswordValid) {
      setError(t('login.err.passwordRequirements'));
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/password-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'verify', email, code: otpToken, newPassword: resetNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ? trServer(data.error) : t('login.err.verifyGeneric'));
      setSuccess(t('login.success.passwordReset'));
      setIsForgotPassword(false);
      setRecoveryStep('request');
      setOtpToken('');
      setPassword('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err: any) {
      setError(err.message || t('login.err.verifyGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/api/password-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'request', email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ? trServer(data.error) : t('login.err.resetGeneric'));
      setOtpToken('');
      setOtpSecondsLeft(300);
      setSuccess(t('login.success.codeResent'));
    } catch (err: any) {
      setError(err.message || t('login.err.resetGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const [pendingProvider, setPendingProvider] = useState<'google' | 'facebook' | null>(null);
  const handleOAuthLogin = async (provider: 'google' | 'facebook') => {
    setPendingProvider(provider);
    setLoading(true);
    setError(null);
    try {
      const { error: oauthErr } = await authClient.auth.signInWithOAuth({ provider });
      if (oauthErr) throw oauthErr;
      // Normally the browser is already on its way to Google; if it is still here after a while
      // (blocked redirect, offline), give the buttons back.
      if (oauthTimerRef.current) window.clearTimeout(oauthTimerRef.current);
      oauthTimerRef.current = window.setTimeout(() => setLoading(false), 12000);
    } catch (err: any) {
      setError(err.message || t('login.err.googleGeneric'));
      setLoading(false);
    }
  };

  return (
    <>
      {showWelcome && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .38, ease: [0.22, 1, 0.36, 1] }} className="fixed inset-0 z-[100] overflow-y-auto bg-brand-bg">
          <AuthWelcome onContinue={openLogin} />
        </motion.div>
      )}
    <div className="auth-page is-clean min-h-screen bg-[#F7F7F5] dark:bg-brand-bg flex flex-col justify-center items-center px-4 py-8 sm:py-12 relative overflow-hidden transition-colors duration-300">
      <header className="auth-topbar">
        <div className="auth-topbar-side">
          {addAccount ? (
            <button type="button" onClick={addAccount.onCancel} className="auth-topbar-btn" aria-label={tr("กลับไปบัญชีที่ใช้อยู่")} title={tr("กลับไปบัญชีที่ใช้อยู่")}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : !isAccountRecovery && (
            <button type="button" onClick={returnToWelcome} className="auth-topbar-btn auth-back-to-welcome" aria-label={t('login.backToWelcome')} title={t('login.backToWelcome')}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>
        <BrandLockup size={26} latin />
        <div className="auth-topbar-side justify-end">
          <button type="button" onClick={toggleLanguage} className="auth-topbar-btn text-xs font-bold" aria-label={t('login.languageSwitchLabel')} title={t('login.languageSwitchLabel')}>
            {t('login.languageToggle')}
          </button>
          <button type="button" onClick={() => setDarkMode(!darkMode)} className="auth-topbar-btn"
            aria-label={darkMode ? t('login.darkModeOff') : t('login.darkModeOn')} title={darkMode ? t('login.darkModeOff') : t('login.darkModeOn')}>
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <div className="auth-layout relative z-10 w-full">
      <div className="auth-form-column">
        {/* Form Card */}
        <motion.div
          key={`${authEntry}-${authMethod}`}
          layout
          initial={authEntry || authMethod === 'email' ? { opacity: 0, y: 14, scale: .985 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: .48, ease: [0.22, 1, 0.36, 1] }}
          className="auth-form-card bg-brand-white rounded-[16px] p-6"
        >
          {authMethod === 'choose' && !isForgotPassword && !isAccountRecovery ? (
            <div data-testid="auth-method-chooser">
              <h2 className="auth-title">{trc("login", "ยินดีต้อนรับสู่กระรอกตุนเงิน")}</h2>
              <p className="mt-1.5 text-[13px] text-brand-muted">{tr("เข้าสู่ระบบหรือสร้างบัญชีเพื่อดำเนินการต่อ")}</p>
              {error && (
                <div role="alert" className="mt-4 p-3.5 rounded-2xl bg-pink-bg border border-pink-acc/10 text-pink-acc text-xs font-medium flex items-start gap-2.5">
                  <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}
              <div className="mt-5 space-y-3">
                <button type="button" onClick={() => { void handleOAuthLogin('google'); }} disabled={loading} className="auth-pill">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
                  {loading && pendingProvider === 'google' ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('login.processing')}</> : tr("ดำเนินการต่อด้วย Google")}
                </button>
                <button type="button" onClick={() => { if (providers.facebook) void handleOAuthLogin('facebook'); }}
                  disabled={loading || !providers.facebook} aria-disabled={!providers.facebook} className="auth-pill">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M14.2 7.6h2.6V4.1a33 33 0 0 0-3.1-.16c-3.07 0-5.17 1.93-5.17 5.46v3.04H5.1v3.92h3.43V24h4.2v-7.64h3.36l.53-3.92h-3.89V9.78c0-1.13.3-2.18 1.47-2.18z"/></svg>
                  {loading && pendingProvider === 'facebook' ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('login.processing')}</> : tr("ดำเนินการต่อด้วย Facebook")}
                </button>
                <button type="button" onClick={() => { setAuthMethod('email'); setError(null); }} className="auth-pill">
                  <Mail className="h-5 w-5 text-brand-text" aria-hidden="true" />
                  {tr("ดำเนินการต่อด้วยอีเมล")}
                </button>
              </div>
              <p className="auth-legal">
                {tr("เมื่อดำเนินการต่อ ถือว่าคุณยอมรับ")}<br />
                <a href="/terms">{trc("login", "ข้อกำหนดการใช้งาน")}</a>{tr(" และ ")}<a href="/privacy">{trc("login", "นโยบายความเป็นส่วนตัว")}</a>{currentLanguage === 'en' ? '.' : null}
              </p>
            </div>
          ) : (<>
          {!isForgotPassword && !isAccountRecovery && (
            <button type="button" onClick={() => { setAuthMethod('choose'); setError(null); setSuccess(null); }}
              className="mb-4 inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-bold text-brand-muted hover:text-brand-text cursor-pointer">
              <ChevronLeft className="h-4 w-4" />{t('login.otherSignInOptions')}
            </button>
          )}
          {!isForgotPassword && !isAccountRecovery && (
            <div className="mb-5">
              <h2 className="font-display text-2xl font-extrabold text-brand-text">
                {isSignUp ? tr("สร้างบัญชีใหม่") : tr("ยินดีต้อนรับกลับ")}
              </h2>
              <p className="mt-1 text-xs font-medium text-brand-muted">
                {isSignUp ? tr("เริ่มจัดการงานและเงินของคุณวันนี้") : tr("กลับมาดูงานและเงินของคุณต่อกัน")}
              </p>
            </div>
          )}

          {/* Tabs for Login / SignUp (only show if not in Forgot Password mode) */}
          {!isForgotPassword && !isAccountRecovery ? (
            <div className="flex p-1 bg-brand-bg/50 border border-brand-border/20 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setIsForgotPassword(false);
                  setIsAccountRecovery(false);
                  setRecoveryStep('request');
                  setOtpToken('');
                  setResetNewPassword('');
                  setResetConfirmPassword('');
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  !isSignUp
                    ? 'bg-brand-white text-[#E65F2B] dark:text-[#FFA473] shadow-sm border border-brand-border/10'
                    : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                <LogIn className="w-4 h-4" />
                {t('login.tabSignIn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setIsForgotPassword(false);
                  setIsAccountRecovery(false);
                  setRecoveryStep('request');
                  setOtpToken('');
                  setResetNewPassword('');
                  setResetConfirmPassword('');
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSignUp
                    ? 'bg-brand-white text-[#E65F2B] dark:text-[#FFA473] shadow-sm border border-brand-border/10'
                    : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                {t('login.tabSignUp')}
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-2 mb-6">
              <button
                type="button"
                onClick={() => {
                  if (isAccountRecovery) {
                    closeAccountRecovery();
                  } else if (recoveryStep === 'verify') {
                    setRecoveryStep('request');
                  } else {
                    setIsForgotPassword(false);
                  }
                  setError(null);
                  setSuccess(null);
                }}
                className="p-1.5 rounded-lg bg-brand-bg hover:bg-brand-faint border border-brand-border/40 text-brand-muted hover:text-brand-text transition-all cursor-pointer"
                aria-label={t('login.accountRecoveryBack')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-display font-extrabold text-lg text-brand-text">
                  {isAccountRecovery ? t('login.accountRecoveryTitle') : recoveryStep === 'request' ? t('login.recoveryTitleRequest') : t('login.recoveryTitleVerify')}
                </h3>
                {isAccountRecovery && <p className="mt-1 text-xs leading-relaxed text-brand-muted">{t('login.accountRecoverySubtitle')}</p>}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {loginLockedForThisEmail ? (
              <motion.div
                key="login-lockout"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                role="alert"
                aria-live="assertive"
                className="mb-4 rounded-2xl border border-orange-200/80 bg-orange-500/5 p-3.5 text-brand-text dark:border-orange-300/60 dark:bg-orange-300/5"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-orange-600 dark:text-orange-300" />
                  <div className="text-xs font-semibold leading-relaxed">
                    <p>{tr("กรอกรหัสผ่านผิดเกินจำนวนครั้งที่กำหนด โปรดลองเข้าสู่ระบบในอีก")}</p>
                    <p className="mt-1 font-black tabular-nums text-orange-700 dark:text-orange-300">
                      {tr("{0}:{1} นาที", Math.floor(loginLockSeconds / 60), String(loginLockSeconds % 60).padStart(2, '0'))}</p>
                    <p className="mt-1 text-brand-muted">{t('login.unlockExplanation')}</p>
                    {error && <p className="mt-2 text-red-600 dark:text-red-300">{error}</p>}
                  </div>
                </div>
              </motion.div>
            ) : error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3.5 rounded-2xl bg-pink-bg border border-pink-acc/10 text-pink-acc text-xs font-medium flex items-start gap-2.5"
              >
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3.5 rounded-2xl bg-green-bg border border-green-acc/10 text-green-acc text-xs font-medium flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {isAccountRecovery ? (
            <form onSubmit={handleAccountRecovery} className="space-y-4">
              <p className="text-xs leading-6 text-brand-muted">{t('login.accountRecoveryDescription')}</p>
              <div>
                <label htmlFor="account-recovery-link-code" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted">{t('login.accountRecoveryLinkCode')}</label>
                <input id="account-recovery-link-code" type="password" required autoComplete="off" spellCheck={false} minLength={24} maxLength={100}
                  value={accountRecoveryToken} onChange={event => setAccountRecoveryToken(event.target.value.trim())}
                  placeholder={t('login.accountRecoveryLinkCodePlaceholder')} aria-label={t('login.accountRecoveryLinkCode')}
                  className="w-full rounded-2xl border border-brand-border/60 bg-brand-bg/20 px-4 py-3 font-mono text-xs text-brand-text outline-none transition-all placeholder:font-sans placeholder:text-brand-muted/50 focus:border-[#E65F2B] focus:ring-4 focus:ring-orange-500/10 dark:focus:border-[#FFA473] dark:focus:ring-orange-500/5" />
              </div>
              <div>
                <label htmlFor="account-recovery-email" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted">{t('login.accountRecoveryEmail')}</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-brand-muted" aria-hidden="true"><Mail className="h-4.5 w-4.5" /></span>
                  <input id="account-recovery-email" type="email" required autoComplete="email" value={backupRecoveryEmail} onChange={event => setBackupRecoveryEmail(event.target.value)}
                    placeholder={t('login.emailPlaceholder')} aria-label={t('login.accountRecoveryEmail')} className="w-full rounded-2xl border border-brand-border/60 bg-brand-bg/20 py-3 pl-10 pr-4 text-xs text-brand-text outline-none transition-all placeholder:text-brand-muted/50 focus:border-[#E65F2B] focus:ring-4 focus:ring-orange-500/10 dark:focus:border-[#FFA473] dark:focus:ring-orange-500/5" />
                </div>
              </div>
              {backupRecoverySent && (
                <div>
                  <label htmlFor="account-recovery-code" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted">{t('login.accountRecoveryCode')}</label>
                  <input id="account-recovery-code" type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={backupRecoveryCode} onChange={event => setBackupRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('login.verificationCodePlaceholder')} aria-label={t('login.accountRecoveryCode')} className="w-full rounded-2xl border border-brand-border/60 bg-brand-bg/20 px-4 py-3 text-sm tracking-[0.25em] text-brand-text outline-none transition-all placeholder:tracking-normal placeholder:text-brand-muted/50 focus:border-[#E65F2B] focus:ring-4 focus:ring-orange-500/10 dark:focus:border-[#FFA473] dark:focus:ring-orange-500/5" />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-brand-muted">{t('login.accountRecoveryCodeHint')}</p>
                </div>
              )}
              <button type="submit" disabled={loading || (backupRecoverySent && backupRecoveryCode.length !== 6)}
                className="mt-2 flex w-full cursor-pointer select-none items-center justify-center gap-2 rounded-2xl bg-[#E65F2B] px-4 py-3.5 text-xs font-extrabold text-white shadow-md shadow-orange-600/10 transition-all hover:bg-[#D98324] hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-none">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />{t('login.accountRecoveryProcessing')}</> : backupRecoverySent ? <><CheckCircle2 className="h-4 w-4" />{t('login.accountRecoveryConfirm')}</> : <><KeyRound className="h-4 w-4" />{t('login.accountRecoverySendCode')}</>}
              </button>
              {backupRecoverySent && <button type="button" disabled={loading} onClick={() => { setBackupRecoverySent(false); setBackupRecoveryCode(''); setSuccess(null); }} className="w-full cursor-pointer text-xs font-semibold text-brand-muted transition-colors hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-50">{t('login.accountRecoveryResend')}</button>}
            </form>
          ) : isForgotPassword ? (
            /* Forgot Password Form Flow */
            recoveryStep === 'request' ? (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <p className="text-[11px] text-brand-muted leading-relaxed">
                  {t('login.resetDescription')}
                </p>
                <p className="rounded-xl border border-brand-border/50 bg-brand-bg/40 px-3 py-2.5 text-[11px] leading-relaxed text-brand-muted">
                  {t('login.deletionRecoveryHint')}
                </p>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    {t('login.yourEmail')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <Mail className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('login.emailPlaceholder')}
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#E65F2B] hover:bg-[#D98324] dark:bg-[#E65F2B] dark:hover:bg-[#FFA473] text-white font-extrabold rounded-2xl text-xs shadow-md shadow-orange-600/10 dark:shadow-none hover:shadow-lg hover:shadow-orange-600/15 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('login.sendingCode')}
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      {t('login.sendCodeButton')}
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* OTP Verification + New Password Form */
              <form onSubmit={handleVerifyAndReset} className="space-y-4">
                <p className="text-[11px] text-brand-muted leading-relaxed">
                  {(() => {
                    const [before, after] = t('login.verifyDescription').split('{email}');
                    return (
                      <>
                        {before}
                        <strong className="text-brand-text">{email}</strong>
                        {after}
                      </>
                    );
                  })()}
                </p>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    {t('login.verificationCode')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <KeyRound className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder={t('login.verificationCodePlaceholder')}
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-base tracking-[0.5em] text-center font-mono focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50 placeholder:tracking-normal placeholder:text-xs placeholder:font-sans"
                    />
                  </div>
                  <p className={`mt-2 text-center text-[11px] font-bold ${otpSecondsLeft > 0 ? 'text-brand-muted' : 'text-pink-acc'}`} aria-live="polite">
                    {otpSecondsLeft > 0 ? `${t('login.codeExpiresIn')} ${otpCountdown}` : t('login.codeExpired')}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    {t('login.newPassword')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <Lock className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder={t('login.newPasswordPlaceholder')}
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    {t('login.confirmNewPassword')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <Lock className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder={t('login.confirmNewPasswordPlaceholder')}
                      maxLength={128}
                      autoComplete="new-password"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                  </div>
                </div>

                <PasswordChecklist password={resetNewPassword} confirmation={resetConfirmPassword} />

                <button
                  type="submit"
                  disabled={loading || otpSecondsLeft <= 0 || otpToken.length !== 6 || !resetPasswordValid}
                  className="w-full py-3.5 px-4 bg-[#E65F2B] hover:bg-[#D98324] dark:bg-[#E65F2B] dark:hover:bg-[#FFA473] text-white font-extrabold rounded-2xl text-xs shadow-md shadow-orange-600/10 dark:shadow-none hover:shadow-lg hover:shadow-orange-600/15 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('login.settingNewPassword')}
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      {t('login.confirmAndReset')}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="w-full text-center text-[11px] font-bold text-brand-muted hover:text-[#E65F2B] dark:hover:text-[#FFA473] cursor-pointer transition-all disabled:opacity-50"
                >
                  {t('login.didntReceiveCode')}
                </button>
              </form>
            )
          ) : (
            /* Login & Sign Up Form */
            <>
            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    {t('login.displayName')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <UserPlus className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                      placeholder={t('login.displayNamePlaceholder')}
                      minLength={2}
                      maxLength={60}
                      autoComplete="name"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                  {t('login.email')}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                    <Mail className="w-4.5 h-4.5" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.emailPlaceholder')}
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted">
                    {t('login.password')}
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError(null);
                        setSuccess(null);
                      }}
                      className="text-[11px] font-bold text-[#E65F2B] dark:text-[#FFA473] hover:underline cursor-pointer"
                    >
                      {t('login.forgotPassword')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                    <Lock className="w-4.5 h-4.5" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? t('login.passwordPlaceholderSignup') : t('login.passwordPlaceholderSignin')}
                    minLength={isSignUp ? 8 : undefined}
                    maxLength={128}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    required
                    className="w-full pl-10 pr-11 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                  />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-brand-muted hover:text-brand-text transition-colors" aria-label={showPassword ? tr("ซ่อนรหัสผ่าน") : tr("แสดงรหัสผ่าน")}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {loginLockedForThisEmail && (
                <div className="space-y-3 rounded-2xl border border-brand-border/60 bg-brand-bg/30 p-3.5">
                  <p className="text-xs leading-relaxed text-brand-muted">{t('login.unlockInstructions')}</p>
                  {unlockCodeSent && (
                    <div>
                      <label htmlFor="login-unlock-code" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted">{t('login.accountRecoveryCode')}</label>
                      <input id="login-unlock-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                        value={unlockCode} onChange={event => setUnlockCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-xl border border-brand-border/60 bg-brand-white px-4 py-3 text-sm tracking-[0.25em] text-brand-text outline-none focus:border-[#E65F2B]"
                        placeholder={t('login.verificationCodePlaceholder')} />
                    </div>
                  )}
                  <button type="button" disabled={loading || !email.trim() || !password} onClick={() => { void handleUnlockRequest(); }}
                    className="w-full rounded-xl border border-brand-border bg-brand-white px-4 py-3 text-xs font-bold text-brand-text transition-colors hover:bg-brand-faint disabled:opacity-50">
                    {unlockCodeSent ? t('login.unlockResendCode') : t('login.unlockSendCode')}
                  </button>
                  {unlockCodeSent && (
                    <button type="button" disabled={loading || unlockCode.length !== 6 || !password} onClick={() => { void handleUnlockSignIn(); }}
                      className="w-full rounded-xl bg-[#E65F2B] px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-[#D8551F] disabled:opacity-50">
                      {t('login.unlockConfirm')}
                    </button>
                  )}
                </div>
              )}

              {isSignUp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    {t('login.confirmPassword')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <Lock className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('login.confirmPasswordPlaceholder')}
                      maxLength={128}
                      autoComplete="new-password"
                      required={isSignUp}
                      className="w-full pl-10 pr-11 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                    <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-brand-muted hover:text-brand-text transition-colors" aria-label={showPassword ? tr("ซ่อนรหัสผ่าน") : tr("แสดงรหัสผ่าน")}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </motion.div>
              )}

              {isSignUp && <PasswordChecklist password={password} confirmation={confirmPassword} />}

              <button
                type="submit"
                disabled={loading || loginLockedForThisEmail || (isSignUp && !signupPasswordValid)}
                className="w-full py-3.5 px-4 bg-[#E65F2B] hover:bg-[#D98324] dark:bg-[#E65F2B] dark:hover:bg-[#FFA473] text-white font-extrabold rounded-2xl text-xs shadow-md shadow-orange-600/10 dark:shadow-none hover:shadow-lg hover:shadow-orange-600/15 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('login.processing')}
                  </>
                ) : isSignUp ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    {t('login.signUpButton')}
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    {t('login.tabSignIn')}
                  </>
                )}
              </button>
            </form>

            </>
          )}

          </>)}

        </motion.div>

      </div>
      </div>
    </div>
    </>
  );
}
