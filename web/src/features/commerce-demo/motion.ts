import { flushSync } from 'react-dom';

// Native shared-element transitions keep filtered cards connected as the layout
// changes. CSS entry/exit animations remain the fallback for older browsers.
export function morph(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  if (
    !doc.startViewTransition ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update();
    return;
  }
  document.documentElement.classList.add('hm-morph');
  const transition = doc.startViewTransition(() => flushSync(update));
  void transition.finished
    .catch(() => {})
    .finally(() => {
      document.documentElement.classList.remove('hm-morph');
    });
}
