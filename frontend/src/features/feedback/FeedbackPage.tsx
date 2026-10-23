import { ArrowRight, MessageSquare } from 'lucide-react';
import { uiPrimaryButton, uiSurface } from '../../components/ui/uiStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import FeedbackChat from './FeedbackChat';

// "บอกเรา": signed-in accounts get the conversation (FeedbackChat); guests are asked to sign in, as before.
// The admin inbox (AdminFeedbackInbox / FeedbackInbox / FeedbackConversation) is unchanged.
type Props = { userId: string; isGuest: boolean; onSignIn?: () => void; mobile?: boolean; onBack?: () => void };

export default function FeedbackPage({ userId, isGuest, onSignIn, mobile = false, onBack }: Props) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => language === 'th' ? th : en;
  if (!isGuest) return <FeedbackChat key={userId} userId={userId} mobile={mobile} onBack={onBack} />;
  return <section aria-labelledby="feedback-page-title" className="mx-auto w-full max-w-4xl space-y-5 pb-8">
    <header className="ui-page-header"><div className="min-w-0"><h1 id="feedback-page-title" className="ui-page-title">{copy('บอกเรา', 'Tell us')}</h1><p className="ui-page-description">{copy('มีอะไรอยากบอกเราไหม? แจ้งปัญหา เสนอไอเดีย หรือพูดคุยกับทีมได้เลย', 'Anything to tell us? Report a problem, share an idea, or just talk to the team.')}</p></div></header>
    <div className={`${uiSurface} px-6 py-12 text-center`}><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-blue-bg text-brand-blue-acc"><MessageSquare size={26} aria-hidden="true" /></span><h2 className="mt-5 text-lg font-semibold">{copy('เข้าสู่ระบบเพื่อคุยกับทีมงาน', 'Sign in to talk with the team')}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-brand-muted">{copy('ใช้บัญชีจริงเพื่อส่งข้อความ เก็บประวัติการสนทนา และกลับมาอ่านคำตอบจากทีมงาน โหมดทดลองยังส่งข้อความไม่ได้', 'Use an account to send messages, keep your conversation, and read replies from the team. Guest mode cannot send messages.')}</p>{onSignIn && <button type="button" className={`${uiPrimaryButton} mt-6`} onClick={onSignIn}>{copy('เข้าสู่ระบบ / สมัครสมาชิก', 'Sign in / Create an account')}<ArrowRight size={16} /></button>}</div>
  </section>;
}
