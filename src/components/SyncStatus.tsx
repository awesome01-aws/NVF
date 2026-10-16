/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { getSyncQueue, getSyncProblem, syncPendingQueue, QueuedMutation, retryQueuedChange, keepBothQueuedChange, discardQueuedChange } from '../lib/offlineStore';

interface SyncStatusProps {
  token: string | null;
  onSyncComplete?: () => void;
}

export default function SyncStatus({ token, onSyncComplete }: SyncStatusProps) {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingQueue, setPendingQueue] = useState<QueuedMutation[]>(getSyncQueue());
  const [syncProblem, setSyncProblem] = useState<string | null>(getSyncProblem());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Two-tap confirm for "Discard" (same in-app pattern as cage delete; no window.confirm in Android WebViews).
  const [confirmDiscardId, setConfirmDiscardId] = useState<string>('');
  const attentionItems = pendingQueue.filter(item => !!item.status);
  const waitingItems = pendingQueue.filter(item => !item.status);
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const refreshState = () => {
    setIsOnline(navigator.onLine);
    setPendingQueue(getSyncQueue());
    setSyncProblem(getSyncProblem());
  };

  useEffect(() => {
    refreshState();

    const handleOnline = () => {
      setIsOnline(true);
      refreshState();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setToastMessage('Offline. Supported changes stay on this phone until the server accepts them.');
      setTimeout(() => setToastMessage(null), 5000);
    };

    const handleOfflineChange = () => {
      setPendingQueue(getSyncQueue());
      setSyncProblem(getSyncProblem());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('nvf_offline_change', handleOfflineChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('nvf_offline_change', handleOfflineChange);
    };
  }, []);

  const handleManualSync = async () => {
    if (!token || isSyncing) return;
    setIsSyncing(true);
    try {
      const { success, syncedCount, stopped, needsAttention } = await syncPendingQueue(token);
      if (success) {
        setToastMessage(`Successfully synced ${syncedCount} queued record(s) to server database!`);
        setTimeout(() => setToastMessage(null), 4000);
        if (onSyncComplete) onSyncComplete();
      } else if (!stopped && needsAttention > 0) {
        showToast(`${syncedCount} change(s) saved. ${needsAttention} need your attention in the list.`);
        setShowDetails(true);
        if (onSyncComplete) onSyncComplete();
      } else {
        setToastMessage('Sync partially completed. Some changes remain in queue.');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      setToastMessage('Failed to connect to server during sync.');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsSyncing(false);
      setPendingQueue(getSyncQueue());
      setSyncProblem(getSyncProblem());
    }
  };

  // "Retry" and "Keep both" put the change back in line and send it now.
  const handleResend = async (item: QueuedMutation, keepBoth: boolean) => {
    if (isSyncing) return;
    setConfirmDiscardId('');
    if (keepBoth) keepBothQueuedChange(item.id); else retryQueuedChange(item.id);
    refreshState();
    if (navigator.onLine) await handleManualSync();
    else showToast('Saved on this phone. It will be sent when the internet returns.');
  };

  const handleDiscard = async (item: QueuedMutation) => {
    if (isSyncing) return;
    if (confirmDiscardId !== item.id) { setConfirmDiscardId(item.id); return; }
    setConfirmDiscardId('');
    await discardQueuedChange(item.id, token);
    refreshState();
    showToast('Change removed from this phone. Nothing already on the farm server was deleted.');
    if (onSyncComplete) onSyncComplete();
  };

  const attentionText = (item: QueuedMutation) => item.status === 'duplicate'
    ? `This looks like an entry already made by ${item.duplicateOf?.by || 'someone else'}: ${item.duplicateOf?.summary || item.description}. Keep both or Discard?`
    : item.status === 'held'
    ? (item.error || 'Waiting for an earlier change that did not save.')
    : `Not saved: ${item.error || 'The farm server refused this change.'}`;

  return (
    <div className="relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between border border-emerald-500/30 animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-2 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Connection & Sync Status Indicator Button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-full text-xs font-semibold transition-all border shadow-sm ${
            !isOnline
              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              : syncProblem || attentionItems.length > 0
              ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
              : pendingQueue.length > 0
              ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
          }`}
          title={
            !isOnline
              ? 'Working Offline - Click to view queued changes'
              : pendingQueue.length > 0
              ? `${pendingQueue.length} changes saved on this phone; tap to view`
              : 'No changes waiting on this phone'
          }
        >
          {isSyncing ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
          ) : !isOnline ? (
            <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          ) : syncProblem || attentionItems.length > 0 ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          ) : pendingQueue.length > 0 ? (
            <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
          ) : (
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          )}

          <span className="inline">
            {isSyncing
              ? 'Syncing...'
              : !isOnline
              ? `On this phone (${pendingQueue.length})`
              : syncProblem || attentionItems.length > 0
              ? 'Needs attention'
              : pendingQueue.length > 0
              ? `${pendingQueue.length} to share`
              : 'No changes waiting'}
          </span>

          {pendingQueue.length > 0 && (
            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {pendingQueue.length}
            </span>
          )}

          <span className="hidden sm:inline-block">
            {showDetails ? (
              <ChevronUp className="w-3 h-3 text-slate-500" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-500" />
            )}
          </span>
        </button>
      </div>

      {/* Expandable Queued Operations Drawer/Dropdown */}
      {showDetails && (
        <div className="fixed inset-x-3 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-auto mt-2 w-auto sm:w-80 max-h-[75vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              {!isOnline ? (
                <WifiOff className="w-4 h-4 text-amber-500" />
              ) : syncProblem ? (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              ) : (
                <Wifi className="w-4 h-4 text-emerald-500" />
              )}
              <span className="font-bold text-slate-800">
                {!isOnline ? 'Internet unavailable' : syncProblem ? 'Farm server unavailable' : 'Internet available'}
              </span>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                !isOnline ? 'bg-amber-100 text-amber-800' : syncProblem ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {!isOnline ? 'OFFLINE' : syncProblem ? 'WAITING' : 'ONLINE'}
            </span>
          </div>

          <p className="text-slate-600 mb-3 text-[11px] leading-relaxed">
            {!isOnline
              ? 'You are currently offline. All edits and new records are saved locally and will auto-sync when internet returns.'
              : pendingQueue.length > 0
              ? 'You have offline changes queued for synchronization.'
              : 'No changes are waiting on this phone. Other family devices update through the shared server.'}
          </p>
          {syncProblem && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Needs attention: {syncProblem}</p>}

          {/* Changes that need the person: refused, possible duplicate, or waiting on one of those */}
          {attentionItems.length > 0 && (
            <div className="mb-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-1">
                Needs your attention ({attentionItems.length})
              </div>
              {attentionItems.map(item => (
                <div key={item.id} className="bg-rose-50 p-2.5 rounded-xl border border-rose-200" data-sync-attention={item.status}>
                  <p className="font-semibold text-slate-800 break-words">{item.description}</p>
                  <p role="alert" className="text-[11px] text-rose-800 mt-1 break-words">{attentionText(item)}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {item.status === 'failed' && (
                      <button type="button" disabled={isSyncing} onClick={() => handleResend(item, false)} className="min-h-9 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800 disabled:opacity-50">Retry</button>
                    )}
                    {item.status === 'duplicate' && (
                      <button type="button" disabled={isSyncing} onClick={() => handleResend(item, true)} className="min-h-9 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800 disabled:opacity-50">Keep both</button>
                    )}
                    <button type="button" disabled={isSyncing} aria-label={confirmDiscardId === item.id ? `Confirm discard ${item.description}` : `Discard ${item.description}`} onClick={() => handleDiscard(item)} className={`min-h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${confirmDiscardId === item.id ? 'bg-rose-600 text-white' : 'border border-rose-300 bg-white text-rose-700'}`}>
                      {confirmDiscardId === item.id ? 'Tap to confirm discard' : 'Discard'}
                    </button>
                    {confirmDiscardId === item.id && (
                      <button type="button" onClick={() => setConfirmDiscardId('')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Cancel</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending Sync Queue List */}
          {waitingItems.length > 0 ? (
            <div className="mb-3 max-h-48 overflow-y-auto space-y-2 pr-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Queued Changes ({waitingItems.length})
              </div>
              {waitingItems.map(item => (
                <div
                  key={item.id}
                  className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{item.description}</p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-bold uppercase">
                    {item.method}
                  </span>
                </div>
              ))}
            </div>
          ) : attentionItems.length > 0 ? null : (
            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-center mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-emerald-800 font-medium text-[11px]">No pending offline changes</p>
            </div>
          )}

          {/* Sync Action Button */}
          {isOnline && waitingItems.length > 0 && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Server Data...' : 'Sync All Pending Records'}</span>
            </button>
          )}

          {!isOnline && (
            <div className="text-center text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg font-medium border border-amber-200">
              Auto-sync will trigger automatically upon reconnection
            </div>
          )}
        </div>
      )}
    </div>
  );
}
