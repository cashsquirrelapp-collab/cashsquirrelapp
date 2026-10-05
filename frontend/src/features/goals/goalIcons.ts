import {
  Baby, Camera, Car, Gem, Gift, GraduationCap, Guitar, Heart, Home, Laptop, LifeBuoy, PiggyBank,
  Plane, ShoppingBag, Smartphone, Target, Tent, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react';
import type { Goal } from '../../../../shared/types';

// Goal pictures are line icons (or the user's own photo) -- no emoji. Goals saved before icons
// existed only have an emoji, so known emoji map to the matching icon and anything else falls
// back to an icon for the goal's type. Nothing in the stored data needs to change.

export const GOAL_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'target', label: 'เป้าหมาย', Icon: Target },
  { key: 'piggy', label: 'เงินออม', Icon: PiggyBank },
  { key: 'wallet', label: 'กระเป๋าเงิน', Icon: Wallet },
  { key: 'invest', label: 'ลงทุน', Icon: TrendingUp },
  { key: 'emergency', label: 'เงินสำรอง', Icon: LifeBuoy },
  { key: 'home', label: 'บ้าน', Icon: Home },
  { key: 'car', label: 'รถ', Icon: Car },
  { key: 'travel', label: 'ท่องเที่ยว', Icon: Plane },
  { key: 'camp', label: 'แคมป์', Icon: Tent },
  { key: 'laptop', label: 'คอมพิวเตอร์', Icon: Laptop },
  { key: 'phone', label: 'มือถือ', Icon: Smartphone },
  { key: 'camera', label: 'กล้อง', Icon: Camera },
  { key: 'study', label: 'การศึกษา', Icon: GraduationCap },
  { key: 'music', label: 'ดนตรี', Icon: Guitar },
  { key: 'shopping', label: 'ซื้อของ', Icon: ShoppingBag },
  { key: 'gift', label: 'ของขวัญ', Icon: Gift },
  { key: 'wedding', label: 'แต่งงาน', Icon: Gem },
  { key: 'family', label: 'ครอบครัว', Icon: Baby },
  { key: 'health', label: 'สุขภาพ', Icon: Heart },
];

const BY_KEY = new Map(GOAL_ICONS.map(i => [i.key, i]));

const FROM_EMOJI: Record<string, string> = {
  '🎯': 'target', '🐷': 'piggy', '💰': 'wallet', '📈': 'invest', '🚨': 'emergency', '🛟': 'emergency',
  '🏠': 'home', '🚗': 'car', '✈️': 'travel', '🏕️': 'camp', '💻': 'laptop', '📱': 'phone', '📷': 'camera',
  '🎓': 'study', '🎸': 'music', '🛍️': 'shopping', '🎁': 'gift', '💍': 'wedding', '👶': 'family', '❤️': 'health',
};

const FROM_TYPE: Record<Goal['type'], string> = { save: 'piggy', invest: 'invest', emergency: 'emergency', buy: 'shopping' };

/** The icon key to show for a goal: its own choice, else its old emoji's match, else its type's. */
export function goalIconKey(goal: Pick<Goal, 'type'> & { icon?: string; emoji?: string }): string {
  if (goal.icon && BY_KEY.has(goal.icon)) return goal.icon;
  const fromEmoji = goal.emoji ? FROM_EMOJI[goal.emoji.trim()] : undefined;
  return fromEmoji || FROM_TYPE[goal.type] || 'target';
}

export const goalIcon = (key: string): LucideIcon => BY_KEY.get(key)?.Icon ?? Target;
