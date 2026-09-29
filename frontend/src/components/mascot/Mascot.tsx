import React from 'react';

export type MascotMood =
  | 'happy'
  | 'alert'
  | 'celebrate'
  | 'sleepy'
  | 'wave'
  | 'proud'
  | 'thinking'
  | 'worried'
  | 'relieved'
  | 'excited'
  | 'received-money'
  | 'checking'
  | 'waiting'
  | 'error';

export type MascotAction =
  | 'idle'
  | 'wave'
  | 'hold-coin'
  | 'hold-calendar'
  | 'hold-document'
  | 'hold-phone'
  | 'celebrate'
  | 'sleep';

export type MascotProp = 'none' | 'coin' | 'calendar' | 'document' | 'phone' | 'clipboard' | 'chart' | 'warning';

interface MascotProps {
  mood?: MascotMood;
  action?: MascotAction;
  prop?: MascotProp;
  animated?: boolean;
  className?: string;
  size?: number | 'sm' | 'md' | 'lg';
}

const SIZE_PRESETS: Record<'sm' | 'md' | 'lg', number> = { sm: 48, md: 88, lg: 140 };

export function Mascot({
  mood = 'happy',
  action = 'idle',
  prop = 'none',
  animated = true,
  className = '',
  size = 120,
}: MascotProps) {
  const resolvedSize = typeof size === 'number' ? size : SIZE_PRESETS[size];

  // Color presets based on mood. New moods reuse an existing base palette (character lock:
  // body/head/ear/tail/belly shapes never change across moods, only color + face + pose do)
  // and only shift the accessory tint so each reads as a distinct, purposeful state.
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
      case 'thinking':
        return {
          body: '#C27A3F',
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#7A4419',
          accessory: '#94A3B8', // neutral slate, matches a thought/question mark
        };
      case 'worried':
        return {
          body: '#C17817',
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#9E5B0F',
          accessory: '#60A5FA', // cool blue sweat-drop tint
        };
      case 'relieved':
        return {
          body: '#C27A3F',
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#7A4419',
          accessory: '#86EFAC', // soft green, tension resolved
        };
      case 'excited':
        return {
          body: '#E65F2B',
          belly: '#FBF2E4',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#A63F1B',
          accessory: '#EAB308',
        };
      case 'received-money':
        return {
          body: '#D97706',
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#92400E',
          accessory: '#EAB308',
        };
      case 'checking':
        return {
          body: '#C27A3F',
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#7A4419',
          accessory: '#94A3B8',
        };
      case 'waiting':
        return {
          body: '#C27A3F',
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#7A4419',
          accessory: '#C17817',
        };
      case 'error':
        return {
          body: '#C17817',
          belly: '#FDF6EC',
          cheeks: '#FCA5A5',
          eyes: '#3D2314',
          tail: '#9E5B0F',
          accessory: '#EF4444',
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
  const isWaveAction = action === 'wave' || (action === 'idle' && mood === 'wave');
  const isCelebrateAction = action === 'celebrate';
  const isHoldAction = action === 'hold-coin' || action === 'hold-calendar' || action === 'hold-document' || action === 'hold-phone';

  return (
    <div
      className={`inline-flex flex-col items-center justify-center select-none ${className}`}
      style={{ width: resolvedSize, height: resolvedSize }}
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
        @keyframes zzzFloat {
          0% { transform: translateY(0px); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
          100% { transform: translateY(0px); opacity: 0.4; }
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
        .squirrel-zzz {
          animation: zzzFloat 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .squirrel-tail-wag,
          .squirrel-blink,
          .squirrel-accessory,
          .squirrel-wave-arm,
          .squirrel-zzz {
            animation: none !important;
          }
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
        {(mood === 'happy' || mood === 'wave' || mood === 'proud' || mood === 'relieved' || mood === 'received-money') && (
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

        {mood === 'excited' && (
          <>
            {/* Wide sparkling eyes */}
            <circle cx="41" cy="46" r="3.8" fill={colors.eyes} />
            <circle cx="42.3" cy="44.5" r="1.2" fill="white" />
            <circle cx="59" cy="46" r="3.8" fill={colors.eyes} />
            <circle cx="60.3" cy="44.5" r="1.2" fill="white" />
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

        {mood === 'error' && (
          <>
            {/* Wide confused eyes, tenser eyebrows than alert */}
            <circle cx="41" cy="46" r="3.5" fill={colors.eyes} />
            <circle cx="42" cy="45" r="1.2" fill="white" />
            <circle cx="59" cy="46" r="3.5" fill={colors.eyes} />
            <circle cx="60" cy="45" r="1.2" fill="white" />
            <path d="M36 39L45 42" stroke={colors.eyes} strokeWidth="2" strokeLinecap="round" />
            <path d="M64 39L55 42" stroke={colors.eyes} strokeWidth="2" strokeLinecap="round" />
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

        {mood === 'thinking' && (
          <>
            {/* One normal eye, one squinting -- classic "pondering" asymmetry */}
            <circle cx="41" cy="46" r="3" fill={colors.eyes} />
            <path d="M56 46.5C57.5 45 60.5 45 62 46.5" stroke={colors.eyes} strokeWidth="2" strokeLinecap="round" />
            <path d="M55 41L63 39" stroke={colors.eyes} strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}

        {mood === 'worried' && (
          <>
            <circle cx="41" cy="47" r="2.8" fill={colors.eyes} />
            <circle cx="59" cy="47" r="2.8" fill={colors.eyes} />
            {/* Inner-up worried eyebrows */}
            <path d="M37 41L44 44" stroke={colors.eyes} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M63 41L56 44" stroke={colors.eyes} strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}

        {mood === 'checking' && (
          <>
            {/* Focused, slightly narrowed eyes */}
            <ellipse cx="41" cy="47" rx="2.6" ry="3" fill={colors.eyes} />
            <ellipse cx="59" cy="47" rx="2.6" ry="3" fill={colors.eyes} />
            <path d="M37 41L45 42" stroke={colors.eyes} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M63 41L55 42" stroke={colors.eyes} strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}

        {mood === 'waiting' && (
          <>
            {/* Calm, neutral dot eyes -- no eyebrows, no tension */}
            <circle cx="41" cy="46" r="3" fill={colors.eyes} />
            <circle cx="59" cy="46" r="3" fill={colors.eyes} />
          </>
        )}

        {/* Tiny Nose */}
        <polygon points="48,51 52,51 50,53.5" fill={colors.eyes} />

        {/* Mouth based on mood */}
        {(mood === 'happy' || mood === 'wave' || mood === 'proud' || mood === 'relieved' || mood === 'received-money') && (
          <path
            d="M47 55C48 57 52 57 53 55"
            stroke={colors.eyes}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
        {(mood === 'celebrate' || mood === 'excited') && (
          <path
            d="M46 54C47 58 53 58 54 54"
            fill={colors.eyes}
          />
        )}
        {(mood === 'alert' || mood === 'error') && (
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
        {mood === 'thinking' && (
          <path d="M46 56L52 55" stroke={colors.eyes} strokeWidth="1.5" strokeLinecap="round" />
        )}
        {mood === 'worried' && (
          <path d="M46 56Q48 54 50 56T54 56" stroke={colors.eyes} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        )}
        {mood === 'checking' && (
          <path d="M47 56H53" stroke={colors.eyes} strokeWidth="1.5" strokeLinecap="round" />
        )}
        {mood === 'waiting' && (
          <path d="M47 56Q50 57 53 56" stroke={colors.eyes} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        )}

        {/* Paws */}
        {/* Left arm */}
        {isCelebrateAction ? (
          <>
            <path d="M36 60C32 55 30 50 30 46" stroke={colors.body} strokeWidth="4" strokeLinecap="round" />
            <circle cx="30" cy="44" r="4" fill={colors.body} />
          </>
        ) : action === 'idle' && mood === 'proud' ? (
          <path d="M34 62C30 63 32 68 35 66" stroke={colors.body} strokeWidth="3.5" strokeLinecap="round" />
        ) : (
          <circle cx="34" cy="64" r="3.5" fill={colors.body} />
        )}

        {/* Right arm */}
        {isWaveAction ? (
          <g className={animated ? 'squirrel-wave-arm' : ''}>
            {/* Waving hand path */}
            <path d="M64 62C68 56 73 49 76 46" stroke={colors.body} strokeWidth="5" strokeLinecap="round" />
            <circle cx="76" cy="46" r="4.5" fill={colors.body} />
          </g>
        ) : isCelebrateAction ? (
          <>
            <path d="M64 60C68 55 70 50 70 46" stroke={colors.body} strokeWidth="4" strokeLinecap="round" />
            <circle cx="70" cy="44" r="4" fill={colors.body} />
          </>
        ) : isHoldAction ? (
          <>
            <path d="M64 60C68 55 70 50 70 46" stroke={colors.body} strokeWidth="4" strokeLinecap="round" />
            <circle cx="70" cy="44" r="4" fill={colors.body} />
            {action === 'hold-coin' && (
              <circle cx="70" cy="44" r="4.5" fill="#EAB308" stroke="#B45309" strokeWidth="0.8" />
            )}
            {action === 'hold-calendar' && (
              <>
                <rect x="66.5" y="40.5" width="7" height="7" rx="1.2" fill="#FFFFFF" stroke={colors.eyes} strokeWidth="1" />
                <path d="M66.5 43.5h7" stroke={colors.eyes} strokeWidth="1" />
              </>
            )}
            {action === 'hold-document' && (
              <>
                <rect x="67" y="40" width="6" height="8" rx="1" fill="#FFFFFF" stroke={colors.eyes} strokeWidth="1" />
                <path d="M68.5 43h3M68.5 45h3" stroke={colors.eyes} strokeWidth="0.8" />
              </>
            )}
            {action === 'hold-phone' && (
              <rect x="67.5" y="39.5" width="5" height="9" rx="1.3" fill="#FFFFFF" stroke={colors.eyes} strokeWidth="1" />
            )}
          </>
        ) : action === 'idle' && mood === 'proud' ? (
          <path d="M66 62C70 63 68 68 65 66" stroke={colors.body} strokeWidth="3.5" strokeLinecap="round" />
        ) : (
          <circle cx="66" cy="64" r="3.5" fill={colors.body} />
        )}

        {/* Feet */}
        <ellipse cx="40" cy="85" rx="5" ry="3" fill={colors.body} />
        <ellipse cx="60" cy="85" rx="5" ry="3" fill={colors.body} />

        {/* Prop overlay takes priority over the mood's default floating accessory, so a caller
            asking for a specific prop always sees it; omitting prop preserves the exact old
            per-mood accessory that existing call sites already rely on. */}
        {prop !== 'none' ? (
          <g className="squirrel-accessory">
            {prop === 'coin' && (
              <>
                <circle cx="76" cy="30" r="6" fill="#EAB308" stroke="#B45309" strokeWidth="1" />
                <path d="M73 30h6" stroke="#B45309" strokeWidth="1.2" />
              </>
            )}
            {prop === 'calendar' && (
              <>
                <rect x="70" y="22" width="14" height="13" rx="2" fill="#FFFFFF" stroke={colors.eyes} strokeWidth="1.3" />
                <path d="M70 27h14" stroke={colors.eyes} strokeWidth="1.3" />
                <path d="M74 20v4M80 20v4" stroke={colors.eyes} strokeWidth="1.3" strokeLinecap="round" />
              </>
            )}
            {prop === 'document' && (
              <>
                <rect x="71" y="20" width="12" height="16" rx="1.5" fill="#FFFFFF" stroke={colors.eyes} strokeWidth="1.2" />
                <path d="M74 25h6M74 28h6M74 31h4" stroke={colors.eyes} strokeWidth="1" />
              </>
            )}
            {prop === 'phone' && (
              <>
                <rect x="73" y="18" width="10" height="18" rx="2.5" fill="#FFFFFF" stroke={colors.eyes} strokeWidth="1.3" />
                <circle cx="78" cy="33" r="0.8" fill={colors.eyes} />
              </>
            )}
            {prop === 'clipboard' && (
              <>
                <rect x="71" y="20" width="12" height="16" rx="1.5" fill="#FFFFFF" stroke={colors.eyes} strokeWidth="1.2" />
                <rect x="74" y="18" width="6" height="3" rx="1" fill={colors.eyes} />
                <path d="M74 26l2 2 4-4" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </>
            )}
            {prop === 'chart' && (
              <>
                <rect x="68" y="30" width="4" height="6" fill={colors.eyes} />
                <rect x="74" y="26" width="4" height="10" fill={colors.eyes} />
                <rect x="80" y="20" width="4" height="16" fill={colors.eyes} />
              </>
            )}
            {prop === 'warning' && (
              <>
                <path d="M76 20L84 34H68Z" fill="#FBBF24" stroke="#B45309" strokeWidth="1" />
                <path d="M76 25v4" stroke="#78350F" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="76" cy="31.5" r="0.9" fill="#78350F" />
              </>
            )}
          </g>
        ) : (
          <>
            {mood === 'celebrate' && (
              <g className="squirrel-accessory">
                {/* Sparkle or coin */}
                <circle cx="75" cy="30" r="3" fill="#EAB308" />
                <path d="M75 24V36M69 30H81" stroke="#EAB308" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )}
            {(mood === 'alert' || mood === 'error') && (
              <g className="squirrel-accessory">
                {/* Exclamation point */}
                <path d="M75 25V33" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="75" cy="38" r="1.5" fill="#EF4444" />
              </g>
            )}
            {mood === 'sleepy' && (
              <g className="squirrel-accessory squirrel-zzz">
                {/* Zzz... bubbles */}
                <path d="M72 26H77L72 32H77" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M80 18H83L80 22H83" stroke="#64748B" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            {(mood === 'happy' || mood === 'wave' || mood === 'received-money') && (
              <g className="squirrel-accessory">
                {/* A small golden acorn */}
                <path d="M72 32C72 28 78 28 78 32C78 35 75 38 75 38C75 38 72 35 72 32Z" fill="#CA8A04" />
                <path d="M71 29C74 27 76 27 79 29L75 29" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            )}
            {mood === 'proud' && (
              <g className={animated ? 'squirrel-accessory' : ''}>
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
            {mood === 'thinking' && (
              <g className="squirrel-accessory">
                {/* Small trailing thought dots */}
                <circle cx="74" cy="30" r="1.6" fill="#94A3B8" />
                <circle cx="79" cy="25" r="1.2" fill="#94A3B8" />
                <circle cx="83" cy="21" r="0.9" fill="#94A3B8" />
              </g>
            )}
            {mood === 'worried' && (
              <g className="squirrel-accessory">
                {/* Sweat drop */}
                <path d="M76 22Q72 28 76 32Q80 28 76 22Z" fill="#60A5FA" />
              </g>
            )}
            {mood === 'relieved' && (
              <g className="squirrel-accessory">
                {/* Small resolved checkmark */}
                <circle cx="76" cy="28" r="7" fill="#DCFCE7" />
                <path d="M72.5 28l2.5 2.5 5-5" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            )}
            {mood === 'excited' && (
              <g className="squirrel-accessory">
                <path d="M75 22V32M69 27H81" stroke="#EAB308" strokeWidth="1.8" strokeLinecap="round" />
              </g>
            )}
            {mood === 'checking' && (
              <g className="squirrel-accessory">
                {/* Magnifying glass */}
                <circle cx="76" cy="26" r="5" fill="none" stroke="#94A3B8" strokeWidth="1.8" />
                <path d="M80 30l4 4" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" />
              </g>
            )}
            {mood === 'waiting' && (
              <g className="squirrel-accessory">
                {/* Small clock */}
                <circle cx="76" cy="27" r="6.5" fill="#FFFFFF" stroke="#C17817" strokeWidth="1.3" />
                <path d="M76 23V27L79 29" stroke="#C17817" strokeWidth="1.3" strokeLinecap="round" />
              </g>
            )}
          </>
        )}
      </svg>
    </div>
  );
}
