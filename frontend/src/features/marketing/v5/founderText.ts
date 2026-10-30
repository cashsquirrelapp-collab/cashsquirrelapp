// "Behind Krarok", the founder's own story (owner, 2026-10-31: "อันนี้คือหน้าของแรงบันดาลใจของกู ... เอาไปใส่ในหน้า landing
// page ... เว้น space เอาไว้สำหรับใส่รูปภาพ"). The Thai is the owner's text as written; the English follows it closely.
// **…** marks the words the owner set in bold. Photos come from the owner: put the file in public/founder/ and set `src`;
// until then the page shows a marked space saying which photo goes there.

export type Lang = 'th' | 'en';
export type Text = Record<Lang, string>;

export interface PhotoSlot {
  id: string;
  /** CSS aspect-ratio of the frame. */
  ratio: '4 / 5' | '4 / 3' | '16 / 9' | '3 / 2' | '1 / 1';
  title: Text;
  hint: Text;
  size: Text;
  /** The owner's photo, e.g. '/founder/portrait.jpg'. Empty: the marked space shows. */
  src?: string;
}

export type Block =
  | { kind: 'p'; text: Text }
  | { kind: 'quote'; text: Text }
  | { kind: 'photo'; slot: PhotoSlot; caption?: Text };

export interface Section { n: string; title: Text; blocks: Block[] }

export const PHOTOS = {
  portrait: {
    id: 'portrait', ratio: '4 / 5',
    title: { th: 'รูปปาร์ค (ภาพหลัก)', en: 'Park (main photo)' },
    hint: { th: 'ภาพครึ่งตัว หน้าตรงหรือเฉียงเล็กน้อย พื้นหลังโล่ง เช่น ที่โต๊ะตัดต่อ', en: 'Half-length, facing the camera or slightly turned, a plain background such as the editing desk' },
    size: { th: 'แนวตั้ง 4:5 · 1600 × 2000 px', en: 'Portrait 4:5 · 1600 × 2000 px' },
  },
  grandma: {
    id: 'grandma', ratio: '4 / 3',
    title: { th: 'ยายกับเครื่องกรองน้ำ', en: 'Grandma and the water filter' },
    hint: { th: 'ภาพยาย หรือปาร์คกับยาย คู่กับเครื่องกรองน้ำที่ซื้อจากเงินงานตัดต่อ', en: 'Grandma, or Park with her, beside the water filter bought with the editing money' },
    size: { th: 'แนวนอน 4:3 · 1600 × 1200 px', en: 'Landscape 4:3 · 1600 × 1200 px' },
  },
  desk: {
    id: 'desk', ratio: '16 / 9',
    title: { th: 'ช่วงที่งานเยอะจนเอกสารล้นมือ', en: 'When the work piled up' },
    hint: { th: 'โต๊ะทำงานกับใบเสร็จ เอกสาร หรือหน้าจอตัดต่อ ช่วงที่ต้องจัดการบัญชีเอง', en: 'The desk with receipts, papers or the editing screen, from the days of doing the books alone' },
    size: { th: 'แนวนอน 16:9 · 1920 × 1080 px', en: 'Landscape 16:9 · 1920 × 1080 px' },
  },
  night: {
    id: 'night', ratio: '16 / 9',
    title: { th: 'คืนที่ทำงานถึงตี 3–4', en: 'The nights until 3 or 4 am' },
    hint: { th: 'ภาพทำงานตอนดึก หน้าจอที่กำลังสร้าง Krarok', en: 'Working late, with Krarok being built on the screen' },
    size: { th: 'แนวนอน 16:9 · 1920 × 1080 px', en: 'Landscape 16:9 · 1920 × 1080 px' },
  },
  team: {
    id: 'team', ratio: '3 / 2',
    title: { th: 'ทีม Krarok', en: 'The Krarok team' },
    hint: { th: 'ปาร์คกับเพื่อนร่วมทีมอีกสองคน', en: 'Park with the two teammates' },
    size: { th: 'แนวนอน 3:2 · 1800 × 1200 px', en: 'Landscape 3:2 · 1800 × 1200 px' },
  },
  sign: {
    id: 'sign', ratio: '1 / 1',
    title: { th: 'รูปปาร์คท้ายบทความ', en: 'Park, at the end' },
    hint: { th: 'ภาพยิ้ม ๆ ใช้คู่กับลายเซ็น', en: 'A smiling photo to go with the signature' },
    size: { th: 'จัตุรัส 1:1 · 1200 × 1200 px', en: 'Square 1:1 · 1200 × 1200 px' },
  },
} satisfies Record<string, PhotoSlot>;

export const HERO = {
  eyebrow: 'BEHIND KRAROK · A STORY FROM THE FOUNDER',
  title: { th: 'จากปัญหาที่ผมเคยเจอ สู่สิ่งที่อยากสร้างให้ทุกคน', en: 'From a problem I once had, to something I want to build for everyone' },
  lead: { th: 'ผมเริ่มสร้าง Krarok เพราะอยากแก้ปัญหาของตัวเอง แต่วันนี้ผมอยากให้มันช่วยแก้ปัญหาให้คนอื่นได้ด้วย', en: 'I started building Krarok to solve my own problem. Today I want it to solve other people’s problems too.' },
  hello: { th: 'สวัสดีครับ ผมปาร์ค นพรัตน์ นาวะบุตร ผู้ก่อตั้งกระรอกตุนเงิน (Krarok)', en: 'Hello, I’m Park, Noppharat Navabut, the founder of Krarok (กระรอกตุนเงิน).' },
} as const;

export const SECTIONS: Section[] = [
  { n: '01', title: { th: 'จุดเริ่มต้นของผม', en: 'Where I started' }, blocks: [
    { kind: 'p', text: { th: 'ผมเริ่มต้นจากการเป็นคอนเทนต์ครีเอเตอร์และฟรีแลนซ์รับงานตัดต่อวิดีโอคนหนึ่ง ที่ค่อย ๆ สร้างรายได้จากสิ่งที่ตัวเองรัก',
      en: 'I started out as a content creator and a freelance video editor, slowly earning a living from what I love.' } },
    { kind: 'p', text: { th: 'ก่อนหน้านี้ ผมเคยตั้งเป้าหมายว่าจะหาเงินจากงานตัดต่อเพื่อซื้อเครื่องกรองน้ำให้ยาย และผมก็ทำสำเร็จภายในเวลาเพียง 3 เดือน',
      en: 'Some time ago I set myself a goal: to earn enough from editing to buy my grandma a water filter. I did it in just 3 months.' } },
    { kind: 'photo', slot: PHOTOS.grandma },
    { kind: 'p', text: { th: 'สำหรับบางคนอาจเป็นเป้าหมายเล็ก ๆ แต่สำหรับผม มันเป็นความสำเร็จที่มีความหมายมาก เพราะทำให้ผมเชื่อว่า **สิ่งที่เคยเป็นเพียงความคิด สามารถกลายเป็นความจริงได้ หากเรากล้าลงมือทำ**',
      en: 'To some it may be a small goal, but to me it meant a great deal, because it made me believe that **what was once only an idea can become real, if we dare to start.**' } },
    { kind: 'p', text: { th: 'และความเชื่อครั้งนั้นก็กลายเป็นแรงผลักดันให้ผมกล้าเริ่มต้นทำสิ่งใหม่ ๆ ในชีวิต',
      en: 'That belief became what pushed me to try new things in my life.' } },
  ] },
  { n: '02', title: { th: 'ปัญหาที่ทำให้เกิด Krarok', en: 'The problem behind Krarok' }, blocks: [
    { kind: 'p', text: { th: 'เมื่อเริ่มรับงานมากขึ้น ผมพบว่าการทำงานให้ลูกค้าไม่ใช่เรื่องเดียวที่ต้องรับผิดชอบ แต่ยังมีเรื่องบัญชีและเอกสารที่ต้องจัดการด้วยตัวเอง',
      en: 'As the jobs grew, I found that the work for clients was not the only thing I was responsible for. There were also the books and the paperwork to handle myself.' } },
    { kind: 'p', text: { th: 'ทั้งใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จรับเงิน รายรับรายจ่าย และเครดิตเทอมที่ต้องรอเงินอีก 30–60 วัน',
      en: 'Quotations, invoices, receipts, income and spending, and credit terms that meant waiting another 30–60 days to be paid.' } },
    { kind: 'p', text: { th: 'บางครั้งส่งงานเสร็จแล้วแต่ยังไม่ได้รับเงิน บางครั้งจำไม่ได้ว่างานไหนได้เงินแล้ว งานไหนยังต้องติดตาม หรือเอกสารอะไรที่ต้องส่งให้ลูกค้า',
      en: 'Sometimes the work was delivered but not yet paid. Sometimes I couldn’t remember which jobs had been paid, which I still had to chase, or what documents a client needed.' } },
    { kind: 'photo', slot: PHOTOS.desk },
    { kind: 'p', text: { th: 'ผมแค่อยากรู้ว่าเดือนนี้มีรายได้เท่าไร ยังมีเงินรอรับอีกเท่าไร และสุดท้ายเหลือกำไรจริง ๆ เท่าไร แต่กว่าจะเห็นภาพทั้งหมดกลับต้องใช้เวลาไม่น้อย',
      en: 'I just wanted to know how much I earned this month, how much was still to come, and how much real profit was left in the end. Yet getting the whole picture took a lot of time.' } },
    { kind: 'p', text: { th: 'จนผมเริ่มตั้งคำถามว่า', en: 'Until I started to ask myself:' } },
    { kind: 'quote', text: { th: 'ทำไมการทำบัญชีด้วยตัวเองถึงต้องยุ่งยากขนาดนี้ แล้วถ้ามีผู้ช่วยคอยจัดการเรื่องเหล่านี้ให้จะดีแค่ไหน?',
      en: 'Why does doing your own books have to be this hard? And how good would it be to have an assistant take care of all this?' } },
    { kind: 'p', text: { th: 'คำถามนี้เองที่กลายเป็นจุดเริ่มต้นของ **กระรอกตุนเงิน (Krarok)**', en: 'That question became the beginning of **Krarok (กระรอกตุนเงิน)**.' } },
  ] },
  { n: '03', title: { th: '5 เดือนแห่งการลงมือสร้าง', en: 'Five months of building' }, blocks: [
    { kind: 'p', text: { th: 'ในปี 2026 ผมตัดสินใจเริ่มต้นทำสิ่งที่ไม่เคยทำมาก่อน นั่นคือการสร้างแอปพลิเคชันของตัวเองขึ้นมาจากศูนย์',
      en: 'In 2026 I decided to do something I had never done before: build my own app from scratch.' } },
    { kind: 'p', text: { th: 'ผมไม่ได้เรียนด้านการพัฒนาซอฟต์แวร์มาโดยตรง แต่ผมเชื่อว่าเราไม่จำเป็นต้องเก่งทุกอย่างตั้งแต่วันแรก ถึงจะเริ่มทำสิ่งที่อยากทำได้',
      en: 'I never studied software development, but I believe we don’t have to be good at everything on day one to start doing what we want to do.' } },
    { kind: 'p', text: { th: 'ตลอดระยะเวลาประมาณ 5 เดือน ผมใช้เวลาแทบทุกวันไปกับการคิด ออกแบบ พัฒนา ทดลอง และแก้ไขข้อผิดพลาด',
      en: 'For about five months I spent nearly every day thinking, designing, building, testing and fixing mistakes.' } },
    { kind: 'photo', slot: PHOTOS.night },
    { kind: 'p', text: { th: 'หลายคืนผมทำงานจนถึงตี 3–4 บางครั้งต้องกลับมาเริ่มใหม่ เพราะสิ่งที่ทำยังไม่ดีพออย่างที่ตั้งใจ',
      en: 'Many nights I worked until 3 or 4 in the morning. Sometimes I had to start over, because what I had made was not yet as good as I meant it to be.' } },
    { kind: 'p', text: { th: 'ระหว่างทางไม่ได้ราบรื่นเสมอไป มีทั้งความผิดพลาด ความท้อ และสิ่งที่ต้องกลับไปเรียนรู้ใหม่',
      en: 'The way was not always smooth. There were mistakes, moments of giving up, and things I had to go back and learn again.' } },
    { kind: 'p', text: { th: 'แต่ทุกครั้งที่แก้ปัญหาได้ ผมก็เห็นว่าสิ่งที่เคยอยู่แค่ในความคิดกำลังค่อย ๆ กลายเป็นผลิตภัณฑ์ที่ใช้งานได้จริง',
      en: 'But every time I solved a problem, I could see what had lived only in my head slowly becoming a product people could really use.' } },
    { kind: 'quote', text: { th: 'จากเด็กคนหนึ่งที่เคยตั้งใจหาเงินซื้อเครื่องกรองน้ำให้ยาย วันนี้ผมกำลังพยายามสร้างบางสิ่งที่อาจช่วยให้ชีวิตของคนอื่นง่ายขึ้นได้ด้วย',
      en: 'From a kid who once set out to earn a water filter for his grandma, today I am trying to build something that might make other people’s lives easier too.' } },
    { kind: 'photo', slot: PHOTOS.team },
    { kind: 'p', text: { th: 'และผมอยากขอบคุณเพื่อนร่วมทีมอีกสองคนที่คอยช่วยดูแลระบบหลังบ้าน ทดสอบ และตรวจสอบข้อผิดพลาดต่าง ๆ',
      en: 'And I want to thank my two teammates, who help look after the system behind the scenes, test it and catch mistakes.' } },
    { kind: 'p', text: { th: 'ขอบคุณมากจริง ๆ ครับที่เข้ามาเป็นส่วนหนึ่งของการเดินทางครั้งนี้ และช่วยกันทำให้ Krarok ดีขึ้น',
      en: 'Thank you so much for being part of this journey and for helping make Krarok better.' } },
  ] },
  { n: '04', title: { th: 'ทำไมผมถึงอยากสร้าง Krarok ให้ทุกคน', en: 'Why I want to build Krarok for everyone' }, blocks: [
    { kind: 'quote', text: { th: 'คนทำบัญชีคนเดียว ก็ควรมีผู้ช่วยดี ๆ ได้เหมือนบริษัทใหญ่', en: 'Someone who does the books alone deserves a good assistant, just like a big company.' } },
    { kind: 'p', text: { th: 'นี่คือแนวคิดที่ผมอยากให้เป็นหัวใจของ Krarok', en: 'This is the idea I want at the heart of Krarok.' } },
    { kind: 'p', text: { th: 'ผมเข้าใจดีว่าฟรีแลนซ์ ครีเอเตอร์ และคนที่ต้องจัดการบัญชีด้วยตัวเอง ไม่ได้มีทีมการเงินหรือคนคอยช่วยจัดการเอกสารอยู่ตลอดเวลา',
      en: 'I know that freelancers, creators and people who manage their own accounts don’t have a finance team or anyone handling their paperwork all the time.' } },
    { kind: 'p', text: { th: 'หลายคนเก่งในสิ่งที่ตัวเองทำ แต่ไม่ได้มีพื้นฐานด้านบัญชี และไม่ควรต้องเสียเวลาเรียนรู้ทุกอย่างเพียงเพื่อจะรู้ว่าเงินของตัวเองอยู่ตรงไหน',
      en: 'Many are great at what they do but have no background in accounting, and they shouldn’t have to learn everything just to know where their money is.' } },
    { kind: 'p', text: { th: 'ผมจึงอยากให้ Krarok เป็นเครื่องมือที่ช่วยให้การจัดการงาน เอกสาร รายรับรายจ่าย และเงินค้างรับเป็นเรื่องง่ายขึ้น',
      en: 'So I want Krarok to be a tool that makes jobs, documents, income and spending, and money still owed easier to manage.' } },
    { kind: 'p', text: { th: 'ให้คุณรู้ว่างานไหนยังไม่ได้รับเงิน งานไหนใกล้ถึงกำหนด และมองเห็นภาพรวมของตัวเองได้ในที่เดียว',
      en: 'So you know which jobs haven’t been paid, which are nearly due, and can see your whole picture in one place.' } },
    { kind: 'p', text: { th: '**เพราะผมเชื่อว่าเวลาของคุณควรได้ใช้ไปกับการสร้างผลงาน การเติบโต และการทำสิ่งที่รัก มากกว่าการคอยกังวลกับเรื่องเอกสารและบัญชี**',
      en: '**Because I believe your time should go to creating, growing and doing what you love, not to worrying about paperwork and accounts.**' } },
  ] },
  { n: '05', title: { th: 'อนาคตที่ผมอยากสร้างให้ Krarok', en: 'The future I want for Krarok' }, blocks: [
    { kind: 'p', text: { th: 'สำหรับผม Krarok ไม่ใช่แค่แอปบันทึกรายรับรายจ่ายหรือเครื่องมือออกเอกสารเท่านั้น',
      en: 'To me, Krarok isn’t only an app for income and spending, or a tool for making documents.' } },
    { kind: 'p', text: { th: 'ผมอยากพัฒนาให้ Krarok กลายเป็น **ผู้ช่วยด้านงานและการเงินที่คุณสามารถพึ่งพาได้ในทุกวัน**',
      en: 'I want Krarok to become **a work and money assistant you can rely on every day.**' } },
    { kind: 'p', text: { th: 'ในอนาคต ผมอยากให้เลขากระรอกสามารถรับคำสั่งด้วยภาษาธรรมดา เหมือนคุณกำลังพูดคุยกับผู้ช่วยส่วนตัว ไม่ว่าจะให้ช่วยบันทึกงาน เตรียมใบเสนอราคา สรุปรายรับรายจ่าย หรือตรวจสอบว่าโปรเจกต์ไหนยังไม่ได้รับเงิน',
      en: 'In the future I want Krarok Secretary to take everyday words, as if you were talking to a personal assistant: recording a job, preparing a quotation, summing up income and spending, or checking which projects haven’t been paid yet.' } },
    { kind: 'p', text: { th: 'รวมถึงพัฒนาระบบแจ้งเตือนเครดิตเทอมผ่าน LINE และอีเมล เพื่อช่วยให้คุณไม่พลาดกำหนดรับเงินที่สำคัญ',
      en: 'And to grow the credit-term reminders through LINE and email, so you never miss an important payment date.' } },
    { kind: 'p', text: { th: 'และเมื่อ Krarok เติบโตขึ้น ผมอยากขยายความสามารถให้รองรับทีมขนาดเล็ก ธุรกิจที่กำลังเติบโต และนิติบุคคลในอนาคต',
      en: 'And as Krarok grows, I want it to support small teams, growing businesses and companies in the future.' } },
    { kind: 'p', text: { th: 'ทั้งหมดนี้เป็นเป้าหมายที่ผมตั้งใจจะค่อย ๆ พัฒนาและเปิดให้ใช้งานตามความพร้อมของระบบ',
      en: 'These are goals I intend to build step by step and open as the system is ready.' } },
    { kind: 'quote', text: { th: 'ผมไม่ได้อยากสร้างแอปที่มีฟีเจอร์มากที่สุด แต่อยากสร้างแอปที่ช่วยให้คุณเหนื่อยน้อยลง และมีเวลาไปทำสิ่งที่สำคัญกับชีวิตมากขึ้น',
      en: 'I don’t want to build the app with the most features. I want to build the app that leaves you less tired, with more time for what matters in your life.' } },
  ] },
  { n: '06', title: { th: 'ความไว้วางใจของคุณ คือความรับผิดชอบของเรา', en: 'Your trust is our responsibility' }, blocks: [
    { kind: 'p', text: { th: 'ผมเข้าใจดีว่าข้อมูลรายได้ รายจ่าย และเอกสารสำคัญของทุกคนเป็นเรื่องละเอียดอ่อน',
      en: 'I know that everyone’s income, spending and important documents are sensitive.' } },
    { kind: 'p', text: { th: 'การที่ใครสักคนเลือกใช้ Krarok จึงไม่ใช่เพียงการสมัครใช้งานแอปหนึ่ง แต่หมายถึงการที่เขากำลังให้โอกาสเราเข้ามาช่วยดูแลส่วนหนึ่งของงานและการเงินของเขา',
      en: 'So when someone chooses Krarok, it isn’t just signing up for an app. It means they are giving us the chance to help look after part of their work and their money.' } },
    { kind: 'p', text: { th: '**ผมไม่อยากให้คุณเชื่อมั่นใน Krarok เพียงเพราะคำพูดของผม แต่อยากให้ความเชื่อมั่นนั้นเกิดจากประสบการณ์ใช้งานจริง ความโปร่งใส และความรับผิดชอบเมื่อเกิดปัญหา**',
      en: '**I don’t want you to trust Krarok just because of my words. I want that trust to come from real use, from openness, and from how we take responsibility when something goes wrong.**' } },
    { kind: 'p', text: { th: 'ผมรู้ดีว่าในช่วงเริ่มต้น Krarok อาจยังไม่สมบูรณ์แบบทุกอย่าง อาจมีข้อผิดพลาดหรือบางฟีเจอร์ที่ยังต้องปรับปรุง',
      en: 'I know that in these early days Krarok may not be perfect. There may be mistakes, or features that still need work.' } },
    { kind: 'p', text: { th: 'แต่ผมตั้งใจที่จะรับฟังทุกความคิดเห็น และไม่ปล่อยให้ปัญหาของผู้ใช้ถูกมองข้าม',
      en: 'But I mean to listen to every comment, and never let a user’s problem be overlooked.' } },
    { kind: 'p', text: { th: 'หากคุณพบข้อผิดพลาด มีข้อเสนอแนะ หรืออยากให้เราปรับปรุงอะไร สามารถส่งมาบอกเราได้โดยตรง',
      en: 'If you find a mistake, have a suggestion, or want us to improve something, you can tell us directly.' } },
    { kind: 'p', text: { th: 'ผมและทีมจะพยายามตรวจสอบ จัดลำดับความสำคัญ และแก้ไขปัญหาให้ดีที่สุด พร้อมสื่อสารอย่างตรงไปตรงมา',
      en: 'The team and I will look into it, set priorities and fix things as well as we can, and we will be straightforward about it.' } },
    { kind: 'p', text: { th: '**ผมอยากให้ทุกคนรู้ว่า เบื้องหลัง Krarok มีคนที่ตั้งใจรับฟัง ดูแล และพัฒนาผลิตภัณฑ์นี้อยู่จริง ๆ**',
      en: '**I want everyone to know that behind Krarok there are real people listening, caring and building this product.**' } },
  ] },
  { n: '07', title: { th: 'ขอบคุณที่เป็นส่วนหนึ่งของการเริ่มต้น', en: 'Thank you for being part of the beginning' }, blocks: [
    { kind: 'p', text: { th: 'จากวันที่ผมตั้งใจหาเงินซื้อเครื่องกรองน้ำให้ยาย จนถึงวันที่เริ่มสร้าง Krarok สิ่งหนึ่งที่ผมได้เรียนรู้คือ เราไม่จำเป็นต้องพร้อมทุกอย่างก่อนที่จะลงมือทำ',
      en: 'From the day I set out to buy my grandma a water filter to the day I started building Krarok, one thing I learned is that we don’t need to be fully ready before we begin.' } },
    { kind: 'p', text: { th: 'บางครั้งเราอาจล้มเหลวสิบครั้ง ยี่สิบครั้ง หรือมากกว่านั้น และไม่มีใครรู้ว่าความสำเร็จจะเกิดขึ้นเมื่อไร',
      en: 'Sometimes we fail ten times, twenty times or more, and no one knows when success will come.' } },
    { kind: 'p', text: { th: 'แต่ทุกครั้งที่ได้ลอง เราจะได้เรียนรู้บางสิ่งที่จะทำให้เรากลับมาเริ่มต้นใหม่ได้ดีกว่าเดิม',
      en: 'But every try teaches us something that lets us start again better than before.' } },
    { kind: 'p', text: { th: 'วันนี้ผมเองก็ยังอยู่ระหว่างทาง ยังมีอีกหลายอย่างที่ต้องเรียนรู้ และอีกหลายสิ่งที่อยากพัฒนาให้ Krarok ดีขึ้น',
      en: 'I am still on the way myself. There is a lot left to learn, and a lot I want to make better in Krarok.' } },
    { kind: 'p', text: { th: 'แต่หาก Krarok ช่วยให้ใครสักคนจัดการบัญชีได้ง่ายขึ้น ไม่ต้องกังวลกับเอกสาร หรือมีเวลาไปทำสิ่งที่รักมากขึ้น',
      en: 'But if Krarok helps someone manage their books more easily, stop worrying about paperwork, or find more time for what they love,' } },
    { kind: 'p', text: { th: 'สำหรับผม นั่นก็เป็นความสำเร็จที่มีความหมายมากแล้วครับ', en: 'then to me, that is already a success that means a great deal.' } },
    { kind: 'p', text: { th: 'หากคุณกำลังเหนื่อยกับการจัดการบัญชีด้วยตัวเอง ผมอยากชวนให้ลองใช้กระรอกตุนเงิน แล้วบอกเราว่าสิ่งไหนช่วยคุณได้ และสิ่งไหนที่เราควรทำให้ดีขึ้น',
      en: 'If you are tired of doing your books alone, I’d like to invite you to try Krarok, and tell us what helps you and what we should do better.' } },
    { kind: 'p', text: { th: 'ผมไม่ได้อยากให้ Krarok เป็นเพียงแอปที่คุณเปิดขึ้นมาใช้งาน แต่อยากให้มันเป็นผู้ช่วยที่คุณเชื่อมั่น และเติบโตไปพร้อมกับคุณในระยะยาว',
      en: 'I don’t want Krarok to be just an app you open. I want it to be an assistant you trust, one that grows with you for the long run.' } },
    { kind: 'p', text: { th: 'ขอบคุณทุกคนที่ให้โอกาสความตั้งใจเล็ก ๆ ของผมได้เริ่มต้นครับ', en: 'Thank you, everyone, for giving my small intention the chance to begin.' } },
    { kind: 'p', text: { th: 'แล้วมาทำให้เรื่องบัญชีเป็นเรื่องง่ายไปด้วยกันนะครับ', en: 'Let’s make the books easy, together.' } },
  ] },
];

export const SIGN = {
  with: { th: 'ด้วยความตั้งใจ', en: 'With all my heart,' },
  name: { th: 'นพรัตน์ นาวะบุตร (Park)', en: 'Noppharat Navabut (Park)' },
  role: 'Founder of Krarok',
  tagline: 'Built from a real problem. Made for real people.',
} as const;
