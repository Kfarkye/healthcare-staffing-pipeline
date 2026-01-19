import { useEffect, useCallback } from 'react';
import type { TabId } from '../types/submittals';

interface ShortcutHandlers {
  onSearch: () => void;
  onTabSelect: (tab: TabId) => void;
  onTogglePriority: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const { onSearch, onTabSelect, onTogglePriority, onEscape } = handlers;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable;

    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      onSearch();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }

    if (isInput) return;

    if (event.key >= '1' && event.key <= '4') {
      event.preventDefault();
      const tabs: TabId[] = ['READY', 'SUBMITTED', 'OFFER', 'PRESTART'];
      const index = parseInt(event.key) - 1;
      onTabSelect(tabs[index]);
      return;
    }

    if (event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      onTogglePriority();
      return;
    }
  }, [onSearch, onTabSelect, onTogglePriority, onEscape]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function useTabListNavigation(
  activeIndex: number,
  totalTabs: number,
  onNavigate: (index: number) => void
) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const newIndex = activeIndex === 0 ? totalTabs - 1 : activeIndex - 1;
      onNavigate(newIndex);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const newIndex = activeIndex === totalTabs - 1 ? 0 : activeIndex + 1;
      onNavigate(newIndex);
    }
  }, [activeIndex, totalTabs, onNavigate]);

  return { handleKeyDown };
}
