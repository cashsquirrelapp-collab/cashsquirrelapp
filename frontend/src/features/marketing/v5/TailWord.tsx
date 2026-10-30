import React from 'react';
import { tr } from '../../../i18n/tr';

// เลขากระรอก as the hero's wordmark (owner, 2026-10-30: "ทำให้ตัวอักษรในอักษรหนึ่ง ... เหมือนหางกระรอก", look D of four):
// the word in its own type (IBM Plex Sans Thai Looped 600), the second ร sweeping its top hook up into a squirrel's tail,
// in the hero's running CI colours. Drawn at the type's size 300 with the baseline at 500. The box runs one em above the
// baseline and 0.2em below it, inside the line's own height, so the line does not grow and the tail stays inside the
// word's reveal mask. The tail is drawn once the type has loaded, as it is fitted to that type's ร.
// The drawings were made in artifacts/wordmark-tail (build.py, plume.py).

/** The tail: a tapered stroke along a curl, outlined. */
const TAIL = 'M1300.2 359.5 L1305.6 359.5 L1311.5 359.5 L1317.5 359.3 L1323.8 359 L1330.1 358.5 L1336.6 357.6 L1343.1 356.2 L1349.5 354.4 L1355.9 352.1 L1362.3 349.5 L1368.7 346.6 L1374.9 343.2 L1381 339.2 L1386.9 334.6 L1392.4 329.2 L1397.5 323.1 L1402 316.1 L1405.7 308.1 L1408.5 299.4 L1410.1 290.8 L1410.8 282.2 L1410.3 273.8 L1408.8 265.5 L1406.3 257.5 L1402.9 250 L1398.6 243.1 L1393.4 236.8 L1387.6 231.3 L1381.3 226.5 L1374.4 222.6 L1367.2 219.4 L1359.8 217.1 L1352.1 215.6 L1344.3 214.9 L1336.5 214.9 L1328.7 215.7 L1321.3 217.3 L1314.5 219.4 L1308.2 222.1 L1302.4 225.4 L1297.2 229.2 L1292.6 233.5 L1288.7 238.2 L1285.4 243.3 L1282.8 248.7 L1281.1 254.4 L1280.3 260.4 L1280.7 266.4 L1282.4 272.4 L1285.3 277.8 L1289.2 282.5 L1294.1 286.2 L1299.5 288.8 L1304.8 289.9 L1308.9 290.3 L1312.7 290.2 L1316.4 289.6 L1319.7 288.7 L1322.7 287.3 L1325.3 285.7 L1327.6 283.9 L1329.6 281.9 L1331.2 279.7 L1332.5 277.4 L1333.4 275.1 L1334 272.8 L1334.3 270.4 L1334.3 268.1 L1334.1 265.8 L1333.6 263.6 L1332.8 261.3 L1331.8 259.2 L1328.2 260.8 L1328.9 262.7 L1329.2 264.4 L1329.1 266 L1328.7 267.5 L1328 268.8 L1327.2 269.9 L1326.2 270.8 L1325 271.4 L1323.8 271.8 L1322.6 272 L1321.3 271.9 L1320.2 271.6 L1319.1 271.1 L1318.1 270.4 L1317.2 269.5 L1316.4 268.5 L1315.7 267.4 L1315.2 266.1 L1314.4 264.2 L1314.7 262.9 L1315.4 262.3 L1316.3 262.1 L1317.1 262.3 L1317.6 262.6 L1318 262.9 L1318.1 263 L1318.2 262.8 L1318.4 262.5 L1318.9 262 L1319.7 261.5 L1320.8 260.9 L1322.1 260.4 L1323.9 260.1 L1326 259.9 L1328.5 259.9 L1331.3 260.3 L1334.8 261 L1338 262 L1340.9 263.2 L1343.6 264.7 L1346 266.3 L1348.2 268 L1350.2 269.7 L1352 271.4 L1353.6 273.2 L1355 274.9 L1356.4 276.7 L1357.7 278.6 L1358.9 280.7 L1360 283 L1360.9 285.6 L1361.7 288.6 L1362.1 292.2 L1362.3 295.9 L1362.1 298.8 L1361.5 301.8 L1360.4 304.8 L1358.8 307.7 L1356.7 310.6 L1354 313.3 L1350.8 316 L1347.1 318.3 L1343.1 320.4 L1338.6 322.2 L1334 323.7 L1329.2 325.2 L1324.3 326.7 L1319.3 328 L1314.4 329 L1309.4 329.8 L1304.6 330.3 L1299.8 330.5 Z';
/** The ร's own top hook, taken out where the tail grows instead. */
const HOOK = 'M1306 361 L1338 354 L1338 300 L1381 300 L1381 392 L1338 392 L1338 389 L1306 389 Z';
const TYPE = '600 1em "IBM Plex Sans Thai Looped"';
const WORD = 'เลขากระรอก';
/** The colours run across the word as the hero's did: a strip twice the word's width (3524 units) sliding once every 9 s. */
const STOPS = [['0', '#C24A16'], ['0.25', '#E65F2B'], ['0.5', '#F2A23A'], ['0.75', '#E65F2B'], ['1', '#C24A16']] as const;

function useTypeReady() {
  const [ready, setReady] = React.useState(() => typeof document !== 'undefined' && !!document.fonts?.check(TYPE, WORD));
  React.useEffect(() => {
    if (ready || typeof document === 'undefined' || !document.fonts) return;
    let on = true;
    document.fonts.load(TYPE, WORD).then(faces => { if (on && faces.length) setReady(true); }).catch(() => undefined);
    return () => { on = false; };
  }, [ready]);
  return ready;
}

function useStill() {
  const [still, setStill] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return still;
}

/** In the hero's word mask, like the other words, so it rises in with them. */
export function TailWord() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ready = useTypeReady();
  const still = useStill();
  return (
    <span className="cl-wm"><span className="cl-w cl-tailword">
      <svg viewBox="20 200 1762 360" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}g`} gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="3544" y2="0" spreadMethod="repeat">
            {STOPS.map(([offset, colour]) => <stop key={offset} offset={offset} stopColor={colour} />)}
            {!still && <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="3524 0" dur="9s" repeatCount="indefinite" />}
          </linearGradient>
          <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="1800" height="600">
            <rect width="1800" height="600" fill="#FFFFFF" />
            {ready && <path d={HOOK} fill="#000000" />}
          </mask>
        </defs>
        <g fill={`url(#${id}g)`}>
          <text x="20" y="500" fontSize="300" fontWeight="600" fontFamily="'IBM Plex Sans Thai Looped', 'IBM Plex Sans Thai', sans-serif" mask={`url(#${id}m)`}>{tr(WORD)}</text>
          <path className={`cl-tail${ready ? ' is-on' : ''}`} d={TAIL} />
        </g>
      </svg>
    </span></span>
  );
}
