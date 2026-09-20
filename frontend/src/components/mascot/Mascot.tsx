import React from 'react';

export type MascotMood = 'happy' | 'alert' | 'celebrate' | 'sleepy' | 'wave' | 'proud';

interface MascotProps {
  mood?: MascotMood;
  animated?: boolean;
  className?: string;
  size?: number;
}

export function Mascot({
  mood = 'happy',
  animated = true,
  className = '',
  size = 120,
}: MascotProps) {
  // Color presets based on mood
  const getSquirrelColors = () => {
    switch (mood) {
      case 'alert':
        return {
          body: '#C17817', // Caramel Orange
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#9E5B0F',
          accessory: '#A63F1B',
        };
      case 'celebrate':
        return {
          body: '#E65F2B', // Vibrant brand acorn orange
          belly: '#FBF2E4',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#A63F1B',
          accessory: '#C17817',
        };
      case 'sleepy':
        return {
          body: '#7A5C43', // Hazelnut slate brown
          belly: '#F5EFE6',
          cheeks: '#CBD5E1',
          eyes: '#3D2314',
          tail: '#5C4430',
          accessory: '#94A3B8',
        };
      case 'wave':
        return {
          body: '#C27A3F', // Warm squirrel brown-orange
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#7A4419',
          accessory: '#F59E0B',
        };
      case 'proud':
        return {
          body: '#D97706', // Rich golden caramel
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#92400E',
          accessory: '#F59E0B',
        };
      case 'happy':
      default:
        return {
          body: '#C27A3F', // Warm squirrel brown-orange
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#7A4419', // Chestnut brown
          accessory: '#C17817',
        };
    }
  };

  const colors = getSquirrelColors();

  // Animation CSS injected into a local style tag to keep tail-wagging simple, performant, and reliable
  const tailAnimationClass = animated ? 'squirrel-tail-wag' : '';
  const eyesAnimationClass = mood === 'sleepy' ? '' : (animated ? 'squirrel-blink' : '');

  return (
    <div
      className={`inline-flex flex-col items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <style>{`
        @keyframes tailWag {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(10deg); }
        }
        @keyframes squirrelBlink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        @keyframes floatAcc {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(5deg); }
        }
        @keyframes squirrelWave {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-15deg); }
        }
        .squirrel-tail-wag {
          animation: tailWag 2.5s ease-in-out infinite;
          transform-origin: 45px 75px;
        }
        .squirrel-blink {
          animation: squirrelBlink 4s linear infinite;
          transform-origin: center;
        }
        .squirrel-accessory {
          animation: floatAcc 2s ease-in-out infinite;
        }
        .squirrel-wave-arm {
          animation: squirrelWave 0.8s ease-in-out infinite;
          transform-origin: 66px 64px;
        }
      `}</style>

      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Shadow */}
        <ellipse cx="50" cy="90" rx="25" ry="5" fill="black" fillOpacity="0.08" />

        {/* Tail */}
        <g className={tailAnimationClass}>
          {/* Big fluffy squirrel tail */}
          <path
            d="M48 76C40 76 30 72 26 65C22 58 24 45 32 38C40 31 52 28 58 35C64 42 61 54 54 62C49 68 52 73 54 75"
            stroke={colors.tail}
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M48 76C42 76 33 72 30 66C27 60 28 49 34 43C40 37 49 35 54 40C59 45 57 53 52 59"
            stroke={colors.body}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>

        {/* Left Ear */}
        <path
          d="M38 35C35 25 39 18 42 18C45 18 45 27 42 35"
          fill={colors.body}
        />
        <path
          d="M39 32C37 26 39 21 41 21C43 21 43 27 41 32"
          fill={colors.cheeks}
        />

        {/* Right Ear */}
        <path
          d="M62 35C65 25 61 18 58 18C55 18 55 27 58 35"
          fill={colors.body}
        />
        <path
          d="M61 32C63 26 61 21 59 21C57 21 57 27 59 32"
          fill={colors.cheeks}
        />

        {/* Main Body & Head */}
        <circle cx="50" cy="52" r="22" fill={colors.body} />
        {mood === 'proud' && (
          // Proud chest puffed
          <ellipse cx="50" cy="56" rx="16" ry="17" fill={colors.body} />
        )}
        {mood !== 'proud' && (
          <ellipse cx="50" cy="56" rx="14" ry="16" fill={colors.body} />
        )}

        {/* Belly (Cream center) */}
        <ellipse cx="50" cy="62" rx="11" ry="11" fill={colors.belly} />

        {/* Happy rosy cheeks */}
        <circle cx="37" cy="54" r="3.5" fill={colors.cheeks} fillOpacity="0.8" />
        <circle cx="63" cy="54" r="3.5" fill={colors.cheeks} fillOpacity="0.8" />

        {/* Eyes based on mood */}
        {(mood === 'happy' || mood === 'wave' || mood === 'proud') && (
          <>
            {/* Bright happy curved eyes or circular eyes */}
            <circle cx="41" cy="46" r="3" fill={colors.eyes} className={eyesAnimationClass} />
            <circle cx="59" cy="46" r="3" fill={colors.eyes} className={eyesAnimationClass} />
            {/* Eye shines */}
            <circle cx="42" cy="45" r="1" fill="white" className={eyesAnimationClass} />
            <circle cx="60" cy="45" r="1" fill="white" className={eyesAnimationClass} />
          </>
        )}

        {mood === 'celebrate' && (
          <>
            {/* Excited "^" "^" eyes */}
            <path
              d="M38 48L41 44L44 48"
              stroke={colors.eyes}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M56 48L59 44L62 48"
              stroke={colors.eyes}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {mood === 'alert' && (
          <>
            {/* Circular wide alert eyes */}
            <circle cx="41" cy="46" r="3.5" fill={colors.eyes} />
            <circle cx="59" cy="46" r="3.5" fill={colors.eyes} />
            <circle cx="42" cy="45" r="1.2" fill="white" />
            <circle cx="60" cy="45" r="1.2" fill="white" />
            {/* Tense eyebrows */}
            <path d="M37 40L45 42" stroke={colors.eyes} strokeWidth="2" strokeLinecap="round" />
            <path d="M63 40L55 42" stroke={colors.eyes} strokeWidth="2" strokeLinecap="round" />
          </>
        )}

        {mood === 'sleepy' && (
          <>
            {/* Closed sleeping curves "u" "u" */}
            <path
              d="M38 46C39 49 43 49 44 46"
              stroke={colors.eyes}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M56 46C57 49 61 49 62 46"
              stroke={colors.eyes}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Tiny Nose */}
        <polygon points="48,51 52,51 50,53.5" fill={colors.eyes} />

        {/* Mouth based on mood */}
        {(mood === 'happy' || mood === 'wave' || mood === 'proud') && (
          <path
            d="M47 55C48 57 52 57 53 55"
            stroke={colors.eyes}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
        {mood === 'celebrate' && (
          <path
            d="M46 54C47 58 53 58 54 54"
            fill={colors.eyes}
          />
        )}
        {mood === 'alert' && (
          <path
            d="M47 56H53"
            stroke={colors.eyes}
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        {mood === 'sleepy' && (
          <path
            d="M48 55C49 56 51 56 52 55"
            stroke={colors.eyes}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}

        {/* Paws */}
        {/* Left arm */}
        {mood === 'proud' ? (
          <path d="M34 62C30 63 32 68 35 66" stroke={colors.body} strokeWidth="3.5" strokeLinecap="round" />
        ) : (
          <circle cx="34" cy="64" r="3.5" fill={colors.body} />
        )}

        {/* Right arm */}
        {mood === 'wave' ? (
          <g className={animated ? "squirrel-wave-arm" : ""}>
            {/* Waving hand path */}
            <path d="M64 62C68 56 73 49 76 46" stroke={colors.body} strokeWidth="5" strokeLinecap="round" />
            <circle cx="76" cy="46" r="4.5" fill={colors.body} />
          </g>
        ) : mood === 'proud' ? (
          <path d="M66 62C70 63 68 68 65 66" stroke={colors.body} strokeWidth="3.5" strokeLinecap="round" />
        ) : (
          <circle cx="66" cy="64" r="3.5" fill={colors.body} />
        )}

        {/* Feet */}
        <ellipse cx="40" cy="85" rx="5" ry="3" fill={colors.body} />
        <ellipse cx="60" cy="85" rx="5" ry="3" fill={colors.body} />

        {/* Floating/Accompanying visual accessory based on mood */}
        {mood === 'celebrate' && (
          <g className="squirrel-accessory">
            {/* Sparkle or coin */}
            <circle cx="75" cy="30" r="3" fill="#EAB308" />
            <path d="M75 24V36M69 30H81" stroke="#EAB308" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        )}
        {mood === 'alert' && (
          <g className="squirrel-accessory">
            {/* Exclamation point */}
            <path d="M75 25V33" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="75" cy="38" r="1.5" fill="#EF4444" />
          </g>
        )}
        {mood === 'sleepy' && (
          <g className="squirrel-accessory">
            {/* Zzz... bubbles */}
            <path d="M72 26H77L72 32H77" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M80 18H83L80 22H83" stroke="#64748B" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
        {(mood === 'happy' || mood === 'wave') && (
          <g className="squirrel-accessory">
            {/* A small golden acorn */}
            <path d="M72 32C72 28 78 28 78 32C78 35 75 38 75 38C75 38 72 35 72 32Z" fill="#CA8A04" />
            <path d="M71 29C74 27 76 27 79 29L75 29" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
        {mood === 'proud' && (
          <g className={animated ? "squirrel-accessory" : ""}>
            {/* Little golden crown on head */}
            <path
              d="M44 26L47 30L50 25L53 30L56 26L54 32H46L44 26Z"
              fill="#F59E0B"
              stroke="#B45309"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            {/* Little sparkle above */}
            <circle cx="50" cy="22" r="1.5" fill="#F59E0B" />
          </g>
        )}
      </svg>
    </div>
  );
}
