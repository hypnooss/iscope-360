import { useEffect, useState, useCallback, useRef } from 'react';

const ALIGNMENT_TOLERANCE = 15;
const DEBOUNCE_MS = 100;

export function ScrollDownIndicator() {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAlignment = useCallback(() => {
    const sections = document.querySelectorAll<HTMLElement>('[data-section]');
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const alignedTop = Math.abs(rect.top) < ALIGNMENT_TOLERANCE;
      const fillsViewport = rect.top < window.innerHeight * 0.15 && rect.bottom > window.innerHeight;

      if (alignedTop || fillsViewport) {
        setIsVisible(true);
        return;
      }
    }
    setIsVisible(false);
  }, []);

  const hideImmediately = useCallback(() => {
    setIsVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(checkAlignment, DEBOUNCE_MS);
  }, [checkAlignment]);

  useEffect(() => {
    // Initial check after render
    const raf = requestAnimationFrame(() => {
      setTimeout(checkAlignment, 50);
    });

    window.addEventListener('scroll', hideImmediately, { passive: true });
    window.addEventListener('wheel', hideImmediately, { passive: true });
    window.addEventListener('touchmove', hideImmediately, { passive: true });
    window.addEventListener('resize', hideImmediately);

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('scroll', hideImmediately);
      window.removeEventListener('wheel', hideImmediately);
      window.removeEventListener('touchmove', hideImmediately);
      window.removeEventListener('resize', hideImmediately);
    };
  }, [checkAlignment, hideImmediately]);

  const handleClick = useCallback(() => {
    setIsVisible(false);

    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
    let currentIndex = -1;

    for (let i = 0; i < sections.length; i++) {
      const rect = sections[i].getBoundingClientRect();
      const alignedTop = Math.abs(rect.top) < ALIGNMENT_TOLERANCE;
      const fillsViewport = rect.top < window.innerHeight * 0.15 && rect.bottom > window.innerHeight;

      if (alignedTop || fillsViewport) {
        currentIndex = i;
        break;
      }
    }

    const nextSection = sections[currentIndex + 1];
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <button
      onClick={handleClick}
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 cursor-pointer group transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      aria-label="Scroll to next section"
    >
      <span className="text-[10px] uppercase tracking-[0.32em] font-mono text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-colors duration-300">
        Scroll down
      </span>
      <div className="relative w-px h-8 bg-muted-foreground/15 rounded-full overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[3px] h-[8px] rounded-full bg-primary/60 animate-scroll-dot" />
      </div>
    </button>
  );
}
