import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { TabId, ReadySubTab } from '../types/submittals';

interface URLState {
  activeTab: TabId;
  readySubTab: ReadySubTab;
  searchQuery: string;
}

export function useURLState(defaults: URLState) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<URLState>(() => ({
    activeTab: (searchParams.get('tab') as TabId) || defaults.activeTab,
    readySubTab: (searchParams.get('view') as ReadySubTab) || defaults.readySubTab,
    searchQuery: searchParams.get('q') || defaults.searchQuery,
  }));

  const updateURL = useCallback((newState: Partial<URLState>) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newState.activeTab !== undefined) {
      params.set('tab', newState.activeTab);

      if (newState.activeTab !== 'READY') {
        params.delete('view');
      }
    }

    if (newState.readySubTab !== undefined && state.activeTab === 'READY') {
      if (newState.readySubTab === 'ALL') {
        params.delete('view');
      } else {
        params.set('view', newState.readySubTab);
      }
    }

    if (newState.searchQuery !== undefined) {
      if (newState.searchQuery === '') {
        params.delete('q');
      } else {
        params.set('q', newState.searchQuery);
      }
    }

    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [searchParams, router, pathname, state.activeTab]);

  const setActiveTab = useCallback((tab: TabId) => {
    setState(prev => ({ ...prev, activeTab: tab }));
    updateURL({ activeTab: tab });
  }, [updateURL]);

  const setReadySubTab = useCallback((subTab: ReadySubTab) => {
    setState(prev => ({ ...prev, readySubTab: subTab }));
    updateURL({ readySubTab: subTab });
  }, [updateURL]);

  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
    updateURL({ searchQuery: query });
  }, [updateURL]);

  useEffect(() => {
    const tab = searchParams.get('tab') as TabId;
    const view = searchParams.get('view') as ReadySubTab;
    const query = searchParams.get('q') || '';

    setState(prev => ({
      activeTab: tab || prev.activeTab,
      readySubTab: view || prev.readySubTab,
      searchQuery: query,
    }));
  }, [searchParams]);

  return {
    activeTab: state.activeTab,
    readySubTab: state.readySubTab,
    searchQuery: state.searchQuery,
    setActiveTab,
    setReadySubTab,
    setSearchQuery,
  };
}
