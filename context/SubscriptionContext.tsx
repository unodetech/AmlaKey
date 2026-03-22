import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import Purchases, { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";
import { useAuth } from "./AuthContext";

// ── RevenueCat API keys (replace with your real keys) ─────────────────────────
const RC_IOS_KEY = "YOUR_REVENUECAT_IOS_API_KEY";
const RC_ANDROID_KEY = "YOUR_REVENUECAT_ANDROID_API_KEY";

// ── Entitlement & product IDs ─────────────────────────────────────────────────
const PRO_ENTITLEMENT = "pro";

// ── Free-tier limits ──────────────────────────────────────────────────────────
export const FREE_LIMITS = {
  maxProperties: 3,
  maxUnitsPerProperty: 5,
} as const;

// ── Pro features list (for UI display) ────────────────────────────────────────
export type ProFeature =
  | "unlimited_properties"
  | "unlimited_units"
  | "whatsapp_broadcast"
  | "export_reports"
  | "vault";

// ── Context types ─────────────────────────────────────────────────────────────
interface SubscriptionContextValue {
  isPro: boolean;
  loading: boolean;
  customerInfo: CustomerInfo | null;
  packages: PurchasesPackage[];

  /** Check if user can add another property */
  canAddProperty: (currentCount: number) => boolean;
  /** Check if unit count is within free limit */
  canAddUnits: (unitCount: number) => boolean;
  /** Check if a pro feature is available */
  hasFeature: (feature: ProFeature) => boolean;
  /** Purchase a package */
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  /** Restore purchases */
  restorePurchases: () => Promise<boolean>;
  /** Refresh subscription status */
  refreshStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  isPro: false,
  loading: true,
  customerInfo: null,
  packages: [],
  canAddProperty: () => true,
  canAddUnits: () => true,
  hasFeature: () => false,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
  refreshStatus: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

// ── Provider ──────────────────────────────────────────────────────────────────
// Developer/testing accounts that get Pro features for free
const DEV_PRO_EMAILS = ["yousef.f@me.com"];

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isDevPro = DEV_PRO_EMAILS.includes(user?.email ?? "");
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [initialized, setInitialized] = useState(false);

  // ── Initialize RevenueCat ─────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const apiKey = Platform.OS === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;
        if (apiKey.startsWith("YOUR_")) {
          // API keys not configured yet — default to free tier
          if (__DEV__) console.log("[Subscription] RevenueCat API keys not configured, using free tier");
          setLoading(false);
          return;
        }
        Purchases.configure({ apiKey });
        setInitialized(true);
      } catch (e) {
        if (__DEV__) console.error("[Subscription] init error:", e);
        setLoading(false);
      }
    }
    init();
  }, []);

  // ── Identify user & fetch status ──────────────────────────────────────────
  useEffect(() => {
    if (!initialized || !user?.id) return;

    async function identify() {
      try {
        await Purchases.logIn(user!.id);
        await fetchStatus();
        await fetchPackages();
      } catch (e) {
        if (__DEV__) console.error("[Subscription] identify error:", e);
      } finally {
        setLoading(false);
      }
    }
    identify();
  }, [initialized, user?.id]);

  // ── Listen for subscription changes ───────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
      setIsPro(info.entitlements.active[PRO_ENTITLEMENT] !== undefined);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
  }, [initialized]);

  // ── Fetch subscription status ─────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      setIsPro(info.entitlements.active[PRO_ENTITLEMENT] !== undefined);
    } catch (e) {
      if (__DEV__) console.error("[Subscription] fetchStatus error:", e);
    }
  }, []);

  // ── Fetch available packages ──────────────────────────────────────────────
  const fetchPackages = useCallback(async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (current) {
        setPackages(current.availablePackages);
      }
    } catch (e) {
      if (__DEV__) console.error("[Subscription] fetchPackages error:", e);
    }
  }, []);

  // ── Check free-tier limits ────────────────────────────────────────────────
  const effectivePro = isPro || isDevPro;

  const canAddProperty = useCallback(
    (currentCount: number) => effectivePro || currentCount < FREE_LIMITS.maxProperties,
    [effectivePro]
  );

  const canAddUnits = useCallback(
    (unitCount: number) => effectivePro || unitCount <= FREE_LIMITS.maxUnitsPerProperty,
    [effectivePro]
  );

  // ── Check pro feature access ──────────────────────────────────────────────
  const hasFeature = useCallback(
    (feature: ProFeature): boolean => {
      if (effectivePro) return true;
      // Free features
      switch (feature) {
        case "unlimited_properties":
        case "unlimited_units":
        case "whatsapp_broadcast":
        case "export_reports":
        case "vault":
          return false;
        default:
          return false;
      }
    },
    [effectivePro]
  );

  // ── Purchase ──────────────────────────────────────────────────────────────
  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);
      const active = info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
      setIsPro(active);
      return active;
    } catch (e: any) {
      if (!e.userCancelled) {
        if (__DEV__) console.error("[Subscription] purchase error:", e);
      }
      return false;
    }
  }, []);

  // ── Restore ───────────────────────────────────────────────────────────────
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      const active = info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
      setIsPro(active);
      return active;
    } catch (e) {
      if (__DEV__) console.error("[Subscription] restore error:", e);
      return false;
    }
  }, []);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (!initialized) return;
    await fetchStatus();
  }, [initialized, fetchStatus]);

  return (
    <SubscriptionContext.Provider
      value={{
        isPro: effectivePro, loading, customerInfo, packages,
        canAddProperty, canAddUnits, hasFeature,
        purchasePackage, restorePurchases, refreshStatus,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
