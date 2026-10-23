import React from 'react';
import { ArrowUpRight, Check, CreditCard, ScanLine } from 'lucide-react';
import { PUBLIC_PHASE_ONE } from './publicPhase';

const FULL_PLANS = [
  { id:'free', label:'FREE', title:'เริ่มเห็นภาพเรื่องเงิน', price:'0', intro:'เริ่มจากงานแรกของคุณ', period:'ใช้ฟรี', features:['จัดการงานและรายรับ–รายจ่าย','Credit Term และเงินค้างรับ','ปฏิทินและไทม์ไลน์','ภาพรวมและรายงานพื้นฐาน','เป้าหมายเก็บเงินและจัดสรรเงิน'], cta:'เริ่มใช้งานฟรี', note:'พร้อมเมื่อไหร่ ค่อยอัปเกรดเป็น Pro' },
  { id:'pro', label:'PRO', title:'มีผู้ช่วยอยู่ข้างงาน', price:'199', intro:'สำหรับ 3 รอบชำระแรกที่มีสิทธิ์', period:'/ เดือน', features:['ทุกอย่างใน Free พร้อมผู้ช่วยผ่าน LINE','ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และ PDF','คลังเอกสารและการติดตามใบ 50 ทวิ','รายงานเชิงลึกตามลูกค้าและประเภทงาน','ผู้ช่วยวางแผนภาษีและส่งออกข้อมูล'], cta:'เริ่มต้นกับ Pro', note:'ตั้งแต่รอบที่ 4 ฿249 / เดือน' },
] as const;
const PLANS = PUBLIC_PHASE_ONE ? [
  { ...FULL_PLANS[0], features: ['จัดการงานและรายรับ–รายจ่าย', 'ภาพรวมและปฏิทินกำหนดรับเงิน', 'ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษี', 'สร้างเอกสารใหม่ได้ 10 ใบต่อเดือน', 'PDF พร้อมลายน้ำเครดิตกระรอกตุนเงิน'] },
  { ...FULL_PLANS[1], title: 'เอกสารพร้อมทุกงาน', features: ['ทุกอย่างใน Free', 'สร้างเอกสารใหม่ได้ไม่จำกัด', 'ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษี', 'ดาวน์โหลดและแชร์ PDF', 'PDF ไม่มีลายน้ำเครดิตกระรอกตุนเงิน'] },
] : FULL_PLANS;
export default function Pricing({ login }: { login: string }) {
  return <section id="plans" className="plans-section"><div className="editorial-wrap">
    <div className="pricing-heading"><p className="eyebrow">เลือกตัวช่วยให้พอดีกับงาน</p><h2>เริ่มฟรี<br /><span className="soft-text">พร้อมเมื่อไหร่ ค่อยไปต่อ</span></h2><p>งานและรายรับเริ่มจัดการได้เลย<br />{PUBLIC_PHASE_ONE ? 'เพิ่ม Pro เมื่อมีเอกสารมากขึ้น' : 'เพิ่ม Pro เมื่ออยากให้กระรอกช่วยมากขึ้น'}</p></div>
    <div className="parallel-plans">{PLANS.map(plan=><article key={plan.id} className={`vertical-plan ${plan.id === 'pro' ? 'featured-plan' : ''}`}>
      <div className="vertical-plan-label"><span>{plan.label}</span>{plan.id==='pro'&&<span className="plan-highlight">{PUBLIC_PHASE_ONE ? 'เอกสารไม่จำกัด' : 'ผู้ช่วยครบกว่า'}</span>}</div>
      <h3>{plan.title}</h3>
      <div className="vertical-plan-price"><strong>฿{plan.price}</strong><span>{plan.period}</span></div>
      <p className="vertical-plan-intro">{plan.intro}</p>
      <ul>{plan.features.map(feature=><li key={feature}><Check size={16}/><span>{feature}</span></li>)}</ul>
      <a href={login} className={plan.id==='pro'?'solid-button':'outline-button'}>{plan.cta}<ArrowUpRight size={17}/></a>
      <p className="vertical-plan-note">{plan.note}</p>
    </article>)}</div>
    <div className="billing-strip"><p>Pro สิทธิ์เดียวกัน<br /><strong>เลือกจ่ายแบบที่สะดวก</strong></p><div><CreditCard size={22}/><span>บัตรเครดิต / เดบิต<small>ต่ออายุอัตโนมัติทุกเดือน</small></span></div><div><ScanLine size={23}/><span>PromptPay QR<small>ชำระเองในแต่ละรอบ</small></span></div></div>
    <p className="parallel-plans-fine">ราคา ฿199 สำหรับ 3 รอบชำระแรกของบัญชีที่มีสิทธิ์ นับร่วมกันทั้งบัตรและ PromptPay จากนั้น ฿249 ต่อเดือน</p>
    {PUBLIC_PHASE_ONE ? <div className="pricing-faq"><details><summary>Free สร้างเอกสารได้กี่ใบ?</summary><p>สร้างเอกสารใหม่ได้รวม 10 ใบต่อเดือนปฏิทิน นับตามเวลาไทย (Asia/Bangkok) ครอบคลุมใบแจ้งหนี้ ใบเสร็จรับเงิน และใบกำกับภาษี พร้อมดาวน์โหลด PDF ที่มีลายน้ำเครดิตกระรอกตุนเงิน</p></details><details><summary>บัตรกับ PromptPay ต่างกันอย่างไร?</summary><p>บัตรต่ออายุรายเดือนอัตโนมัติ ส่วน PromptPay เป็นการชำระแต่ละรอบด้วยตัวเอง ทั้งสองแบบได้สิทธิ์ Pro เหมือนกัน</p></details><details><summary>Pro เพิ่มอะไรจาก Free?</summary><p>สร้างเอกสารใหม่ได้ไม่จำกัด และดาวน์โหลดหรือแชร์ PDF ที่ไม่มีลายน้ำเครดิตกระรอกตุนเงิน <a href="#documents">ดูประเภทเอกสาร</a></p></details></div> : <div className="pricing-faq"><details><summary>Free ใช้ LINE ได้ไหม?</summary><p>LINE เป็นสิทธิ์ Pro รวมถึงช่วงทดลอง Pro ที่มีสิทธิ์ ต้องเชื่อมบัญชีก่อนใช้งาน</p></details><details><summary>บัตรกับ PromptPay ต่างกันอย่างไร?</summary><p>บัตรต่ออายุรายเดือนอัตโนมัติ ส่วน PromptPay เป็นการชำระแต่ละรอบด้วยตัวเอง ทั้งสองแบบได้สิทธิ์ Pro เหมือนกัน</p></details><details><summary>Pro มีฟีเจอร์อะไรบ้าง?</summary><p>LINE เอกสาร คลังไฟล์ ใบ 50 ทวิ รายงานเชิงลึก และผู้ช่วยภาษี <a href="#pro">ดูสิทธิ์ Pro ทั้งหมด</a></p></details></div>}
  </div></section>;
}
