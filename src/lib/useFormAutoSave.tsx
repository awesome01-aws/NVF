import React, { useEffect, useRef, useState } from 'react';

/**
 * Custom hook to auto-save and auto-restore form drafts using localStorage.
 *
 * @param key Unique localStorage key (e.g., 'nvf_draft_incubator_batch')
 * @param currentValues Object containing current form field values
 * @param restoreValues Callback to set state with restored draft values
 * @param options Configuration options
 */
export function useFormAutoSave<T extends Record<string, any>>(
  key: string,
  currentValues: T,
  restoreValues: (draft: Partial<T>) => void,
  options?: { enabled?: boolean }
) {
  const isRestoredRef = useRef(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Restore draft on initial mount
  useEffect(() => {
    if (options?.enabled === false) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          // Verify if there is any non-empty value
          const hasNonEmptyVal = Object.values(parsed).some(
            (val) => val !== '' && val !== null && val !== undefined
          );
          if (hasNonEmptyVal) {
            restoreValues(parsed);
            setHasRestoredDraft(true);
          }
        }
      }
    } catch (e) {
      console.warn(`[AutoSave] Could not restore draft for ${key}:`, e);
    }
    isRestoredRef.current = true;
  }, [key]);

  // Persist values on change
  useEffect(() => {
    if (options?.enabled === false) return;
    if (!isRestoredRef.current) return; // Prevent overwriting before restore

    const hasNonEmptyVal = Object.values(currentValues).some(
      (val) => val !== '' && val !== null && val !== undefined
    );

    if (hasNonEmptyVal) {
      try {
        localStorage.setItem(key, JSON.stringify(currentValues));
      } catch (e) {
        console.warn(`[AutoSave] Could not save draft for ${key}:`, e);
      }
    } else {
      localStorage.removeItem(key);
    }
  }, [key, currentValues]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(key);
      setHasRestoredDraft(false);
    } catch (e) {
      console.warn(`[AutoSave] Could not clear draft for ${key}:`, e);
    }
  };

  return {
    hasRestoredDraft,
    clearDraft,
    setHasRestoredDraft
  };
}

/**
 * Reusable component to inform user that a draft was restored,
 * allowing them to discard it if desired.
 */
export function DraftSavedBadge({
  hasRestoredDraft,
  onDiscard,
  label = 'Draft restored from previous session'
}: {
  hasRestoredDraft: boolean;
  onDiscard: () => void;
  label?: string;
}) {
  if (!hasRestoredDraft) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-3 bg-amber-500/10 border border-amber-300/60 rounded-xl text-xs font-medium text-amber-900 animate-in fade-in duration-200">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <span>{label}</span>
      </div>
      <button
        type="button"
        onClick={onDiscard}
        className="px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:text-amber-950 hover:bg-amber-200/50 rounded-lg transition-colors cursor-pointer"
      >
        Clear Draft
      </button>
    </div>
  );
}
