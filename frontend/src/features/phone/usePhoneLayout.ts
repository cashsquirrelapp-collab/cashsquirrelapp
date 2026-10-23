import { useState } from 'react';

type DeviceInfo = { userAgent: string; platform?: string; maxTouchPoints?: number; userAgentData?: { mobile?: boolean } };

/** Device choice stays stable through rotation, split view and window resizing. */
export function isPhoneDevice(device: DeviceInfo): boolean {
  const ua = device.userAgent;
  const ipadDesktopMode = /Macintosh|MacIntel/i.test(`${ua} ${device.platform || ''}`) && (device.maxTouchPoints || 0) > 1;
  if (ipadDesktopMode || /iPad|Tablet|Kindle|Silk|PlayBook/i.test(ua)) return false;
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return false;
  return /iPhone|iPod|Windows Phone|Android.*Mobile/i.test(ua) || device.userAgentData?.mobile === true;
}

export function usePhoneLayout(): boolean {
  const [phone] = useState(() => typeof navigator !== 'undefined' && isPhoneDevice(navigator));
  return phone;
}
