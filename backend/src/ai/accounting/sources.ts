// Where every accounting and tax fact in this folder comes from (brief "KRAROK — ACCOUNTING BRAIN & TAX NAVIGATOR",
// section 7: official sources first). `checked` is the day the page or file was read for this module; a fact whose
// source has not been read is never written into taxRules.ts as a number.

export interface Source {
  id: string;
  title: string;
  publisher: 'กรมสรรพากร' | 'กรมพัฒนาธุรกิจการค้า' | 'สภาวิชาชีพบัญชี' | 'กรมประชาสัมพันธ์';
  url: string;
  /** YYYY-MM-DD (CE) the content was read. */
  checked: string;
}

export const SOURCES: Readonly<Record<string, Source>> = {
  pnd90_2568: { id: 'pnd90_2568', title: 'วิธีกรอกแบบ ภ.ง.ด.90 ปีภาษี 2568', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/fileadmin/tax_pdf/pit/2568/Ins90_241268.pdf', checked: '2026-10-26' },
  pnd91_2568: { id: 'pnd91_2568', title: 'วิธีกรอกแบบ ภ.ง.ด.91 ปีภาษี 2568', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/fileadmin/tax_pdf/pit/2568/Ins91_241268.pdf', checked: '2026-10-26' },
  pnd94_info: { id: 'pnd94_info', title: 'มารู้จัก ภ.ง.ด.94 ภาษีเงินได้บุคคลธรรมดาครึ่งปี', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/fileadmin/user_upload/SMEs/Info-PND94-060666.pdf', checked: '2026-10-26' },
  pit_rates: { id: 'pit_rates', title: 'อัตราภาษีเงินได้บุคคลธรรมดา (ตั้งแต่ปีภาษี 2560)', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/59670.html', checked: '2026-10-26' },
  wht_order: { id: 'wht_order', title: 'คำสั่งกรมสรรพากร ท.ป.4/2528 (การหักภาษี ณ ที่จ่าย)', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/3479.html', checked: '2026-10-26' },
  vat_register: { id: 'vat_register', title: 'ผู้มีหน้าที่จดทะเบียนภาษีมูลค่าเพิ่ม และกำหนดเวลาการจดทะเบียน', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/7061.html', checked: '2026-10-26' },
  tax_invoice: { id: 'tax_invoice', title: 'คู่มือใบกำกับภาษี', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/fileadmin/user_upload/ebook/taxinvoice.pdf', checked: '2026-10-26' },
  refund_faq: { id: 'refund_faq', title: '"ขอคืนเงินภาษี" มีคำตอบ', publisher: 'กรมสรรพากร',
    url: 'https://www.rd.go.th/63437.html', checked: '2026-10-26' },
  efiling: { id: 'efiling', title: 'ระบบยื่นแบบออนไลน์ (e-Filing)', publisher: 'กรมสรรพากร',
    url: 'https://efiling.rd.go.th/rd-cms/', checked: '2026-10-26' },
  vat_rate_extension: { id: 'vat_rate_extension', title: 'ครม. ขยายเวลา VAT 7% ถึง 30 ก.ย. 2570', publisher: 'กรมประชาสัมพันธ์',
    url: 'https://www.prd.go.th/th/content/category/detail/id/33/iid/526275', checked: '2026-10-26' },
  dbd: { id: 'dbd', title: 'กรมพัฒนาธุรกิจการค้า', publisher: 'กรมพัฒนาธุรกิจการค้า', url: 'https://www.dbd.go.th/', checked: '2026-10-26' },
  tfac: { id: 'tfac', title: 'สภาวิชาชีพบัญชี', publisher: 'สภาวิชาชีพบัญชี', url: 'https://tfac.or.th/', checked: '2026-10-26' },
};

export const sourceLine = (ids: readonly string[]): string =>
  ids.map(id => SOURCES[id]).filter(Boolean).map(source => `${source.publisher}: ${source.title}`).join('; ');
