/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Home, Egg, BarChart3, Heart, Bell, Search, Menu, X, FileSpreadsheet } from 'lucide-react';
import { ActiveTab } from '../types';
import SyncStatus from './SyncStatus';
import AppLogo from './AppLogo';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: { name: string; username: string } | null;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
  onOpenExcelImport?: () => void;
  onOpenSearch?: () => void;
  token?: string | null;
  onSyncComplete?: () => void;
}

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  currentUser, 
  unreadNotificationsCount = 0,
  onOpenNotifications,
  onOpenExcelImport,
  onOpenSearch,
  token = null,
  onSyncComplete
}: NavbarProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'home', label: 'Home', icon: <Home size={19} className="stroke-[2.2]" />, description: 'Overview & Tasks' },
    { id: 'farm', label: 'Farm', icon: <Heart size={19} className="stroke-[2.2]" />, description: 'Flocks & Inventory' },
    { id: 'incubator', label: 'Incubator', icon: <Egg size={19} className="stroke-[2.2]" />, description: 'Batches & Clients' },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={19} className="stroke-[2.2]" />, description: 'Analytics & PDF' },
  ];

  return (
    <>
      {/* Modern Translucent App Header */}
      <header id="app_header" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 transition-all shadow-2xs">
        <div className="max-w-7xl xl:max-w-[1536px] mx-auto w-full flex items-center justify-between gap-2 sm:gap-4">
          <AppLogo size="sm" />

          {/* Desktop Segmented Navigation Bar */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/60 shadow-inner">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-emerald-800 shadow-sm font-extrabold ring-1 ring-slate-900/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {currentUser && (
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Global Search Trigger Button */}
              <button
                onClick={onOpenSearch}
                  className="min-h-10 min-w-10 p-2 sm:px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-xl text-emerald-800 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Search Batches, Clients & Records (Ctrl+K)"
              >
                <Search size={15} className="text-slate-500 shrink-0" />
                <span className="text-xs font-semibold hidden lg:inline text-slate-600">Search</span>
                <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-400 bg-white border border-slate-200 rounded-md">
                  ⌘K
                </kbd>
              </button>

              {/* Excel Import Button */}
              {onOpenExcelImport && (
                <button
                  onClick={onOpenExcelImport}
                  className="hidden lg:flex px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer items-center gap-1"
                  title="Import Excel or CSV Data"
                >
                  <span className="text-xs sm:text-sm">📥</span>
                  <span className="hidden sm:inline">Excel</span>
                </button>
              )}

              {/* Offline Sync Status Indicator */}
              <SyncStatus token={token} onSyncComplete={onSyncComplete} />

              {/* Notification Bell */}
              <button
                onClick={onOpenNotifications}
                  className="relative min-h-10 min-w-10 p-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-800 rounded-xl transition-all cursor-pointer"
                title="Hatchery & Farm Reminders"
              >
                <Bell size={15} className={unreadNotificationsCount > 0 ? "animate-bounce text-amber-600" : ""} />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-white shadow-xs">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              {/* User Profile Pill */}
              <div className="flex items-center gap-1 sm:gap-2 pl-0.5 sm:pl-1 sm:border-l sm:border-slate-200">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-800 leading-tight">{currentUser.name}</span>
                  <span className="text-[10px] text-slate-400 font-medium">Operator</span>
                </div>
                <button type="button" aria-label="Open farm tools" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="min-h-10 min-w-10 flex items-center justify-center border border-emerald-100 rounded-xl bg-emerald-50 text-emerald-800">
                  {menuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {menuOpen && <div className="fixed inset-x-3 top-16 sm:left-auto sm:right-5 sm:w-96 z-50 bg-white border border-emerald-100 rounded-2xl shadow-2xl p-4 space-y-2" role="dialog" aria-label="Farm tools menu">
        <p className="font-bold text-emerald-950 px-2 pb-2">Farm tools</p>
        <button type="button" onClick={() => { onOpenSearch?.(); setMenuOpen(false); }} className="w-full min-h-11 px-3 rounded-xl text-left hover:bg-emerald-50 flex items-center gap-3"><Search size={19}/> Find a record</button>
        <button type="button" onClick={() => { onOpenExcelImport?.(); setMenuOpen(false); }} className="w-full min-h-11 px-3 rounded-xl text-left hover:bg-emerald-50 flex items-center gap-3"><FileSpreadsheet size={19}/> Import spreadsheet</button>
        <button type="button" onClick={() => { onOpenNotifications?.(); setMenuOpen(false); }} className="w-full min-h-11 px-3 rounded-xl text-left hover:bg-emerald-50 flex items-center gap-3"><Bell size={19}/> Reminders & alerts</button>
      </div>}

      {/* Modern High-Clarity Mobile Bottom Navigation */}
      <nav id="bottom_nav" className="fixed bottom-0 left-0 right-0 z-50 bg-white/98 backdrop-blur-lg border-t border-slate-200/90 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-3 pb-safe md:hidden">
        <div className="max-w-md mx-auto flex justify-between items-center h-16">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`nav_tab_${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col justify-center items-center h-full min-h-[48px] gap-1 transition-all outline-none cursor-pointer select-none active:scale-95 ${
                  isActive
                    ? 'text-emerald-800 font-extrabold'
                    : 'text-slate-400 hover:text-slate-700 font-bold'
                }`}
              >
                <div
                  className={`py-1 px-4 rounded-xl transition-all ${
                    isActive
                      ? 'bg-emerald-100 text-emerald-800 shadow-2xs'
                      : 'bg-transparent text-slate-500'
                  }`}
                >
                  {tab.icon}
                </div>
                <span className={`text-[11px] tracking-tight ${isActive ? 'font-black text-emerald-900' : 'font-semibold text-slate-500'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
