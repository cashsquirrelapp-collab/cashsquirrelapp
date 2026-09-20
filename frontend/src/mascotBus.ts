import { MascotMood } from './components/mascot/Mascot';

export interface MascotToastEvent {
  id: string;
  mood: MascotMood;
  message: string;
  duration?: number;
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

  fire({ mood, message, duration = 4000 }: { mood: MascotMood; message: string; duration?: number }) {
    const event: MascotToastEvent = {
      id: Math.random().toString(36).substring(2, 9),
      mood,
      message,
      duration,
    };
    this.listeners.forEach((listener) => listener(event));
  }
}

export const mascotBus = new MascotBus();

export function fireMascot({ mood, message, duration }: { mood: MascotMood; message: string; duration?: number }) {
  mascotBus.fire({ mood, message, duration });
}
