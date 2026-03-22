import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "./LanguageContext";
import { useAuth } from "./AuthContext";
import { userKey, NOTIFICATIONS_KEY, NOTIFICATION_HISTORY_KEY } from "../lib/storage";

// ── Types (same as native) ──────────────────────────────────────────────────
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

const MAX_HISTORY = 100;

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

// ── Web Provider (in-memory notifications, no OS push) ─────────────────────────
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [permissionGranted] = useState(false);
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
    if (uid) await AsyncStorage.setItem(userKey(uid, NOTIFICATIONS_KEY), JSON.stringify(next));
  }, []);

  // ── Web: no-op for scheduling (no OS-level push on web) ────────────────────
  const rescheduleAll = useCallback(async (_tenants: Tenant[], _payments: Payment[]) => {
    // Push notifications are not available on web
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    // Web push notifications not implemented
    return false;
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
