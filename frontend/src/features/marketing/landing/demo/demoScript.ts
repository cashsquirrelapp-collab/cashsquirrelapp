// The demo's script: four scenes and the keyframes inside them. Edit copy and timing here.
// Times are milliseconds from the start; a keyframe only lists what changes.

export interface DemoScene { id: string; heading: string; thai: string; start: number }

export const SCENES: DemoScene[] = [
  { id: 'overview', heading: 'See the big picture.', thai: 'งานและเงินของคุณ ในภาพเดียว', start: 0 },
  { id: 'track', heading: 'Track every payment.', thai: 'รับแล้วเท่าไหร่ ยังเหลือเท่าไหร่', start: 4200 },
  { id: 'record', heading: 'Record. Update. Done.', thai: 'บันทึกรับเงิน แล้วเห็นยอดค้างรับอัปเดต', start: 9200 },
  { id: 'result', heading: 'Stay on top of your work.', thai: 'รู้ยอดรับแล้ว และยอดที่ยังต้องตาม', start: 15400 },
];

/** Total length; the last frame is held until the viewer replays. */
export const DURATION = 20800;

export type DemoView = 'dashboard' | 'jobs';
/** What the camera frames. Each name is a `data-frame` region in the demo app; 'full' is the whole app. */
export type CamTarget = 'full' | 'summary' | 'kpi' | 'row' | 'row-start' | 'row-end' | 'sheet';
/** Where the pointer rests: a `data-cur` element, or null to hide it. */
export type CursorTarget = 'follow-video' | 'pay-badge' | 'menu-next' | 'inst-next' | 'confirm' | null;

export interface DemoFrame {
  scene: number;
  view: DemoView;
  /** Camera target on a wide stage and on a tall one (tall re-frames instead of shrinking). */
  cam: { wide: CamTarget; tall: CamTarget };
  cursor: CursorTarget;
  /** Bumps on every click, to replay the click ring. */
  clicks: number;
  spotlight: boolean; // orange frame on the job row, as the app does when you arrive from elsewhere
  callout: boolean; // ยอดงาน / รับแล้ว / คงเหลือ of the focus job
  menu: boolean;
  sheet: boolean;
  picked: boolean;
  paid: boolean;
  toast: boolean;
  kpiMark: boolean; // soft ring on the two totals the payment changed
}

type Key = { t: number; click?: boolean } & Partial<Omit<DemoFrame, 'clicks'>>;

const START: DemoFrame = {
  scene: 0, view: 'dashboard', cam: { wide: 'full', tall: 'summary' }, cursor: null, clicks: 0,
  spotlight: false, callout: false, menu: false, sheet: false, picked: false, paid: false, toast: false, kpiMark: false,
};

export const KEYS: Key[] = [
  // 1. Overview: the whole app first, then in on the month's totals.
  { t: 0 },
  { t: 2100, cam: { wide: 'summary', tall: 'kpi' } },
  // 2. From the follow-up list to the job itself.
  { t: 4200, scene: 1, cam: { wide: 'full', tall: 'summary' }, cursor: 'follow-video' },
  { t: 5200, click: true },
  { t: 5450, view: 'jobs', spotlight: true, cursor: null, cam: { wide: 'row', tall: 'row-start' } },
  { t: 6300, callout: true },
  // 3. Record the next installment, as in the app: การชำระ > รับเงินงวดถัดไป > pick > confirm.
  { t: 9200, scene: 2, spotlight: false, cursor: 'pay-badge', cam: { wide: 'row', tall: 'row-end' } },
  { t: 10000, click: true, menu: true },
  { t: 10450, cursor: 'menu-next' },
  { t: 11050, click: true, menu: false, sheet: true, cam: { wide: 'sheet', tall: 'sheet' } },
  { t: 11900, cursor: 'inst-next' },
  { t: 12500, click: true, picked: true },
  { t: 13050, cursor: 'confirm' },
  { t: 13700, click: true, paid: true, sheet: false, toast: true, cursor: null, cam: { wide: 'row', tall: 'row-end' } },
  // 4. Back to the overview with the same data, updated.
  { t: 15400, scene: 3, view: 'dashboard', toast: false, callout: false, cam: { wide: 'full', tall: 'summary' } },
  { t: 16900, cam: { wide: 'summary', tall: 'kpi' }, kpiMark: true },
];

/** Index of the last keyframe at or before `ms`. */
export function keyIndexAt(ms: number): number {
  let index = 0;
  for (let i = 0; i < KEYS.length; i++) if (KEYS[i].t <= ms) index = i;
  return index;
}

/** The frame after applying every keyframe up to `index`. Pure: the same index always gives the same frame. */
export function frameAt(index: number): DemoFrame {
  const frame: DemoFrame = { ...START };
  for (let i = 0; i <= Math.min(index, KEYS.length - 1); i++) {
    const { t: _t, click, ...patch } = KEYS[i];
    Object.assign(frame, patch);
    if (click) frame.clicks += 1;
  }
  return frame;
}

/** The settled picture of a scene: its last keyframe, with no pointer or open menu. For reduced motion. */
export function sceneStill(scene: number): DemoFrame {
  const next = SCENES[scene + 1]?.start ?? DURATION + 1;
  const frame = frameAt(keyIndexAt(next - 1));
  return { ...frame, cursor: null, menu: false, sheet: false, toast: false };
}
