type LeafShowerListener = (options: { count?: number; durationMs?: number; type?: 'autumn' | 'green' | 'mixed' }) => void;

class LeafBus {
  private listeners: Set<LeafShowerListener> = new Set();

  subscribe(listener: LeafShowerListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  trigger(options: { count?: number; durationMs?: number; type?: 'autumn' | 'green' | 'mixed' } = {}) {
    this.listeners.forEach((listener) => listener(options));
  }
}

export const leafBus = new LeafBus();

export function triggerLeafShower(options?: { count?: number; durationMs?: number; type?: 'autumn' | 'green' | 'mixed' }) {
  leafBus.trigger(options);
}
