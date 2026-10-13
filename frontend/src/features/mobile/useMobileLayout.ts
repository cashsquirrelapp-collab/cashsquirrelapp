import React from 'react';

// The mobile design is for phones only. 743px is just under the narrowest iPad (iPad mini,
// 744px in portrait), so every tablet and computer keeps the layout it had before.
const PHONE_QUERY = '(max-width: 743px)';

/** True on phone-sized screens, where the app shows the mobile design. */
export function useMobileLayout(): boolean {
  const [mobile, setMobile] = React.useState(() => window.matchMedia(PHONE_QUERY).matches);
  React.useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = () => setMobile(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return mobile;
}
