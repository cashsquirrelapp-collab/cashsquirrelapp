// Thai banks offered in the issuer profile. Only names and short codes are used -- no logos or
// brand colours, so nothing here depends on a bank's trademarked artwork.
export interface ThaiBank {
  name: string; // stored in issuer.bankName and printed on documents
  code: string; // short code shown as a neutral chip
}

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
