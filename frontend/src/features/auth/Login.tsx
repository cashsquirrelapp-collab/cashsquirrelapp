import { apiFetch } from '../../services/api';
import React, { useState } from 'react';
import { authClient } from '../../services/auth';
import { Mail, Lock, Loader2, AlertCircle, CheckCircle2, Moon, Sun, ArrowRight, UserPlus, LogIn, KeyRound, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot, MascotMood } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';

interface LoginProps {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  onGuestLogin: (email: string) => void;
}

const AUTH_STORIES: { title: string; description: string; accent: string; mood: MascotMood; icon: string }[] = [
  { title: 'เก็บทีละนิด', description: 'ทุกเป้าหมายใหญ่ เริ่มต้นจากเงินก้อนเล็ก', accent: 'จากเมล็ดเล็กสู่คลังใหญ่', mood: 'happy', icon: '🪙' },
  { title: 'รู้ว่าเงินไปไหน', description: 'เห็นภาพรายรับรายจ่ายได้ง่ายขึ้นในที่เดียว', accent: 'จัดระเบียบให้เงินทำงาน', mood: 'proud', icon: '📈' },
  { title: 'ไปถึงเป้าหมาย', description: 'วางแผนวันนี้ เพื่อสิ่งที่อยากได้ในวันข้างหน้า', accent: 'ค่อย ๆ ตุน เดี๋ยวก็ถึง', mood: 'wave', icon: '🌱' },
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
      aria-label="เรื่องเล่ากระรอกตุนเงิน"
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
          <span className="auth-story-coin auth-story-coin-one">฿</span>
          <span className="auth-story-coin auth-story-coin-two">✦</span>
          <Mascot mood={story.mood} size={190} className="auth-story-mascot" />
        </div>

        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={story.title}
              initial={reducedMotion ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-xs font-bold text-[#FFD4A7]">{story.accent}</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-tight text-white">{story.title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-white/70">{story.description}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-6 flex items-center gap-2" role="tablist" aria-label="เลือกเรื่องเล่า">
            {AUTH_STORIES.map((item, index) => (
              <button
                key={item.title}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`เรื่องเล่าที่ ${index + 1}: ${item.title}`}
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
    <section className="auth-welcome" aria-label="ยินดีต้อนรับสู่กระรอกตุนเงิน">
      <div className="auth-welcome-ambient auth-welcome-ambient-one" aria-hidden="true" />
      <div className="auth-welcome-ambient auth-welcome-ambient-two" aria-hidden="true" />
      <div className="auth-welcome-inner">
        <div className="auth-welcome-copy">
          <span className="auth-welcome-brand">CASH SQUIRREL</span>
          <p className="mt-7 text-sm font-bold text-[#A65F32]">วางแผนเงินอย่างสบายใจ</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight text-brand-text sm:text-6xl">กระรอกตุนเงิน</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-brand-muted sm:text-lg">จัดรายรับ รายจ่าย เป้าหมาย และเงินของกลุ่มไว้ในที่เดียว</p>
          <button type="button" onClick={onContinue} className="auth-welcome-cta mt-8">
            Go to Kraroktunngern <span aria-hidden="true">🐿️</span><ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="auth-welcome-showcase">
          <div className="auth-welcome-glow" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-black tracking-[0.16em] text-white/90">CASH SQUIRREL</span>
            <span className="text-xl" aria-hidden="true">{story.icon}</span>
          </div>
          <div className="auth-welcome-visual" aria-hidden="true">
            <span className="auth-welcome-orbit auth-welcome-orbit-one">฿</span>
            <span className="auth-welcome-orbit auth-welcome-orbit-two">✦</span>
            <AnimatePresence mode="wait">
              <motion.div key={story.title} initial={reducedMotion ? false : { opacity: 0, scale: .92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, scale: 1.06, y: -12 }} transition={{ duration: .42, ease: [0.22, 1, 0.36, 1] }}>
                <Mascot mood={story.mood} size={240} className="auth-welcome-mascot" />
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={story.title} initial={reducedMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? undefined : { opacity: 0, x: -18 }} transition={{ duration: .32 }} className="relative z-10">
              <p className="text-sm font-bold text-[#FFD4A7]">{story.accent}</p>
              <h2 className="mt-2 font-display text-3xl font-black text-white">{story.title}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">{story.description}</p>
            </motion.div>
          </AnimatePresence>
          <div className="relative z-10 mt-6 flex gap-2" role="tablist" aria-label="เลือกเรื่องเล่า">
            {AUTH_STORIES.map((item, index) => <button key={item.title} type="button" role="tab" aria-selected={index === activeIndex} aria-label={`เรื่องเล่าที่ ${index + 1}`} onClick={() => setActiveIndex(index)} className={`auth-story-dot ${index === activeIndex ? 'is-active' : ''}`} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Login({ darkMode, setDarkMode, onGuestLogin }: LoginProps) {
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mascotMood, setMascotMood] = useState<MascotMood>('happy');
  const [showWelcome, setShowWelcome] = useState(true);

  React.useEffect(() => {
    if (error) {
      setMascotMood('alert');
    } else if (success) {
      setMascotMood('celebrate');
    } else {
      setMascotMood('happy');
    }
  }, [error, success]);

  // Password recovery states -- delivered over LINE (api/password-reset-line.ts) instead of
  // Supabase's built-in email-based recovery, which depends on the project's SMTP staying
  // healthy. The code + the new password are submitted together in one step here, since there's
  // no Supabase recovery session to hand off to once the code checks out server-side.
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify'>('request');
  const [otpToken, setOtpToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isSignUp && password !== confirmPassword) {
      setError(t('login.err.passwordMismatch'));
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const { error: signUpErr, data } = await authClient.auth.signUp({
          email,
          password,
        });
        if (signUpErr) throw signUpErr;

        if (data?.session) {
          setSuccess(t('login.success.signUpWithSession'));
        } else {
          setSuccess(t('login.success.signUpNeedsConfirm'));
        }
      } else {
        const { error: signInErr } = await authClient.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
      }
    } catch (err: any) {
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
      const res = await apiFetch('/api/password-reset-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'request', email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('login.err.resetGeneric'));
      if (data.reason === 'not_linked') {
        setError(t('login.err.notLinked'));
        return;
      }
      if (data.reason === 'send_failed') {
        setError(t('login.err.sendFailed'));
        return;
      }
      setSuccess(t('login.success.codeSent'));
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
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/password-reset-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'verify', email, code: otpToken, newPassword: resetNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('login.err.verifyGeneric'));
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
      const res = await apiFetch('/api/password-reset-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'request', email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('login.err.resetGeneric'));
      setOtpToken('');
      setSuccess(t('login.success.codeResent'));
    } catch (err: any) {
      setError(err.message || t('login.err.resetGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: googleErr } = await authClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        }
      });
      if (googleErr) throw googleErr;
    } catch (err: any) {
      setError(err.message || t('login.err.googleGeneric'));
      setLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {showWelcome && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: .38, ease: [0.22, 1, 0.36, 1] }} className="fixed inset-0 z-[100] overflow-y-auto bg-brand-bg">
            <AuthWelcome onContinue={() => setShowWelcome(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    <div className="auth-page min-h-screen bg-brand-bg flex flex-col justify-center items-center px-4 py-8 sm:py-12 relative overflow-hidden transition-colors duration-300">
      
      {/* Background Decorative Rings */}
      <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-orange-600/5 dark:bg-orange-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 rounded-full bg-orange-600/5 dark:bg-orange-500/5 blur-3xl pointer-events-none" />

      {/* Theme Toggle (Top Right) -- language toggle lives in Settings only */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-3 rounded-2xl bg-brand-white hover:bg-brand-faint/60 text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center border border-brand-border/40 shadow-sm cursor-pointer"
          title={darkMode ? t('login.darkModeOff') : t('login.darkModeOn')}
        >
          {darkMode ? (
            <Sun className="w-5 h-5 text-amber-500 fill-amber-500/10" />
          ) : (
            <Moon className="w-5 h-5 text-orange-600 dark:text-orange-400 fill-orange-600/10" />
          )}
        </button>
      </div>

      <div className="auth-layout relative z-10 w-full max-w-6xl">
      <div className="auth-form-column">
        {/* Brand Header */}
        <div className="text-center mb-6 sm:mb-7">
          <Mascot mood={mascotMood} size={100} className="mb-2" />
          <h2 className="text-2xl font-display font-extrabold tracking-tight text-brand-text sm:text-3xl">
            {t('login.brandName')}
          </h2>
          <p className="mt-1.5 text-xs font-bold text-[#E65F2B] dark:text-[#FFA473] uppercase tracking-wider">
            {t('login.tagline')}
          </p>
        </div>

        <div className="mb-6 lg:hidden">
          <AuthStorySlider />
        </div>

        {/* Form Card */}
        <motion.div
          layout
          className="auth-form-card bg-brand-white border border-brand-border/40 rounded-[24px] p-6 sm:p-8 shadow-xl shadow-brand-text/5 dark:shadow-none"
        >
          {/* Tabs for Login / SignUp (only show if not in Forgot Password mode) */}
          {!isForgotPassword ? (
            <div className="flex p-1 bg-brand-bg/50 border border-brand-border/20 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setIsForgotPassword(false);
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
            <div className="flex items-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => {
                  if (recoveryStep === 'verify') {
                    setRecoveryStep('request');
                  } else {
                    setIsForgotPassword(false);
                  }
                  setError(null);
                  setSuccess(null);
                }}
                className="p-1.5 rounded-lg bg-brand-bg hover:bg-brand-faint border border-brand-border/40 text-brand-muted hover:text-brand-text transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-display font-extrabold text-lg text-brand-text">
                {recoveryStep === 'request' ? t('login.recoveryTitleRequest') : t('login.recoveryTitleVerify')}
              </h3>
            </div>
          )}

          <AnimatePresence mode="wait">
            {error && (
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

          {isForgotPassword ? (
            /* Forgot Password Form Flow */
            recoveryStep === 'request' ? (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <p className="text-[11px] text-brand-muted leading-relaxed">
                  {t('login.resetDescription')}
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
                      pattern="[0-9]*"
                      maxLength={12}
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder={t('login.verificationCodePlaceholder')}
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-base tracking-[0.5em] text-center font-mono focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50 placeholder:tracking-normal placeholder:text-xs placeholder:font-sans"
                    />
                  </div>
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
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpToken.length < 6 || resetNewPassword.length < 6}
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
                    required
                    className="w-full pl-10 pr-11 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                  />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-brand-muted hover:text-brand-text transition-colors" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

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
                      required={isSignUp}
                      className="w-full pl-10 pr-11 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                    <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-brand-muted hover:text-brand-text transition-colors" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
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

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-brand-border/40" />
              <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">{t('login.or')}</span>
              <div className="flex-1 h-px bg-brand-border/40" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 px-4 bg-brand-white hover:bg-brand-faint/60 text-brand-text font-extrabold rounded-2xl text-xs border border-brand-border/60 cursor-pointer flex items-center justify-center gap-2.5 select-none active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              {t('login.googleSignIn')}
            </button>
            </>
          )}

          <div className="space-y-3 mt-4">
            <button
              type="button"
              onClick={() => {
                // Always the generic placeholder -- this is a no-signup guest trial, so it must
                // never pick up whatever happens to be sitting in the email field (the browser's
                // own autofill routinely fills that with the visitor's real saved email before
                // they've touched anything, which isn't a guest login at all).
                onGuestLogin('guest_demo@cashflow.com');
              }}
              className="w-full py-3.5 px-4 bg-orange-500/10 dark:bg-orange-500/5 hover:bg-orange-500/15 text-[#E65F2B] dark:text-[#FFA473] font-extrabold rounded-2xl text-xs border border-orange-500/20 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all shadow-sm"
            >
              {t('login.guestTrial')}
            </button>
          </div>
        </motion.div>

        {/* Footer info */}
        <p className="text-center mt-6 text-[10px] text-brand-muted leading-relaxed max-w-[280px] mx-auto">
          {t('login.securityNote')}
        </p>
        <p className="text-center mt-2 text-[10px] text-brand-muted">
          <a href="/privacy" className="hover:text-[#E65F2B] dark:hover:text-[#FFA473] underline underline-offset-2">{t('login.privacyPolicy')}</a>
          <span className="mx-1.5">&middot;</span>
          <a href="/terms" className="hover:text-[#E65F2B] dark:hover:text-[#FFA473] underline underline-offset-2">{t('login.termsOfUse')}</a>
        </p>
      </div>
      <div className="hidden lg:block"><AuthStorySlider /></div>
      </div>
    </div>
    </>
  );
}
