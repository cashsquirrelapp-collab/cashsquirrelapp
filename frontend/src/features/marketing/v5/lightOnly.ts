import React from 'react';

// The landing and the founder's story are light only: while one is open the app's dark mode is set aside (and put back
// after), so nothing on these white pages turns white, the logo's words included.
export function useLightOnly() {
  React.useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    const clear = () => { if (html.classList.contains('dark')) html.classList.remove('dark'); };
    clear();
    const observer = new MutationObserver(clear);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => { observer.disconnect(); if (wasDark) html.classList.add('dark'); };
  }, []);
}
