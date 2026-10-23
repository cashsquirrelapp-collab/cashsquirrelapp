// The template people can fill in: our columns, in the app language, with example rows (jobs, as the
// owner's examples always are). The import reads it without any column matching.
import { tr } from '../../i18n/tr';

/** The template's rows in the app language: jobs, expenses and how to fill them in. */
export function templateRows() {
  const jobs = [
    [tr("วันส่งงาน"), tr("ชื่องาน"), tr("ลูกค้า"), tr("ประเภทงาน"), tr("มูลค่างาน (บาท)"), tr("หัก ณ ที่จ่าย (%)"), tr("สถานะ"), tr("วันที่รับเงิน"), tr("ยอดที่รับแล้ว (บาท)"), tr("เครดิต (วัน)"), tr("หมายเหตุ")],
    ['15/10/2024', tr("ออกแบบโลโก้"), tr("บริษัท ตัวอย่าง จำกัด"), 'Consulting / Advisory', 5000, 3, tr("จ่ายแล้ว"), '30/10/2024', 4850, 15, ''],
    ['20/10/2024', tr("ตัดต่อวิดีโอ"), tr("แบรนด์ตัวอย่าง A"), 'Video Production', 8000, 3, tr("มัดจำ"), '20/10/2024', 3000, 30, ''],
    ['01/11/2024', tr("ถ่ายภาพ ให้ร้านดอกไม้"), tr("ร้านตัวอย่าง"), 'Sponsored Post', 12000, 0, tr("ยังไม่จ่าย"), '', '', 30, ''],
  ];
  const expenses = [
    [tr("วันที่"), tr("รายการ"), tr("หมวดหมู่"), tr("จำนวนเงิน (บาท)"), tr("หมายเหตุ")],
    ['05/10/2024', tr("ค่าโปรแกรมตัดต่อ"), tr("ค่าอุปกรณ์/ซอฟต์แวร์"), 790, ''],
    ['12/10/2024', tr("ค่าจ้างผู้ช่วยกองถ่าย"), tr("จ้างงานต่อ (Outsource)"), 1500, ''],
  ];
  const help = [
    [tr("วิธีกรอก")],
    [tr("แต่ละแถวคือ 1 งาน หรือ 1 รายจ่าย ลบแถวตัวอย่างแล้วกรอกของคุณแทน")],
    [tr("วันที่ใช้ได้ทั้ง วว/ดด/ปปปป แบบ พ.ศ. หรือ ค.ศ. เช่น 15/10/2567 หรือ 15/10/2024")],
    [tr("สถานะ: จ่ายแล้ว / มัดจำ / ยังไม่จ่าย ถ้ามีมัดจำ ใส่ยอดที่รับแล้วด้วย")],
    [tr("มูลค่างานคือยอดก่อนหัก ณ ที่จ่าย แอปคำนวณยอดหักให้จากเปอร์เซ็นต์")],
  ];
  return { jobs, expenses, help };
}

export async function downloadImportTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const { jobs, expenses, help } = templateRows();
  const book = XLSX.utils.book_new();
  const jobSheet = XLSX.utils.aoa_to_sheet(jobs);
  jobSheet['!cols'] = [12, 26, 24, 20, 16, 16, 14, 14, 16, 12, 24].map(wch => ({ wch }));
  const expenseSheet = XLSX.utils.aoa_to_sheet(expenses);
  expenseSheet['!cols'] = [12, 28, 24, 16, 24].map(wch => ({ wch }));
  const helpSheet = XLSX.utils.aoa_to_sheet(help);
  helpSheet['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(book, jobSheet, tr("งาน"));
  XLSX.utils.book_append_sheet(book, expenseSheet, tr("รายจ่าย"));
  XLSX.utils.book_append_sheet(book, helpSheet, tr("วิธีกรอก"));
  XLSX.writeFile(book, tr("ไฟล์ตัวอย่างนำเข้า_กระรอกตุนเงิน.xlsx"));
}
