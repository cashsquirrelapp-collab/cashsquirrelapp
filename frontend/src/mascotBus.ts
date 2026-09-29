import { MascotMood } from './components/mascot/Mascot';

export interface MascotToastEvent {
  id: string;
  mood: MascotMood;
  message: string;
  duration?: number;
  /** Set for a payment-received moment (Quick Payment Success) -- renders the coin-pop/settle
   * sequence and "รับเงิน ฿X แล้ว" line instead of the plain toast layout. */
  amount?: number;
}

type MascotBusListener = (event: MascotToastEvent) => void;

class MascotBus {
  private listeners: Set<MascotBusListener> = new Set();

  subscribe(listener: MascotBusListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  fire({ mood, message, duration = 4000, amount }: { mood: MascotMood; message: string; duration?: number; amount?: number }) {
    const event: MascotToastEvent = {
      id: Math.random().toString(36).substring(2, 9),
      mood,
      message,
      duration,
      amount,
    };
    this.listeners.forEach((listener) => listener(event));
  }
}

export const mascotBus = new MascotBus();

export function fireMascot({ mood, message, duration, amount }: { mood: MascotMood; message: string; duration?: number; amount?: number }) {
  mascotBus.fire({ mood, message, duration, amount });
}
