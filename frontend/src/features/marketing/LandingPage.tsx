import { Mascot } from '../../components/mascot/Mascot';
import { BrandLogo } from '../../components/brand/BrandLogo';
import {
  FileText,
  BarChart3,
  MessageSquare,
  UploadCloud,
  Camera,
  Code2,
  Briefcase,
  GraduationCap,
  Ticket,
  ShoppingBag,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

const JOURNEY_STEPS: { label: string; kind: 'neutral' | 'highlight' | 'success' }[] = [
  { label: 'รับงาน', kind: 'neutral' },
  { label: 'กำลังทำ', kind: 'neutral' },
  { label: 'ส่งงาน', kind: 'neutral' },
  { label: 'รอเงิน (Credit Term)', kind: 'highlight' },
  { label: 'รับเงินจริง', kind: 'neutral' },
  { label: 'เห็นกำไร', kind: 'success' },
];

const SCENARIOS: { headline: string; supporting: string; tags?: string[]; wide?: boolean }[] = [
  { headline: 'ส่งงานไปแล้ว แต่ต้องรอเงินอีก 30–60 วัน', supporting: 'จำ Credit Term เอง และต้องคอยเช็กว่าใครถึงกำหนดแล้ว', tags: ['Creator', 'Consultant', 'Freelancer'] },
  { headline: 'ลูกค้าจ่ายมัดจำก่อน แล้วจ่ายส่วนที่เหลือหลังส่งงาน', supporting: 'ต้องจำว่าได้รับมาแล้วเท่าไหร่ และยังเหลืออีกเท่าไหร่', tags: ['Designer', 'Developer', 'Photographer'] },
  { headline: 'เดือนหนึ่งรับหลายจ๊อบ จนเริ่มจำไม่ไหวว่าใครจ่ายแล้ว', supporting: 'มีลูกค้าหลายคน หลายวันจ่าย และเงินเข้าคนละรอบ', tags: ['Tutor', 'Coach', 'Event Worker'] },
  { headline: 'มีรายได้หลายทาง แต่ไม่รู้ว่าจริงๆ เหลือกำไรเท่าไหร่', supporting: 'ได้เงินเข้าหลายแหล่ง แต่ยังมีค่าใช้จ่ายตามมาอีก', tags: ['Creator', 'Side Hustler', 'Digital Seller'] },
  { headline: 'ต้องออกเอกสารให้ลูกค้าเอง', supporting: 'ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และข้อมูลภาษีอยู่คนละที่', tags: ['Consultant', 'Developer', 'Designer'] },
  { headline: 'หาเงินเอง แต่ไม่ได้อยากเป็นฝ่ายบัญชีให้ตัวเอง', supporting: 'อยากโฟกัสงาน ไม่ใช่เปิดหลายไฟล์เพื่อจำเรื่องเงิน', wide: true },
];

const OCCUPATIONS: { icon: typeof Camera; title: string; copy: string }[] = [
  { icon: Camera, title: 'Creator / Influencer', copy: 'รับสปอนเซอร์หลายแบรนด์ ไม่ต้องจำเองว่าเจ้าไหนจ่ายวันไหน' },
  { icon: FileText, title: 'Designer / Editor / Photographer', copy: 'รับมัดจำ ส่งงาน แล้วตามเงินส่วนที่เหลือได้ในที่เดียว' },
  { icon: Code2, title: 'Developer / Web Designer', copy: 'งานเป็นเฟส แบ่งจ่ายหลายงวด ก็ยังรู้ว่าเงินไหนเข้าแล้ว' },
  { icon: Briefcase, title: 'Consultant / Specialist', copy: 'ตั้งแต่งาน เอกสาร ไปจนถึงวันรับเงินจริง' },
  { icon: GraduationCap, title: 'Tutor / Coach / Instructor', copy: 'ลูกค้าหลายคน รายรับหลายรอบ ก็ยังเห็นภาพรวม' },
  { icon: Ticket, title: 'Event / Production Crew', copy: 'หลายงาน หลายผู้ว่าจ้าง และแต่ละงานได้เงินไม่พร้อมกัน' },
  { icon: ShoppingBag, title: 'Digital Product Seller', copy: 'มีรายได้จากหลายช่องทาง แล้วอยากเห็นว่าจริงๆ เหลือเท่าไหร่' },
  { icon: Layers, title: 'Side Hustler', copy: 'มีงานประจำ แต่รับจ๊อบเพิ่ม อยากรู้ว่างานเสริมทำเงินได้จริงแค่ไหน' },
];

function FloatingCards() {
  return (
    <div className="relative mx-auto mt-10 h-64 w-full max-w-3xl sm:h-80">
      <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-gradient-to-br from-[#FFF7F1] to-[#FBEEE4]">
        <div className="sm:hidden">
          <Mascot mood="happy" size={120} />
        </div>
        <div className="hidden sm:block">
          <Mascot mood="happy" size={150} />
        </div>
      </div>
      <div className="absolute bottom-4 left-2 w-40 rounded-2xl border border-brand-border bg-brand-white p-3.5 text-left shadow-lg shadow-black/5 sm:bottom-8 sm:left-6 sm:w-48 sm:p-4">
        <div className="text-[10px] text-brand-muted sm:text-[11px]">รอรับเงิน</div>
        <div className="mt-0.5 text-base font-bold text-[#F36A2D] sm:text-lg">฿7,365</div>
        <div className="mt-1.5 text-[10px] font-medium text-brand-text sm:text-[11px]">DDproperty</div>
        <div className="text-[9px] text-brand-muted sm:text-[10px]">Credit 30 วัน · อีก 3 วัน</div>
      </div>
      <div className="absolute right-3 top-3 w-40 rounded-2xl border border-brand-border bg-brand-white p-3.5 text-left shadow-lg shadow-black/5 sm:right-8 sm:top-6 sm:w-48 sm:p-4">
        <div className="text-[10px] text-brand-muted sm:text-[11px]">กำไรสุทธิ</div>
        <div className="mt-0.5 text-base font-bold text-[#18A66A] sm:text-lg">฿25,970</div>
        <div className="mt-1.5 text-[9px] font-medium text-[#18A66A] sm:text-[10px]">↑ 18% จากเดือนก่อน</div>
      </div>
      <div className="absolute bottom-6 right-6 hidden items-center gap-2 rounded-2xl border border-brand-border bg-brand-white px-3.5 py-2.5 shadow-lg shadow-black/5 sm:flex">
        <span className="h-2 w-2 rounded-full bg-[#E95454]" />
        <span className="text-[11px] font-medium text-brand-text">2 รายการเกินกำหนด</span>
      </div>
    </div>
  );
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const goLogin = () => onNavigate('/login');

  return (
    <div className="min-h-screen bg-white text-[#211D1A]" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-[#F0EEEA] px-5 py-4 sm:px-10 lg:px-16">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#FFF1E8]">
            <BrandLogo size={30} />
          </span>
          <span className="text-[15px] font-bold">กระรอกตุนเงิน</span>
        </div>
        <nav className="hidden items-center gap-8 lg:flex">
          <a href="#features" className="text-[13px] text-[#6B6660] hover:text-[#211D1A]">ฟีเจอร์</a>
          <a href="#who" className="text-[13px] text-[#6B6660] hover:text-[#211D1A]">เหมาะกับใคร</a>
          <a href="#pricing" className="text-[13px] text-[#6B6660] hover:text-[#211D1A]">ราคา</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={goLogin} className="px-2 text-[13px] font-medium text-[#211D1A] sm:px-1.5">เข้าสู่ระบบ</button>
          <button type="button" onClick={goLogin} className="rounded-[10px] bg-[#F36A2D] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#D8551F]">เริ่มใช้งานฟรี</button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-14 pt-16 text-center sm:px-10 sm:pt-20 lg:px-16">
        <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight sm:text-4xl lg:text-[44px]">
          รับงานเอง ทำงานเอง<br />ไม่ต้องจำเรื่องเงินเองทุกอย่าง
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#6B6660] sm:text-[15px]">
          กระรอกตุนเงินช่วยจัดการตั้งแต่รับงาน รอเงิน Credit Term รายจ่าย ไปจนถึงกำไรจริง
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={goLogin} className="w-full rounded-xl bg-[#F36A2D] px-7 py-3.5 text-sm font-semibold text-white hover:bg-[#D8551F] sm:w-auto">เริ่มใช้งานฟรี</button>
          <button type="button" onClick={goLogin} className="w-full rounded-xl border border-brand-border bg-white px-7 py-3.5 text-sm font-medium text-[#211D1A] hover:bg-brand-faint sm:w-auto">ทดลองดูระบบ</button>
        </div>
        <p className="mx-auto mt-4 max-w-lg text-xs text-[#9A968F]">
          สำหรับคนที่หาเงินด้วยตัวเอง — Creator · Freelancer · Tutor · Coach · Developer · Designer · Photographer · Consultant · คนมีงานเสริม
        </p>
        <FloatingCards />
      </section>

      {/* Journey strip */}
      <section className="px-5 pb-16 text-center sm:px-10 lg:px-16">
        <p className="mb-6 text-xs font-semibold text-[#6B6660]">จากรับงาน ถึงเห็นกำไรจริง ครบในระบบเดียว</p>
        <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-center gap-1">
          {JOURNEY_STEPS.map((step, idx) => (
            <div key={step.label} className="flex items-center gap-1">
              <div className="flex w-24 flex-col items-center gap-2">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-[13px] font-bold ${
                    step.kind === 'highlight'
                      ? 'border-[#F36A2D] bg-[#F36A2D] text-white'
                      : step.kind === 'success'
                      ? 'border-[#18A66A] bg-[#E9F8F1] text-[#12724A]'
                      : 'border-[#EAE7E3] bg-[#F7F6F4] text-[#6B6660]'
                  }`}
                >
                  {idx + 1}
                </div>
                <div className={`text-[11px] leading-tight ${step.kind === 'neutral' ? 'font-normal text-[#6B6660]' : 'font-semibold ' + (step.kind === 'highlight' ? 'text-[#C24A16]' : 'text-[#12724A]')}`}>
                  {step.label}
                </div>
              </div>
              {idx < JOURNEY_STEPS.length - 1 && (
                <ArrowRight className="-mt-6 h-4 w-4 flex-shrink-0 text-[#D8D4CE]" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Feature sections */}
      <section id="features" className="mx-auto max-w-6xl px-5 pb-16 sm:px-10 lg:px-16">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <div className="mb-2.5 text-xs font-semibold tracking-wide text-[#C24A16]">CREDIT TERM</div>
            <h2 className="mb-3.5 text-2xl font-bold leading-tight sm:text-[28px]">เงินไหนยังไม่เข้า<br />ไม่ต้องจำเอง</h2>
            <p className="max-w-md text-sm leading-7 text-[#6B6660]">ระบบติดตามเงินค้างรับอัตโนมัติ เรียงตามความเร่งด่วน ตั้งแต่เกินกำหนดไปจนถึงยังไม่ถึงกำหนด พร้อมนับถอยหลัง Credit Term ให้ทุกวัน</p>
          </div>
          <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm">
            <div className="mb-3 text-xs font-medium">เงินที่ต้องติดตาม</div>
            {[
              { name: 'Brand Consultation', sub: 'DDproperty · Credit 30 วัน', amount: '฿6,665', strip: '#E95454' },
              { name: 'รีวิวสแปลนดับ', sub: 'Skinness · อีก 3 วัน', amount: '฿1,500', strip: '#F36A2D' },
              { name: 'ผลิตคลิปโฆษณา TikTok', sub: 'Brew Days · รอรับปกติ', amount: '฿8,000', strip: '#D8D4CE' },
            ].map((row) => (
              <div key={row.name} className="flex items-center justify-between border-t border-brand-border py-2.5 pl-2.5" style={{ borderLeft: `3px solid ${row.strip}` }}>
                <div>
                  <div className="text-xs font-medium">{row.name}</div>
                  <div className="text-[11px] text-[#6B6660]">{row.sub}</div>
                </div>
                <div className="text-xs font-medium">{row.amount}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-10 lg:px-16">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm md:order-1">
            <div className="mb-3.5 grid grid-cols-2 gap-2.5">
              <div><div className="text-[11px] text-[#6B6660]">รับเงินจริง</div><div className="text-base font-semibold">฿44,880</div></div>
              <div><div className="text-[11px] text-[#6B6660]">รอรับเงิน</div><div className="text-base font-semibold text-[#F36A2D]">฿7,365</div></div>
              <div><div className="text-[11px] text-[#6B6660]">รายจ่าย</div><div className="text-base font-semibold">฿18,910</div></div>
              <div><div className="text-[11px] text-[#6B6660]">กำไรสุทธิ</div><div className="text-base font-bold text-[#18A66A]">฿25,970</div></div>
            </div>
            <svg viewBox="0 0 400 90" className="h-16 w-full">
              <polyline points="10,60 60,40 110,55 160,25 210,45 260,20 310,38 390,15" fill="none" stroke="#F36A2D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="md:order-2">
            <div className="mb-2.5 text-xs font-semibold tracking-wide text-[#C24A16]">ภาพรวม</div>
            <h2 className="mb-3.5 text-2xl font-bold leading-tight sm:text-[28px]">เห็นกำไรจริง<br />ไม่ใช่แค่ยอดเงินเข้า</h2>
            <p className="max-w-md text-sm leading-7 text-[#6B6660]">แยกให้ชัดระหว่างเงินที่รับแล้ว เงินที่รอรับ รายจ่าย และกำไรสุทธิที่เหลือจริง ไม่ปนกันจนงง</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 text-center sm:px-10 lg:px-16">
        <div className="mb-2.5 text-xs font-semibold tracking-wide text-[#C24A16]">ครบในที่เดียว</div>
        <h2 className="mb-8 text-2xl font-bold sm:text-[28px]">เรื่องเงินหลายอย่าง อยู่ในที่เดียว</h2>
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: BarChart3, label: 'รายงาน' },
            { icon: FileText, label: 'ภาษี' },
            { icon: MessageSquare, label: 'แจ้งเตือนผ่าน LINE' },
            { icon: UploadCloud, label: 'สำรองข้อมูล' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-2xl border border-brand-border bg-white p-4 text-left shadow-sm">
              <Icon className="mb-2 h-5 w-5 text-[#7D7772]" strokeWidth={1.8} />
              <div className="text-xs font-medium">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section id="who" className="bg-[#FAFAF8] px-5 pb-10 pt-16 text-center sm:px-10 lg:px-16">
        <div className="mb-2.5 text-xs font-semibold tracking-wide text-[#C24A16]">เหมาะกับคุณไหม?</div>
        <h2 className="mx-auto mb-4 max-w-xl text-2xl font-bold leading-snug sm:text-[28px]">ถ้าคุณหาเงินจากงานของตัวเอง และต้องจัดการหลังบ้านเอง<br />กระรอกตุนเงินถูกทำมาเพื่อคุณ</h2>
        <p className="mx-auto mb-10 max-w-lg text-sm leading-7 text-[#6B6660]">ไม่ว่าคุณจะเรียกตัวเองว่า Freelancer, Creator, Coach หรือแค่มีงานเสริม ถ้าคุณต้องรับงาน ตามเงิน และดูรายได้ของตัวเอง คุณกำลังเจอปัญหาแบบเดียวกัน</p>

        <div className="mx-auto mb-20 grid max-w-4xl gap-3.5 text-left sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <div key={s.headline} className={`rounded-2xl border border-brand-border p-5 ${s.wide ? 'sm:col-span-2 bg-[#FFF7F1]' : 'bg-white'}`}>
              <div className="mb-2 text-[15px] font-semibold leading-snug">{s.headline}</div>
              <div className="mb-3 text-xs leading-relaxed text-[#6B6660]">{s.supporting}</div>
              {s.tags && (
                <div className="flex flex-wrap gap-1.5">
                  {s.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[#F7F6F4] px-2.5 py-1 text-[10px] text-[#7D7772]">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <h3 className="mb-8 text-xl font-bold sm:text-2xl">งานคุณอาจไม่เหมือนกัน<br />แต่ปัญหาหลังบ้านคล้ายกัน</h3>
        <div className="mx-auto grid max-w-5xl gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
          {OCCUPATIONS.map(({ icon: Icon, title, copy }) => (
            <div key={title} className="rounded-2xl border border-brand-border bg-white p-4.5">
              <Icon className="mb-2.5 h-5 w-5 text-[#7D7772]" strokeWidth={1.8} />
              <div className="mb-1.5 text-xs font-semibold">{title}</div>
              <div className="text-[11px] leading-relaxed text-[#6B6660]">{copy}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section id="pricing" className="px-5 py-16 text-center sm:px-10 lg:px-16">
        <div className="mb-2.5 text-xs font-semibold tracking-wide text-[#C24A16]">ราคา</div>
        <h2 className="mb-7 text-2xl font-bold sm:text-[28px]">เริ่มฟรี อัปเกรดเมื่อพร้อม</h2>
        <div className="mx-auto flex max-w-lg flex-col gap-4 sm:flex-row">
          <div className="flex-1 rounded-2xl border border-brand-border bg-white p-6 text-left">
            <div className="mb-1 text-[13px] font-semibold">Free</div>
            <div className="mb-2.5 text-[22px] font-bold">฿0</div>
            <div className="text-xs text-[#6B6660]">ติดตามงานและเงินได้ครบ ไม่มีค่าใช้จ่าย</div>
          </div>
          <div className="relative flex-1 rounded-2xl border-[1.5px] border-[#F36A2D] bg-white p-6 text-left">
            <div className="absolute -top-2.5 right-4 rounded-full bg-[#F36A2D] px-2.5 py-0.5 text-[10px] font-semibold text-white">แนะนำ</div>
            <div className="mb-1 text-[13px] font-semibold">Pro</div>
            <div className="mb-2.5 text-[22px] font-bold">฿149 <span className="text-xs font-normal text-[#6B6660]">/ เดือน</span></div>
            <div className="text-xs text-[#6B6660]">ผู้ช่วยภาษี เอกสารไม่จำกัด แจ้งเตือนผ่าน LINE</div>
          </div>
        </div>
        <button type="button" onClick={() => onNavigate('/plans')} className="mt-6 rounded-xl border border-brand-border bg-white px-5 py-2.5 text-[13px] font-medium hover:bg-brand-faint">ดูแพ็กเกจ</button>
      </section>

      {/* Phase 2 teaser */}
      <section className="bg-[#FAFAF8] px-5 py-12 text-center sm:px-10 lg:px-16">
        <span className="mb-3.5 inline-block rounded-full bg-[#F2F3F5] px-3 py-1 text-[10px] font-bold tracking-wide text-[#6B6660]">เร็วๆ นี้</span>
        <div className="mb-2 text-xl font-bold leading-snug">วันนี้สำหรับคนทำงานด้วยตัวเอง<br />วันข้างหน้า โตไปพร้อมทีมของคุณ</div>
        <div className="text-[13px] text-[#6B6660]">ระบบสำหรับทีมและธุรกิจขนาดเล็กกำลังพัฒนา</div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-b from-[#FFF7F1] to-white px-5 py-20 text-center sm:px-10 lg:px-16">
        <Mascot mood="wave" size={88} className="mx-auto mb-5" />
        <h2 className="mb-6 text-[26px] font-bold leading-snug">พร้อมรู้ว่าเงินของคุณ<br />อยู่ไหนแล้วหรือยัง?</h2>
        <button type="button" onClick={goLogin} className="rounded-xl bg-[#F36A2D] px-8 py-3.5 text-sm font-semibold text-white hover:bg-[#D8551F]">เริ่มใช้งานฟรี</button>
      </section>

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#F0EEEA] px-5 py-7 text-center sm:flex-row sm:px-10 lg:px-16">
        <div className="text-xs text-[#6B6660]">© 2569 กระรอกตุนเงิน</div>
        <div className="flex gap-5">
          <a href="/privacy" className="text-xs text-[#6B6660] hover:text-[#211D1A]">นโยบายความเป็นส่วนตัว</a>
          <a href="/terms" className="text-xs text-[#6B6660] hover:text-[#211D1A]">เงื่อนไขการใช้งาน</a>
        </div>
      </footer>
    </div>
  );
}
