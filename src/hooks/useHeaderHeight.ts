import { useLayoutEffect, useRef, useCallback } from 'react';

interface HeaderHeights {
  header: number;
  subTabs: number;
  total: number;
}

/**
 * Tracks header and sub-tab heights dynamically using ResizeObserver.
 * Updates CSS variables on :root for consumption by sticky elements.
 *
 * Why ResizeObserver over state?
 * - Avoids re-render cascade (updates CSS directly)
 * - Sub-pixel accuracy via getBoundingClientRect()
 * - Automatic response to viewport changes, font scaling, content shifts
 *
 * @returns Refs to attach to header and sub-tab elements
 */
export function useHeaderHeight() {
  const headerRef = useRef<HTMLElement>(null);
  const subTabsRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const updateCSSVariables = useCallback(() => {
    const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
    const subTabsHeight = subTabsRef.current?.getBoundingClientRect().height ?? 0;
    const total = headerHeight + subTabsHeight;

    document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    document.documentElement.style.setProperty('--subtabs-height', `${subTabsHeight}px`);
    document.documentElement.style.setProperty('--sticky-offset', `${total}px`);
  }, []);

  useLayoutEffect(() => {
    updateCSSVariables();

    observerRef.current = new ResizeObserver(() => {
      updateCSSVariables();
    });

    if (headerRef.current) {
      observerRef.current.observe(headerRef.current);
    }
    if (subTabsRef.current) {
      observerRef.current.observe(subTabsRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [updateCSSVariables]);

  return { headerRef, subTabsRef };
}
