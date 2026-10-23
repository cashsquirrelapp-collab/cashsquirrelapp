import { MascotMood } from './components/mascot/Mascot';

/** How a notification reads: it picks the icon and colour, and whether it is announced as an alert. */
export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface MascotToastEvent {
  id: string;
  mood: MascotMood;
  /** Short heading, e.g. "บันทึกการแก้ไขแล้ว". Falls back to a generic heading for the tone. */
  title?: string;
  message: string;
  /** Defaults from the mood: happy/celebrate = success, alert = warning, sleepy = info. */
  tone?: ToastTone;
  duration?: number;
  /** Set for a payment-received moment: the amount is shown on its own line. */
  amount?: number;
}

type MascotBusListener = (event: MascotToastEvent) => void;
type FireOptions = { mood: MascotMood; title?: string; message: string; tone?: ToastTone; duration?: number; amount?: number };

class MascotBus {
  private listeners: Set<MascotBusListener> = new Set();

  subscribe(listener: MascotBusListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  fire({ mood, title, message, tone, duration = 4000, amount }: FireOptions) {
    const event: MascotToastEvent = {
      id: Math.random().toString(36).substring(2, 9),
      mood,
      title,
      message,
      tone,
      duration,
      amount,
    };
    this.listeners.forEach((listener) => listener(event));
  }
}

export const mascotBus = new MascotBus();

export function fireMascot(options: FireOptions) {
  mascotBus.fire(options);
}
