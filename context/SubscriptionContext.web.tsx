import React, { createContext, useContext, useCallback, useState } from "react";
import { useAuth } from "./AuthContext";

// ── Free-tier limits (same as native) ─────────────────────────────────────────
export const FREE_LIMITS = {
  maxProperties: 3,
  maxUnitsPerProperty: 5,
} as const;

export type ProFeature =
  | "unlimited_properties"
  | "unlimited_units"
  | "whatsapp_broadcast"
  | "export_reports"
  | "vault";

// ── Context types (same interface as native) ──────────────────────────────────
interface SubscriptionContextValue {
  isPro: boolean;
  loading: boolean;
  customerInfo: null;
  packages: never[];
  canAddProperty: (currentCount: number) => boolean;
  canAddUnits: (unitCount: number) => boolean;
  hasFeature: (feature: ProFeature) => boolean;
  purchasePackage: (pkg: any) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  isPro: false,
  loading: false,
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

// ── Web Provider (no RevenueCat — always free tier) ───────────────────────────
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [isPro] = useState(false);

  const canAddProperty = useCallback(
    (currentCount: number) => isPro || currentCount < FREE_LIMITS.maxProperties,
    [isPro]
  );

  const canAddUnits = useCallback(
    (unitCount: number) => isPro || unitCount <= FREE_LIMITS.maxUnitsPerProperty,
    [isPro]
  );

  const hasFeature = useCallback((_feature: ProFeature): boolean => isPro, [isPro]);

  const purchasePackage = useCallback(async () => false, []);
  const restorePurchases = useCallback(async () => false, []);
  const refreshStatus = useCallback(async () => {}, []);

  return (
    <SubscriptionContext.Provider
      value={{
        isPro,
        loading: false,
        customerInfo: null,
        packages: [],
        canAddProperty,
        canAddUnits,
        hasFeature,
        purchasePackage,
        restorePurchases,
        refreshStatus,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
