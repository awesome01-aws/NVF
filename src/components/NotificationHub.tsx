import React, { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, X, Phone, MessageSquare, ArrowRight, CheckCircle2, ShieldAlert, Egg } from 'lucide-react';
import { IncubatorRecord, DailyEggCollection, DbSchema } from '../types';
import { rabbitReminders } from '../lib/farmViews';
import { notifyFarmReminder } from '../lib/farmNotifications';
import { useFarmToday } from '../lib/useFarmToday';
import { getCameroonTodayISO, formatDateDDMMYYYY } from '../utils/dateUtils';

interface NotificationHubProps {
  db: Partial<DbSchema> & {
    incubator_records: IncubatorRecord[];
    daily_egg_collections?: DailyEggCollection[];
  };
  onOpenEditRecord: (record: IncubatorRecord) => void;
  onOpenEggCollection?: () => void;
  onOpenRabbits?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export interface ActiveNotification {
  id: string;
  type: 'day18' | 'day21' | 'eggCollection' | 'rabbit';
  title: string;
  description: string;
  clientName?: string;
  clientMark?: string;
  clientPhone?: string;
  eggsCollected?: number;
  expectedDate?: string;
  record?: IncubatorRecord;
}

export default function NotificationHub({ db, onOpenEditRecord, onOpenEggCollection, onOpenRabbits, isOpen, onClose }: NotificationHubProps) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  
  // Track notifications already alerted via Web Notification API to prevent spam
  const sentWebNotificationsRef = useRef<Set<string>>(new Set());

  // Derive notifications list in real-time
  const todayStr = useFarmToday();
  const todayTime = new Date(todayStr).getTime();

  const getActiveNotifications = (): ActiveNotification[] => {
    const list: ActiveNotification[] = rabbitReminders(db, todayStr).map(item => ({ ...item, type: 'rabbit' }));
    
    // 1. Check 6:00 PM Daily Egg Collection Alert
    const now = new Date();
    const currentHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Douala' }).format(now));
    const hasEggRecordToday = (db.daily_egg_collections || []).some((rec) => rec.date === todayStr && rec.poultryRecorded !== false);

    if (currentHour >= 18 && !hasEggRecordToday) {
      list.push({
        id: `egg-alert-${todayStr}`,
        type: 'eggCollection',
        title: '🥚 6:00 PM Daily Egg Collection Alert!',
        description: `Daily farm egg collection for today (${formatDateDDMMYYYY(todayStr)}) has not been logged yet. Please enter Brahma & Turkey egg counts.`,
        expectedDate: todayStr
      });
    }

    if (!db.incubator_records) return list;

    db.incubator_records.forEach((rec) => {
      if (rec.ownerType === 'farm') return;
      const broughtTime = new Date(rec.dateBrought).getTime();
      const daysDiff = Math.floor((todayTime - broughtTime) / (24 * 60 * 60 * 1000));
      const species = rec.eggType || 'Brahma';

      let candleDay = 8;
      let transferDay = 18;
      let hatchDay = 21;

      if (species === 'Turkey') {
        candleDay = 10;
        transferDay = 25;
        hatchDay = 28;
      } else if (species === 'Quail') {
        candleDay = -1; // No candling
        transferDay = 15;
        hatchDay = 18;
      } else if (species === 'Goose') {
        candleDay = 10;
        transferDay = 26;
        hatchDay = 30;
      }

      // Day X Hatcher Transfer Notification:
      // For Quail: scan is not required to trigger transfer. For others: scan is checked.
      const hasScan = species === 'Quail' || (rec.eggsAfterScan !== null && rec.eggsAfterScan !== undefined);
      if (hasScan && daysDiff >= transferDay && daysDiff < hatchDay && (rec.chicksHatched === null || rec.chicksHatched === undefined)) {
        list.push({
          id: `day18-${rec.id}`,
          type: 'day18',
          title: `${species} Day ${transferDay}: Send to Hatcher`,
          description: `${rec.clientName} (${rec.clientMark}) • ${rec.eggsAfterScan !== null ? rec.eggsAfterScan : rec.eggsCollected} / ${rec.eggsCollected} eggs must be transferred from incubator to hatcher trays.`,
          clientName: rec.clientName,
          clientMark: rec.clientMark,
          clientPhone: rec.clientPhone,
          eggsCollected: rec.eggsCollected,
          expectedDate: rec.day18Date,
          record: rec
        });
      }

      // Day Y Hatched & Call Client Notification:
      if (daysDiff >= hatchDay && (rec.chicksHatched === null || rec.chicksHatched === undefined)) {
        list.push({
          id: `day21-${rec.id}`,
          type: 'day21',
          title: `${species} Day ${hatchDay}: Hatch Complete!`,
          description: `${rec.clientName} (${rec.clientMark}) • Day ${hatchDay} cycle complete for ${rec.eggsCollected} eggs. Count hatched chicks, and call client immediately.`,
          clientName: rec.clientName,
          clientMark: rec.clientMark,
          clientPhone: rec.clientPhone,
          eggsCollected: rec.eggsCollected,
          expectedDate: rec.day21Date,
          record: rec
        });
      }
    });

    return list;
  };

  const activeReminders = getActiveNotifications();

  // Handle requesting browser Notification Permissions
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
    } catch (err) {
      console.error('Error requesting notification permission:', err);
    }
  };

  // Run alert trigger to send native/system push notifications
  useEffect(() => {
    if (permission === 'granted' && activeReminders.length > 0) {
      activeReminders.forEach((reminder) => {
        // Only trigger once per session/ID to avoid nagging the user
        if (!sentWebNotificationsRef.current.has(reminder.id)) {
          sentWebNotificationsRef.current.add(reminder.id);
          try {
            const key = `nvf_notice_${reminder.id}`;
            if (reminder.type === 'rabbit' && localStorage.getItem(key)) return;
            void notifyFarmReminder(reminder).then(sent => { if (sent && reminder.type === 'rabbit') localStorage.setItem(key, 'sent'); }).catch(() => {});
          } catch (err) {
            console.error('Failed to trigger web notification:', err);
          }
        }
      });
    }
  }, [activeReminders, permission]);

  // WhatsApp client message generator
  const sendWhatsAppReminder = (reminder: ActiveNotification) => {
    const cleanPhone = reminder.clientPhone.replace(/\D/g, '');
    const finalPhone = cleanPhone.startsWith('237') ? cleanPhone : `237${cleanPhone}`;
    const species = reminder.record.eggType || 'Brahma';
    const transDay = species === 'Turkey' ? 25 : species === 'Quail' ? 15 : species === 'Goose' ? 26 : 18;
    const hatchDay = species === 'Turkey' ? 28 : species === 'Quail' ? 18 : species === 'Goose' ? 30 : 21;
    
    let text = '';
    if (reminder.type === 'day21') {
      text = `Hello ${reminder.clientName}, this is New Vision Farms (${species} Hatchery). This is a friendly update that your egg batch (Mark: ${reminder.clientMark}) brought on ${reminder.record.dateBrought} has reached Day ${hatchDay} (Hatched!). Please coordinate with us to collect your chicks. Thank you!`;
    } else {
      text = `Hello ${reminder.clientName}, this is New Vision Farms (${species} Hatchery). Just keeping you updated that your egg batch (Mark: ${reminder.clientMark}) brought on ${reminder.record.dateBrought} has entered Day ${transDay} (Transfer phase). We are moving your eggs safely to our hatching trays!`;
    }

    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div id="notification_drawer_backdrop" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex justify-end animate-in fade-in duration-200">
      <div 
        id="notification_drawer" 
        className="w-full max-w-md bg-slate-55 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-250 ease-out border-l border-slate-100 bg-white"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="bg-amber-100 text-amber-700 p-1.5 rounded-lg">
              <Bell size={18} className="animate-wiggle" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Hatchery Assistant</h2>
              <p className="text-[10px] font-bold text-slate-400">Critical Reminders & Alerts</p>
            </div>
          </div>
          <button 
            type="button"
            aria-label="Close reminders"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Browser Push Permission Controller Status Banner */}
        <div className="p-3 bg-slate-900 text-white text-[11px] font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400">⚡</span>
            <span>
              {permission === 'granted' 
                ? 'Desktop & Browser Alerts are Active' 
                : 'Turn on Desktop notifications?'}
            </span>
          </div>
          {permission !== 'granted' && (
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-[9px] uppercase tracking-widest text-white cursor-pointer font-black"
            >
              Enable
            </button>
          )}
        </div>

        {/* List content panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeReminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">Perfect Hatchery Status</h3>
                <p className="text-xs text-slate-400 hover:text-slate-500 mt-1 max-w-[240px]">
                  No active egg transfers or overdue hatch entries for today. Everyone is updated!
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-450 mb-1">
                Outstanding Schedules ({activeReminders.length})
              </p>
              
              {activeReminders.map((reminder) => {
                if (reminder.type === 'rabbit') return <div key={reminder.id} className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h4 className="font-bold text-emerald-950">{reminder.title}</h4><p className="text-sm text-slate-700">{reminder.description}</p><button type="button" onClick={() => { onOpenRabbits?.(); onClose(); }} className="min-h-12 rounded-xl bg-emerald-700 px-4 font-semibold text-white">Open rabbit records</button></div>;
                if (reminder.type === 'eggCollection') {
                  return (
                    <div 
                      key={reminder.id}
                      className="p-3.5 rounded-2xl border bg-orange-50/60 border-orange-200 hover:border-orange-300 transition-all text-left flex flex-col space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-orange-500 text-white">
                            ⏰ 6:00 PM Farm Alert
                          </span>
                          <h4 className="text-sm font-black text-slate-900 leading-tight mt-1">{reminder.title}</h4>
                        </div>
                        <span className="text-[11px] font-bold text-orange-600 whitespace-nowrap">{formatDateDDMMYYYY(reminder.expectedDate)}</span>
                      </div>

                      <p className="text-xs text-slate-700 font-medium leading-relaxed">
                        {reminder.description}
                      </p>

                      <div className="pt-2 border-t border-orange-200/60 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenEggCollection) onOpenEggCollection();
                            onClose();
                          }}
                          className="p-2 px-3 bg-orange-600 text-white hover:bg-orange-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                        >
                          <Egg size={13} />
                          <span>Log Today's Eggs Now</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  );
                }

                const isDay21 = reminder.type === 'day21';
                const species = reminder.record?.eggType || 'Brahma';
                const transDay = species === 'Turkey' ? 25 : species === 'Quail' ? 15 : species === 'Goose' ? 26 : 18;
                const hatchDay = species === 'Turkey' ? 28 : species === 'Quail' ? 18 : species === 'Goose' ? 30 : 21;

                return (
                  <div 
                    key={reminder.id} 
                    className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col space-y-3 ${
                      isDay21 
                        ? 'bg-rose-50/40 border-rose-100 hover:border-rose-200' 
                        : 'bg-amber-50/40 border-amber-100 hover:border-amber-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${
                          isDay21 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isDay21 ? `🐣 ${species} Day ${hatchDay} Hatch / Call` : `🥚 ${species} Day ${transDay} Hatcher Move`}
                        </span>
                        <h4 className="text-sm font-black text-slate-800 leading-tight mt-1">{reminder.title}</h4>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">{formatDateDDMMYYYY(reminder.expectedDate)}</span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium leading-relaxed leading-3">
                      {reminder.description}
                    </p>

                    {/* Contact Action Shortcuts wrapper */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                      {/* Call direct */}
                      <a 
                        href={`tel:${reminder.clientPhone}`}
                        className="p-1 px-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-extrabold text-slate-700 flex items-center gap-1 transition-all"
                        title={`Call ${reminder.clientName}`}
                      >
                        <Phone size={11} className="text-indigo-600" />
                        <span>Direct Call</span>
                      </a>

                      {/* WhatsApp trigger */}
                      <button
                        type="button"
                        onClick={() => sendWhatsAppReminder(reminder)}
                        className="p-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-100 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer"
                        title={`WhatsApp ${reminder.clientName}`}
                      >
                        <MessageSquare size={11} />
                        <span>Send WhatsApp</span>
                      </button>

                      {/* Go to Incubator Edit Flow */}
                      <button
                        type="button"
                        onClick={() => {
                          if (reminder.record) {
                            onOpenEditRecord(reminder.record);
                          }
                          onClose();
                        }}
                        className="p-1 px-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <span>Update Batch</span>
                        <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Drawer footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1">
            <ShieldAlert size={10} className="text-emerald-500" />
            <span>NVF Smart Reminders safety net</span>
          </p>
        </div>
      </div>
    </div>
  );
}
