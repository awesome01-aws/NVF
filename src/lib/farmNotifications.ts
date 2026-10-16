import { useEffect } from 'react';
import { reminderSection, type ActiveNotification } from './farmReminders';

type NotifiableReminder = { id: string; title: string; description: string; type?: ActiveNotification['type'] };

/** Android browsers use the service worker notification surface while the app is running. */
export async function notifyFarmReminder(reminder: NotifiableReminder): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const options = { body: reminder.description, icon: '/apple-touch-icon.png', tag: reminder.id, data: { section: reminderSection(reminder.type || 'rabbit') } };
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration?.showNotification) await registration.showNotification(reminder.title, options);
  else new Notification(reminder.title, options);
  return true;
}
const sending = new Set<string>();
/** Shows each reminder once as a phone notification (remembered per phone). Mounted at app level. */
export function useFarmNotifications(reminders: NotifiableReminder[]) {
  useEffect(() => {
    for (const reminder of reminders) {
      const key = `nvf_notice_${reminder.id}`;
      if (sending.has(key)) continue;
      try { if (localStorage.getItem(key)) continue; } catch { /* Storage may be disabled. */ }
      sending.add(key);
      void notifyFarmReminder(reminder).then(sent => {
        if (sent) { try { localStorage.setItem(key, 'sent'); } catch { /* In-app reminders still work. */ } }
      }).catch(() => { /* Keep the in-app reminder available when system notifications fail. */ }).finally(() => sending.delete(key));
    }
  }, [reminders]);
}
