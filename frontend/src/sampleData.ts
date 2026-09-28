import { Job, Goal, Expense, AppSettings } from '../../shared/types';

export const defaultSettings: AppSettings = {
  monthlyExpense: 12000,
  monthlyRevenueGoal: 35000,
  savingsPercentage: 40,
  accumulatedRemainder: 0,
};

// New accounts start with no jobs/goals -- a blank slate to fill in themselves, not
// someone else's example data.
export const defaultJobs: Job[] = [];

export const defaultGoals: Goal[] = [];

const toISODate = (d: Date): string => d.toISOString().split('T')[0];
const addDays = (base: Date, days: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

// Demo/guest-mode data ("ทดลองใช้งานระบบฟรี") -- built fresh (relative to today) each time it's
// requested rather than exported as a static constant, so job/expense dates always land in the
// current month and the dashboard/reports look alive instead of stuck in whatever month this was
// written. Guest sessions never persist edits (see App.tsx), so every fresh visit calls this again
// and gets the same untouched scenario back.
export function buildSampleData(): { jobs: Job[]; goals: Goal[]; expenses: Expense[]; settings: AppSettings } {
  const today = new Date();

  const jobs: Job[] = [
    {
      id: 'demo-job-1',
      name: 'ถ่ายรีวิวสินค้า - ครีมกันแดด',
      type: 'Sponsored Post',
      client: 'บริษัท เนเจอร์กลาส จำกัด',
      value: 15000,
      received: 15000,
      pending: 0,
      status: 'done',
      creditTerm: 30,
      startDate: toISODate(addDays(today, -20)),
      postDate: toISODate(addDays(today, -14)),
      isPosted: true,
      payDate: toISODate(addDays(today, -7)),
      dueDate: toISODate(addDays(today, -7)),
      paymentStatus: 'paid',
      note: 'จ่ายผ่านโอนธนาคารครบแล้ว ลูกค้าประจำ',
    },
    {
      id: 'demo-job-2',
      name: 'ผลิตคลิปโฆษณา TikTok',
      type: 'Video Production',
      client: 'ร้านกาแฟ Brew Days',
      value: 8000,
      received: 4000,
      pending: 4000,
      status: 'partial',
      creditTerm: 15,
      startDate: toISODate(addDays(today, -10)),
      postDate: toISODate(addDays(today, -5)),
      isPosted: true,
      payDate: toISODate(addDays(today, 10)),
      dueDate: toISODate(addDays(today, 10)),
      paymentStatus: 'partial',
      note: 'มัดจำมาแล้วครึ่งหนึ่ง ที่เหลือรอตัดจบ',
    },
    {
      id: 'demo-job-3',
      name: 'ที่ปรึกษาการตลาดออนไลน์',
      type: 'Consulting / Advisory',
      client: 'ห้างหุ้นส่วน ผ้าไหมไทยแลนด์',
      value: 12000,
      received: 0,
      pending: 12000,
      status: 'pending',
      creditTerm: 30,
      startDate: toISODate(addDays(today, -35)),
      postDate: toISODate(addDays(today, -32)),
      isPosted: true,
      payDate: toISODate(addDays(today, -2)),
      dueDate: toISODate(addDays(today, -2)),
      paymentStatus: 'unpaid',
      note: 'เลยกำหนดชำระแล้ว รอติดตามทวงถาม',
    },
    {
      id: 'demo-job-4',
      name: 'ถ่ายภาพสินค้าสำหรับลง e-commerce',
      type: 'Sponsored Post',
      client: 'ร้าน Cozy Home Decor',
      value: 6000,
      received: 0,
      pending: 0,
      status: 'pending',
      creditTerm: 15,
      startDate: toISODate(addDays(today, -1)),
      isPosted: false,
      payDate: null,
      dueDate: null,
      paymentStatus: 'unpaid',
      note: 'อยู่ระหว่างเตรียมงาน ยังไม่ส่งมอบ',
    },
  ];

  const goals: Goal[] = [
    {
      id: 'demo-goal-1',
      name: 'กองทุนฉุกเฉิน',
      type: 'emergency',
      target: 50000,
      current: 12000,
      deadline: toISODate(addDays(today, 180)),
      emoji: '🛟',
      bg: '#FEF3C7',
      acc: '#D97706',
      allocatedPercentage: 25,
    },
    {
      id: 'demo-goal-2',
      name: 'อัปเกรดกล้องทำงาน',
      type: 'buy',
      target: 30000,
      current: 8000,
      deadline: toISODate(addDays(today, 90)),
      emoji: '📷',
      bg: '#DBEAFE',
      acc: '#2563EB',
      allocatedPercentage: 15,
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'demo-expense-1',
      name: 'ค่าเช่าซอฟต์แวร์ตัดต่อวิดีโอ',
      category: 'Equipment',
      amount: 1500,
      date: toISODate(addDays(today, -6)),
      note: 'Adobe Premiere Pro รายเดือน',
    },
    {
      id: 'demo-expense-2',
      name: 'ค่าเดินทางไปถ่ายงานลูกค้า',
      category: 'Travel',
      amount: 350,
      date: toISODate(addDays(today, -3)),
      note: '',
    },
  ];

  return { jobs, goals, expenses, settings: { ...defaultSettings } };
}
