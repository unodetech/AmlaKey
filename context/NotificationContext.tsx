import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useLanguage } from "./LanguageContext";
import { useAuth } from "./AuthContext";
import { userKey, NOTIFICATIONS_KEY, NOTIFICATION_HISTORY_KEY } from "../lib/storage";
import { supabase } from "../lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────
export type NotificationType = "rent_due_reminder" | "overdue_rent" | "lease_expiry_warning" | "payment_received";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  tenantId?: string;
  propertyId?: string;
}

export interface NotificationSettings {
  rentRemindersEnabled: boolean;
  rentReminderDaysBefore: number;
  overdueAlertsEnabled: boolean;
  leaseExpiryEnabled: boolean;
  leaseExpiryDaysBefore: number;
  paymentConfirmationEnabled: boolean;
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  rentRemindersEnabled: true,
  rentReminderDaysBefore: 3,
  overdueAlertsEnabled: true,
  leaseExpiryEnabled: true,
  leaseExpiryDaysBefore: 14,
  paymentConfirmationEnabled: true,
  soundEnabled: true,
};

interface Tenant {
  id: string;
  name: string;
  monthly_rent: number;
  lease_start: string;
  lease_end?: string | null;
  status?: string;
  property_id?: string;
}

interface Payment {
  tenant_id: string;
  amount?: number;
}

// ── Storage keys (now user-scoped via lib/storage) ────────────────────────────
const MAX_HISTORY = 100;

// ── Configure foreground handler (must be called at module level) ──────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Context ────────────────────────────────────────────────────────────────────
interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  settings: NotificationSettings;
  permissionGranted: boolean;
  addNotification: (item: Omit<NotificationItem, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  updateSettings: (partial: Partial<NotificationSettings>) => Promise<void>;
  rescheduleAll: (tenants: Tenant[], payments: Payment[]) => Promise<void>;
  requestPermission: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  settings: DEFAULT_SETTINGS,
  permissionGranted: false,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearAll: () => {},
  updateSettings: async () => {},
  rescheduleAll: async () => {},
  requestPermission: async () => false,
});

export const useNotification = () => useContext(NotificationContext);

// ── Provider ───────────────────────────────────────────────────────────────────
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Load from storage on mount / user change ───────────────────────────────
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const [sRaw, hRaw] = await Promise.all([
          AsyncStorage.getItem(userKey(uid, NOTIFICATIONS_KEY)),
          AsyncStorage.getItem(userKey(uid, NOTIFICATION_HISTORY_KEY)),
        ]);
        if (sRaw) {
          try {
            const parsed = JSON.parse(sRaw);
            // Migrate from old simple { rentReminders, leaseExpiryAlerts } format
            if (parsed && typeof parsed.rentRemindersEnabled === "undefined") {
              const migrated: NotificationSettings = {
                ...DEFAULT_SETTINGS,
                rentRemindersEnabled: parsed.rentReminders ?? true,
                leaseExpiryEnabled: parsed.leaseExpiryAlerts ?? true,
              };
              setSettings(migrated);
              await AsyncStorage.setItem(userKey(uid, NOTIFICATIONS_KEY), JSON.stringify(migrated));
            } else {
              setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            }
          } catch {}
        }
        if (hRaw) {
          try { setNotifications(JSON.parse(hRaw)); } catch {}
        }
      } catch {}
    })();
  }, [uid]);

  // ── Register push token with Supabase ──────────────────────────────────────
  const registerPushToken = useCallback(async () => {
    if (!uid || Platform.OS === "web") return;
    try {
      const { data: tokenData } = await Notifications.getExpoPushTokenAsync({
        projectId: "89e0b67b-e1fc-43be-b7bc-8b0016285259",
      });
      if (tokenData) {
        await supabase.from("push_tokens").upsert(
          { user_id: uid, token: tokenData, platform: Platform.OS },
          { onConflict: "user_id,token" }
        );
      }
    } catch {}
  }, [uid]);

  // ── Request permission on mount ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") {
        setPermissionGranted(true);
        registerPushToken();
      }
    })();
  }, [registerPushToken]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") { setPermissionGranted(true); registerPushToken(); return true; }
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === "granted";
    setPermissionGranted(granted);
    if (granted) registerPushToken();
    return granted;
  }, [registerPushToken]);

  // ── Persist notifications whenever they change ──────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!uid) return; // Don't save when logged out
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const capped = notifications.slice(0, MAX_HISTORY);
      AsyncStorage.setItem(userKey(uid, NOTIFICATION_HISTORY_KEY), JSON.stringify(capped)).catch(() => {});
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [notifications, uid]);

  // ── Notification received listener ──────────────────────────────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as any;
      if (data?.type) {
        setNotifications((prev) => [{
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: data.type as NotificationType,
          title: n.request.content.title ?? "",
          body: n.request.content.body ?? "",
          timestamp: Date.now(),
          read: false,
          tenantId: data.tenantId,
          propertyId: data.propertyId,
        }, ...prev].slice(0, MAX_HISTORY));
      }
    });
    return () => sub.remove();
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const addNotification = useCallback((item: Omit<NotificationItem, "id" | "timestamp" | "read">) => {
    const newItem: NotificationItem = {
      ...item,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [newItem, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const updateSettings = useCallback(async (partial: Partial<NotificationSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    setSettings(next);
    settingsRef.current = next;
    if (uid) {
      await AsyncStorage.setItem(userKey(uid, NOTIFICATIONS_KEY), JSON.stringify(next));
      // Sync to Supabase for server-side push notifications
      supabase.from("notification_settings").upsert({
        user_id: uid,
        rent_reminders: next.rentRemindersEnabled,
        rent_reminder_days: next.rentReminderDaysBefore,
        overdue_alerts: next.overdueAlertsEnabled,
        lease_expiry: next.leaseExpiryEnabled,
        lease_expiry_days: next.leaseExpiryDaysBefore,
        sound: next.soundEnabled,
        lang,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" }).then(() => {});
    }
  }, [uid, lang]);

  // ── Schedule local notifications ────────────────────────────────────────────
  const rescheduleAll = useCallback(async (tenants: Tenant[], payments: Payment[]) => {
    if (!permissionGranted) {
      // Try requesting permission silently
      const granted = await requestPermission();
      if (!granted) return;
    }

    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}

    const s = settingsRef.current;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const currentMonth = todayStr.slice(0, 7);
    const paidByTenantMap = new Map<string, number>();
    for (const p of payments) {
      paidByTenantMap.set(p.tenant_id, (paidByTenantMap.get(p.tenant_id) ?? 0) + (p.amount ?? 0));
    }
    const isAr = lang === "ar";

    // Helper to replace %placeholders%
    const fill = (template: string, vars: Record<string, string>) => {
      let result = template;
      for (const [k, v] of Object.entries(vars)) {
        result = result.replace(`%${k}%`, v);
      }
      return result;
    };

    for (const tn of tenants) {
      if ((tn.status && tn.status !== "active") || !tn.lease_start) continue;

      const dueDay = new Date(tn.lease_start + "T12:00:00").getDate();
      const totalPaid = paidByTenantMap.get(tn.id) ?? 0;
      const hasPaid = totalPaid >= tn.monthly_rent;

      // ── Rent due reminder ───────────────────────────────────────────────────
      if (s.rentRemindersEnabled && !hasPaid) {
        // Current month
        const dueDateThisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay, 9, 0, 0);
        const reminderDate = new Date(dueDateThisMonth.getTime() - s.rentReminderDaysBefore * 86400000);
        if (reminderDate > today) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t("rentDueTitle"),
                body: fill(t("rentDueBody"), { name: tn.name, days: String(s.rentReminderDaysBefore) }),
                sound: s.soundEnabled ? "default" : undefined,
                data: { type: "rent_due_reminder", tenantId: tn.id, propertyId: tn.property_id },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
            });
          } catch {}
        }

        // Next month
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dueDay, 9, 0, 0);
        const reminderNext = new Date(nextMonth.getTime() - s.rentReminderDaysBefore * 86400000);
        if (reminderNext > today) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t("rentDueTitle"),
                body: fill(t("rentDueBody"), { name: tn.name, days: String(s.rentReminderDaysBefore) }),
                sound: s.soundEnabled ? "default" : undefined,
                data: { type: "rent_due_reminder", tenantId: tn.id, propertyId: tn.property_id },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderNext },
            });
          } catch {}
        }
      }

      // ── Overdue alert ───────────────────────────────────────────────────────
      if (s.overdueAlertsEnabled && !hasPaid) {
        const dueDateThisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay, 9, 0, 0);
        if (dueDateThisMonth > today) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t("overdueRentTitle"),
                body: fill(t("overdueRentBody"), { name: tn.name, amount: String(tn.monthly_rent) }),
                sound: s.soundEnabled ? "default" : undefined,
                data: { type: "overdue_rent", tenantId: tn.id, propertyId: tn.property_id },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dueDateThisMonth },
            });
          } catch {}
        }

        // 3 days after due date
        const threeDaysAfter = new Date(dueDateThisMonth.getTime() + 3 * 86400000);
        if (threeDaysAfter > today) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t("overdueRentTitle"),
                body: fill(t("overdueRentBody"), { name: tn.name, amount: String(tn.monthly_rent) }),
                sound: s.soundEnabled ? "default" : undefined,
                data: { type: "overdue_rent", tenantId: tn.id, propertyId: tn.property_id },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: threeDaysAfter },
            });
          } catch {}
        }

        // 7 days after due date
        const sevenDaysAfter = new Date(dueDateThisMonth.getTime() + 7 * 86400000);
        if (sevenDaysAfter > today) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t("overdueRentUrgentTitle"),
                body: fill(t("overdueRentUrgentBody"), { name: tn.name, days: "7", amount: String(tn.monthly_rent) }),
                sound: s.soundEnabled ? "default" : undefined,
                data: { type: "overdue_rent", tenantId: tn.id, propertyId: tn.property_id },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: sevenDaysAfter },
            });
          } catch {}
        }
      }

      // ── Lease expiry warning ────────────────────────────────────────────────
      if (s.leaseExpiryEnabled && tn.lease_end) {
        const leaseEnd = new Date(tn.lease_end + "T09:00:00");
        const alertDate = new Date(leaseEnd.getTime() - s.leaseExpiryDaysBefore * 86400000);
        const sixtyDaysFromNow = new Date(today.getTime() + 60 * 86400000);
        if (alertDate > today && leaseEnd <= sixtyDaysFromNow) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t("leaseExpiryTitle"),
                body: fill(t("leaseExpiryBody"), { name: tn.name, days: String(s.leaseExpiryDaysBefore) }),
                sound: s.soundEnabled ? "default" : undefined,
                data: { type: "lease_expiry_warning", tenantId: tn.id, propertyId: tn.property_id },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alertDate },
            });
          } catch {}
        }
      }
    }
  }, [permissionGranted, requestPermission, t, lang]);

  // ── Notification tap listener ───────────────────────────────────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (!data?.type) return;

      // Mark notification as read — match by identifier first, fall back to first unread with same title
      const identifier = response.notification.request.identifier;
      const title = response.notification.request.content.title ?? "";
      setNotifications((prev) => {
        const idx = prev.findIndex((n) => !n.read && n.id === identifier);
        const matchIdx = idx >= 0 ? idx : prev.findIndex((n) => !n.read && n.title === title);
        if (matchIdx < 0) return prev;
        return prev.map((n, i) => i === matchIdx ? { ...n, read: true } : n);
      });

      // Navigate based on notification type
      if (data.type === "rent_due_reminder" || data.type === "overdue_rent" || data.type === "payment_received") {
        router.push("/(tabs)");
      } else if (data.type === "lease_expiry_warning" && data.propertyId) {
        router.push(`/property/${data.propertyId}`);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications, unreadCount, settings, permissionGranted,
        addNotification, markAsRead, markAllAsRead, clearAll,
        updateSettings, rescheduleAll, requestPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
