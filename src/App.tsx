/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ActiveTab, IncubatorRecord, Flock, FeedRecord, PoultrySale, Mortality, Expense, CageTransfer, DailyEggCollection, FowlEatenRecord } from './types';
import { getCameroonTodayISO } from './utils/dateUtils';
import Navbar from './components/Navbar';
import HomeDashboard from './components/HomeDashboard';
const PoultryMod = React.lazy(() => import('./components/PoultryMod'));
const IncubatorMod = React.lazy(() => import('./components/IncubatorMod'));
const ReportsMod = React.lazy(() => import('./components/ReportsMod'));
import { RefreshCw, Sparkles } from 'lucide-react';
import { rabbitReminders } from './lib/farmViews';
import { useFarmToday } from './lib/useFarmToday';
const NotificationHub = React.lazy(() => import('./components/NotificationHub'));
const ExcelImportModal = React.lazy(() => import('./components/ExcelImportModal'));
const GlobalSearchModal = React.lazy(() => import('./components/GlobalSearchModal'));
import Footer from './components/Footer';

export default function App() {
  const token = 'open-access-operator';
  const currentUser = { id: 'operator', username: 'operator', name: 'Farm member' };

  useEffect(() => {
    // The phone queue still expects an operator token, but the server no longer
    // treats this public-mode marker as a secret or a family login.
    localStorage.setItem('nvf_operator_token', token);
    localStorage.removeItem('nvf_operator_user');
  }, []);

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Main database schema
  const [db, setDb] = useState<{
    clients: any[];
    incubator_records: IncubatorRecord[];
    flocks: Flock[];
    feed_records: FeedRecord[];
    poultry_sales: PoultrySale[];
    mortality: Mortality[];
    expenses: Expense[];
    cage_transfers: CageTransfer[];
    daily_egg_collections?: DailyEggCollection[];
    fowls_eaten?: FowlEatenRecord[];
  }>({
    clients: [],
    incubator_records: [],
    flocks: [],
    feed_records: [],
    poultry_sales: [],
    mortality: [],
    expenses: [],
    cage_transfers: [],
    daily_egg_collections: [],
    fowls_eaten: []
  });

  // Modal selector for Incubator Record and Client updates
  const [selectedEditRecord, setSelectedEditRecord] = useState<IncubatorRecord | null>(null);
  const [selectedClientForEdit, setSelectedClientForEdit] = useState<any | null>(null);

  // Reminders assistant drawer toggles
  const [isNotificationHubOpen, setIsNotificationHubOpen] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  // Keyboard shortcut (Ctrl+K or ⌘K) to open search modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Derive unread/active notifications count for Day 18, Day 21, and 6 PM Egg Collection
  const todayStr = useFarmToday();
  const todayTime = new Date(todayStr).getTime();
  const currentHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Douala' }).format(new Date()));
  const hasEggRecordToday = (db.daily_egg_collections || []).some(rec => rec.date === todayStr && rec.poultryRecorded !== false);

  const incubatorRemindersCount = db.incubator_records?.reduce((acc, rec) => {
    if (rec.ownerType === 'farm') return acc;
    const broughtTime = new Date(rec.dateBrought).getTime();
    const daysDiff = Math.floor((todayTime - broughtTime) / (24 * 60 * 60 * 1000));
    const species = rec.eggType || 'Brahma';

    let transferDay = 18;
    let hatchDay = 21;

    if (species === 'Turkey') {
      transferDay = 25;
      hatchDay = 28;
    } else if (species === 'Quail') {
      transferDay = 15;
      hatchDay = 18;
    } else if (species === 'Goose') {
      transferDay = 26;
      hatchDay = 30;
    }
    
    const hasDay18Alert = daysDiff >= transferDay && daysDiff < hatchDay && (rec.chicksHatched === null || rec.chicksHatched === undefined);
    const hasDay21Alert = daysDiff >= hatchDay && (rec.chicksHatched === null || rec.chicksHatched === undefined);
    
    if (hasDay18Alert || hasDay21Alert) {
      return acc + 1;
    }
    return acc;
  }, 0) || 0;

  const activeRemindersCount = incubatorRemindersCount + rabbitReminders(db, todayStr).length + (currentHour >= 18 && !hasEggRecordToday ? 1 : 0);

  // Quick Action Form forwarders (enables triggering collapsible toggles from Dashboard)
  const [quickFormKey, setQuickFormKey] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('farm') === 'rabbits') { setActiveTab('farm'); setQuickFormKey('rabbits'); }
  }, []);

  // Sync / Refresh main DB state with ETag caching
  const lastETagRef = React.useRef<string | null>(null);

  const syncDatabase = useCallback(async (authToken: string, isSilent = false) => {
    if (!isSilent) {
      setIsLoading(true);
    }
    setErrorMsg('');
    try {
      const headers: Record<string, string> = {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      };
      if (isSilent && lastETagRef.current) {
        headers['If-None-Match'] = lastETagRef.current;
      }

      const res = await fetch('/api/data', { headers });

      if (res.status === 304) {
        // Unchanged on server -> skip parsing & re-renders cleanly!
        return;
      }

      if (res.status === 401) throw new Error('This server still requires sign-in. Refresh after the updated server is deployed.');
      if (!res.ok) {
        throw new Error('Failed to retrieve database contents.');
      }

      const etag = res.headers.get('ETag');
      if (etag) {
        lastETagRef.current = etag;
      }

      const data = await res.json();
      setDb(data);
    } catch (err: any) {
      if (!isSilent) {
        setErrorMsg(err.message || 'Error occurred communicating with server db.');
      }
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, []);

  // Trigger sync on load, setup active auto-polling background safety
  useEffect(() => {
    // Initial load - user visible loader is good for initial load
    syncDatabase(token);

    // Auto-sync interval: checks for updates every 6 seconds while the tab is active (fully silent background sync)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncDatabase(token, true);
      }
    }, 6000);

    // Sync immediately whenever the user brings the app back to focus (fully silent)
    const handleFocus = () => {
      syncDatabase(token, true);
    };

    const handleOfflineDataChange = (event: Event) => {
      if ((event as CustomEvent).detail?.change === 'data') syncDatabase(token, true);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('nvf_offline_change', handleOfflineDataChange);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('nvf_offline_change', handleOfflineDataChange);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [token, syncDatabase]);

  // Switch tab, helpful callbacks
  const handleOpenEditRecord = (record: IncubatorRecord) => {
    setSelectedEditRecord(record);
    setActiveTab('incubator');
  };

  const handleOpenClient = (client: any) => {
    setSelectedClientForEdit(client);
    setActiveTab('incubator');
  };

  const handleTriggerQuickForm = (formKey: string) => {
    setQuickFormKey(formKey);
  };

  return (
    <div id="app_root" className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* Brand Header */}
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser} 
        unreadNotificationsCount={activeRemindersCount}
        onOpenNotifications={() => setIsNotificationHubOpen(true)}
        onOpenExcelImport={() => setIsExcelImportOpen(true)}
        onOpenSearch={() => setIsGlobalSearchOpen(true)}
        token={token}
        onSyncComplete={() => syncDatabase(token, true)}
      />

      {/* Main Container Section */}
      <main id="app_main" className="flex-1 w-full max-w-7xl xl:max-w-[1536px] mx-auto px-2 sm:px-6 lg:px-8 pt-2 sm:pt-6 pb-24 sm:pb-20 overflow-y-auto transition-all">
        
        {/* Error notification banner */}
        {errorMsg && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-sm flex gap-2">
            <span>⚠️</span>
            <p className="font-semibold">{errorMsg}</p>
          </div>
        )}

        <React.Suspense fallback={<div role="status" className="rounded-2xl bg-white p-6 text-emerald-900">Loading farm records…</div>}>
        {/* Tab Router Switch */}
        {activeTab === 'home' && (
          <HomeDashboard
            db={db}
            currentUserName={currentUser?.name}
            setActiveTab={setActiveTab}
            onTriggerQuickForm={handleTriggerQuickForm}
            onOpenEditRecord={handleOpenEditRecord}
          />
        )}

        {activeTab === 'farm' && (
          <PoultryMod 
            data={db} 
            triggerRefresh={() => token && syncDatabase(token, true)}
            quickFormKey={quickFormKey}
            setQuickFormKey={setQuickFormKey}
            token={token}
          />
        )}

        {activeTab === 'incubator' && (
          <IncubatorMod 
            data={db} 
            triggerRefresh={() => token && syncDatabase(token, true)}
            token={token}
            selectedEditRecord={selectedEditRecord}
            setSelectedEditRecord={setSelectedEditRecord}
            selectedClientForEdit={selectedClientForEdit}
            setSelectedClientForEdit={setSelectedClientForEdit}
            quickFormKey={quickFormKey}
            setQuickFormKey={setQuickFormKey}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsMod db={db} />
        )}
        </React.Suspense>

        {/* Global Page Footer */}
        <Footer />
      </main>



      {/* Excel & CSV Import Wizard Modal */}
      <React.Suspense fallback={null}>
      {isExcelImportOpen && <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
        token={token}
        triggerRefresh={() => token && syncDatabase(token, true)}
      />}

      {/* Global Command Search Modal */}
      {isGlobalSearchOpen && <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        db={db}
        setActiveTab={setActiveTab}
        onOpenEditRecord={handleOpenEditRecord}
        onOpenClient={handleOpenClient}
        onOpenFarmSection={section => { setQuickFormKey(section); setActiveTab('farm'); }}
      />}

      {/* Modern sliding notifications hub drawer overlay */}
      {isNotificationHubOpen && <NotificationHub 
        db={db} 
        isOpen={isNotificationHubOpen} 
        onClose={() => setIsNotificationHubOpen(false)} 
        onOpenEditRecord={handleOpenEditRecord}
        onOpenRabbits={() => { setActiveTab('farm'); setQuickFormKey('rabbits'); }}
        onOpenEggCollection={() => {
          setActiveTab('farm');
          setQuickFormKey('egg_collection');
        }}
      />}
      </React.Suspense>
    </div>
  );
}
