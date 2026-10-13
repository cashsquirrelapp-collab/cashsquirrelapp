import React from 'react';

/** True below 1024px, where the app shows the mobile design (the same breakpoint App.tsx uses). */
export function useMobileLayout(): boolean {
  const [mobile, setMobile] = React.useState(() => window.matchMedia('(max-width: 1023px)').matches);
  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setMobile(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return mobile;
}
