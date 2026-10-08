// Thai banks offered in the issuer profile. Each bank's own logo (from the open
// casperstack/thai-banks-logo set, kept locally in public/banks/) identifies it in the picker and
// on documents; a bank without a logo file falls back to its short code.
export interface ThaiBank {
  name: string; // stored in issuer.bankName and printed on documents
  code: string; // short code, shown when there is no logo
}

const WITH_LOGO = new Set(['BBL', 'KBANK', 'KTB', 'SCB', 'TTB', 'BAY', 'UOB', 'CIMB', 'LHBANK', 'TISCO', 'KKP', 'ICBC', 'GSB', 'GHB', 'BAAC', 'ISBT']);

/** Same-origin logo path for a bank, or null when there is no logo file. */
export const thaiBankLogo = (bank: ThaiBank | undefined): string | null =>
  bank && WITH_LOGO.has(bank.code) ? `/banks/${bank.code}.png` : null;

export const THAI_BANKS: ThaiBank[] = [
  { name: 'ธนาคารกรุงเทพ', code: 'BBL' },
  { name: 'ธนาคารกสิกรไทย', code: 'KBANK' },
  { name: 'ธนาคารกรุงไทย', code: 'KTB' },
  { name: 'ธนาคารไทยพาณิชย์', code: 'SCB' },
  { name: 'ธนาคารทหารไทยธนชาต', code: 'TTB' },
  { name: 'ธนาคารกรุงศรีอยุธยา', code: 'BAY' },
  { name: 'ธนาคารยูโอบี', code: 'UOB' },
  { name: 'ธนาคารซีไอเอ็มบี ไทย', code: 'CIMB' },
  { name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', code: 'LHBANK' },
  { name: 'ธนาคารทิสโก้', code: 'TISCO' },
  { name: 'ธนาคารเกียรตินาคินภัทร', code: 'KKP' },
  { name: 'ธนาคารไอซีบีซี (ไทย)', code: 'ICBC' },
  { name: 'ธนาคารสแตนดาร์ดชาร์เตอร์ด (ไทย)', code: 'SCBT' },
  { name: 'ธนาคารออมสิน', code: 'GSB' },
  { name: 'ธนาคารอาคารสงเคราะห์', code: 'GHB' },
  { name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)', code: 'BAAC' },
  { name: 'ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย', code: 'EXIM' },
  { name: 'ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย', code: 'SME D' },
  { name: 'ธนาคารอิสลามแห่งประเทศไทย', code: 'ISBT' }
];

export const findThaiBank = (name: string | undefined): ThaiBank | undefined =>
  name ? THAI_BANKS.find(bank => bank.name === name) : undefined;
