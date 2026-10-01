import React from 'react';

/**
 * The กระรอกตุนเงิน logo: the mascot squirrel hugging a gold ฿ coin -- the "stash" in
 * ตุนเงิน. Same head, ears and tail as <Mascot mood="happy" />, but static and with the coin
 * held in both paws in front of the belly, big enough to read at sidebar/favicon sizes.
 * Keep public/favicon.svg in sync with this drawing.
 */
export function BrandLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="50" cy="90" rx="25" ry="5" fill="black" fillOpacity="0.08" />

      {/* Tail */}
      <path d="M48 76C40 76 30 72 26 65C22 58 24 45 32 38C40 31 52 28 58 35C64 42 61 54 54 62C49 68 52 73 54 75" stroke="#7A4419" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M48 76C42 76 33 72 30 66C27 60 28 49 34 43C40 37 49 35 54 40C59 45 57 53 52 59" stroke="#C27A3F" strokeWidth="5" strokeLinecap="round" />

      {/* Ears */}
      <path d="M38 35C35 25 39 18 42 18C45 18 45 27 42 35" fill="#C27A3F" />
      <path d="M39 32C37 26 39 21 41 21C43 21 43 27 41 32" fill="#FCA5A5" />
      <path d="M62 35C65 25 61 18 58 18C55 18 55 27 58 35" fill="#C27A3F" />
      <path d="M61 32C63 26 61 21 59 21C57 21 57 27 59 32" fill="#FCA5A5" />

      {/* Head and body */}
      <circle cx="50" cy="52" r="22" fill="#C27A3F" />
      <ellipse cx="50" cy="58" rx="14" ry="16" fill="#C27A3F" />

      {/* Face */}
      <circle cx="37" cy="53" r="3.5" fill="#FCA5A5" fillOpacity="0.8" />
      <circle cx="63" cy="53" r="3.5" fill="#FCA5A5" fillOpacity="0.8" />
      <circle cx="41" cy="45" r="3" fill="#3D2314" />
      <circle cx="59" cy="45" r="3" fill="#3D2314" />
      <circle cx="42" cy="44" r="1" fill="white" />
      <circle cx="60" cy="44" r="1" fill="white" />
      <polygon points="48,50 52,50 50,52.5" fill="#3D2314" />
      <path d="M47 54C48 56 52 56 53 54" stroke="#3D2314" strokeWidth="1.5" strokeLinecap="round" />

      {/* Feet */}
      <ellipse cx="40" cy="85" rx="5" ry="3" fill="#C27A3F" />
      <ellipse cx="60" cy="85" rx="5" ry="3" fill="#C27A3F" />

      {/* The coin, held against the belly */}
      <circle cx="50" cy="69" r="12" fill="#F6B93B" stroke="#C98A0B" strokeWidth="1.6" />
      <circle cx="50" cy="69" r="8.8" stroke="#E39E1C" strokeWidth="1.1" />
      <path d="M42.6 64.4A9.2 9.2 0 0 1 46.3 60.8" stroke="white" strokeOpacity="0.75" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M47 64.6H50.7Q53.1 64.6 53.1 66.8Q53.1 69 50.7 69H47M47 69H51.2Q53.7 69 53.7 71.25Q53.7 73.5 51.2 73.5H47V64.6M50.2 62.9V75.2"
        stroke="#8A5A00"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Paws gripping the coin's edges */}
      <circle cx="38.6" cy="66" r="4" fill="#C27A3F" />
      <circle cx="61.4" cy="66" r="4" fill="#C27A3F" />

      {/* Sparkle */}
      <path d="M76 24L77.4 28.6L82 30L77.4 31.4L76 36L74.6 31.4L70 30L74.6 28.6Z" fill="#F6B93B" />
    </svg>
  );
}
