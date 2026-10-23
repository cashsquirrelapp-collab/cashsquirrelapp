import React from 'react';
import { motion } from 'motion/react';

interface VineDividerProps {
  color?: string;
  leafColor?: string;
  height?: number;
  className?: string;
}

export const VineDivider: React.FC<VineDividerProps> = ({
  color,
  leafColor,
  height = 40,
  className = '',
}) => {
  // Check if custom colors are explicitly provided
  const hasCustomColor = !!color;
  
  return (
    <div 
      className={`w-full flex items-center justify-center my-2 select-none pointer-events-none ${className}`}
      style={{ height }}
    >
      <svg
        viewBox="0 0 300 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full max-w-xs h-full ${hasCustomColor ? '' : 'text-[#7A9A5E] dark:text-[#5C8F3F]'}`}
      >
        {/* Main Vine Stem */}
        <motion.path
          d="M 10 20 Q 80 10 150 20 T 290 20"
          stroke={color || 'currentColor'}
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.8, ease: 'easeInOut' }}
        />

        {/* Small branching shoot 1 */}
        <motion.path
          d="M 70 17 Q 90 28 105 22"
          stroke={color || 'currentColor'}
          strokeWidth="1.8"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.6, ease: 'easeInOut' }}
        />

        {/* Small branching shoot 2 */}
        <motion.path
          d="M 210 19 Q 225 10 240 16"
          stroke={color || 'currentColor'}
          strokeWidth="1.8"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.8, ease: 'easeInOut' }}
        />

        {/* Leaf 1 (Left-ish, top) */}
        <motion.path
          d="M 45 17 C 40 10 50 5 55 12 C 55 12 50 17 45 17 Z"
          fill={leafColor || (hasCustomColor ? '#5C7A44' : 'rgba(16, 185, 129, 0.15)')}
          stroke={color || 'currentColor'}
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, delay: 0.4 }}
          style={{ originX: '45px', originY: '17px' }}
        />

        {/* Leaf 2 (Branch 1 leaf) */}
        <motion.path
          d="M 105 22 C 112 18 115 28 108 30 C 108 30 102 26 105 22 Z"
          fill={leafColor || (hasCustomColor ? '#5C7A44' : 'rgba(16, 185, 129, 0.15)')}
          stroke={color || 'currentColor'}
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, delay: 1.2 }}
          style={{ originX: '105px', originY: '22px' }}
        />

        {/* Leaf 3 (Center, bottom) */}
        <motion.path
          d="M 140 21 C 145 28 135 34 130 27 C 130 27 135 20 140 21 Z"
          fill={leafColor || (hasCustomColor ? '#5C7A44' : 'rgba(16, 185, 129, 0.15)')}
          stroke={color || 'currentColor'}
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, delay: 0.9 }}
          style={{ originX: '140px', originY: '21px' }}
        />

        {/* Leaf 4 (Center, top) */}
        <motion.path
          d="M 165 17 C 160 8 172 5 175 14 C 175 14 168 18 165 17 Z"
          fill={leafColor || (hasCustomColor ? '#5C7A44' : 'rgba(16, 185, 129, 0.15)')}
          stroke={color || 'currentColor'}
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, delay: 1.1 }}
          style={{ originX: '165px', originY: '17px' }}
        />

        {/* Leaf 5 (Branch 2 leaf) */}
        <motion.path
          d="M 240 16 C 248 10 252 20 244 22 C 244 22 238 18 240 16 Z"
          fill={leafColor || (hasCustomColor ? '#5C7A44' : 'rgba(16, 185, 129, 0.15)')}
          stroke={color || 'currentColor'}
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, delay: 1.4 }}
          style={{ originX: '240px', originY: '16px' }}
        />

        {/* Leaf 6 (Right-ish, bottom) */}
        <motion.path
          d="M 270 20 C 275 27 265 32 260 25 C 260 25 265 18 270 20 Z"
          fill={leafColor || (hasCustomColor ? '#5C7A44' : 'rgba(16, 185, 129, 0.15)')}
          stroke={color || 'currentColor'}
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, delay: 1.5 }}
          style={{ originX: '270px', originY: '20px' }}
        />
      </svg>
    </div>
  );
};

export default VineDivider;
