import React from 'react';
import { ArrowDown, ChartNoAxesCombined, Check, FileCheck2, Files, FolderArchive, MessageCircle, ReceiptText } from 'lucide-react';

const FEATURES = [
  { icon: MessageCircle, title: 'ผู้ช่วยผ่าน LINE', text: 'จดรายการ ดูงาน และรับการแจ้งเตือนในแชต', items: ['พิมพ์รายรับ–รายจ่าย ตรวจร่างก่อนยืนยัน', 'ดูงานเดือนนี้ งานกำลังทำ ยอดรอรับ และสรุปเดือน', 'รับการเตือนถึงกำหนดและเลยกำหนดเมื่อเปิดใช้งาน'] },
  { icon: Files, title: 'เอกสารพร้อมส่งลูกค้า', text: 'ใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ', items: ['ออกเอกสารจากข้อมูลของงาน', 'ดาวน์โหลดเอกสารเป็น PDF ได้ไม่จำกัด', 'เรียกเอกสารที่สร้างไว้ผ่าน LINE ได้'] },
  { icon: FolderArchive, title: 'คลังเอกสารเป็นระเบียบ', text: 'เก็บกับงาน แล้วรวมออกมาเป็น ZIP', items: ['แนบ PDF รูปภาพ และเอกสารกับงาน', 'ค้นหาด้วยชื่องาน ลูกค้า และตัวกรองปี', 'ดาวน์โหลด ZIP จัดตามงานและเดือนของรายจ่าย'] },
  { icon: FileCheck2, title: 'ตามใบ 50 ทวิให้ครบ', text: 'เห็นว่าใบไหนได้รับแล้ว ใบไหนยังต้องตาม', items: ['ติดตามเอกสารของงานที่มีการหัก ณ ที่จ่าย', 'แนบไฟล์แล้วเปลี่ยนสถานะเป็นได้รับเอกสาร', 'เปิดเตือนติดตามรายเดือนผ่าน LINE ได้'] },
  { icon: ChartNoAxesCombined, title: 'รู้จักรายได้ให้ลึกขึ้น', text: 'มองตามช่วงเวลา ลูกค้า และประเภทงาน', items: ['เลือกช่วงเวลาของรายงาน', 'เจาะดูงานของลูกค้าและประเภทงาน', 'ดูสัดส่วนรายได้ ลูกค้าเดิม และลูกค้าใหม่'] },
  { icon: ReceiptText, title: 'เตรียมข้อมูลเรื่องภาษี', text: 'รายรับจริง ค่าลดหย่อน และภาษีหัก ณ ที่จ่าย', items: ['รวบรวมรายรับตามปีและวันที่รับเงินจริง', 'จัดข้อมูลค่าลดหย่อนและเครดิตภาษี', 'ส่งออกรายงานเป็น CSV หรือ Excel เพื่อตรวจทาน'] },
];
export default function ProOverview() {
  return <section id="pro" className="pro-overview"><div className="editorial-wrap">
    <div className="pro-overview-heading"><div><p className="eyebrow">CASH SQUIRREL PRO</p><h2>Pro มีอะไรบ้าง</h2></div><p>ทุกอย่างใน Free<br /><span>พร้อมผู้ช่วยอีก 6 ด้านของงาน</span></p></div>
    <div className="pro-benefits">{FEATURES.map(({icon:Icon,title,text,items},index)=><article className="pro-benefit" key={title}><span className="benefit-symbol"><Icon size={25} strokeWidth={1.35}/></span><span className="benefit-index">0{index+1}</span><h3>{title}</h3><p>{text}</p><details><summary>ดูรายละเอียด <span>+</span></summary><ul>{items.map(item=><li key={item}><Check size={12}/>{item}</li>)}</ul></details></article>)}</div>
    <a className="text-link pro-demo-link" href="#line">ลองให้กระรอกช่วยผ่าน LINE <ArrowDown size={16}/></a>
  </div></section>;
}
