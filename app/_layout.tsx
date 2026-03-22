import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { I18nManager, Image, InteractionManager, Platform, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { LanguageProvider, useLanguage } from "../context/LanguageContext";
import { NotificationProvider } from "../context/NotificationContext";
import { SubscriptionProvider } from "../context/SubscriptionContext";
import { userKey, BIOMETRIC_LOCK_KEY } from "../lib/storage";
import BiometricGate from "../components/BiometricGate";

const isWeb = Platform.OS === "web";

// Force RTL at module load time — this runs BEFORE any component renders.
// I18nManager.forceRTL only takes effect after an app restart, so we must
// set it as early as possible. Default to Arabic (RTL) since that's the
// primary language. AsyncStorage.getItem is async but we set the default
// synchronously here; the LanguageProvider will update if user chose English.
if (!isWeb) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

function SplashView({ isRTL }: { isRTL: boolean }) {
  return (
    <View style={splashStyles.container}>
      <Image
        source={require("../assets/images/splash-icon.png")}
        style={splashStyles.icon}
        resizeMode="contain"
      />
      <Text style={splashStyles.appName}>
        {isRTL ? "أملاكي" : "Amlakey"}
      </Text>
      <Text style={splashStyles.subtitle}>
        {isRTL ? "مدير املاكك الذكي" : "Your Smart Property Manager"}
      </Text>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 180,
    height: 180,
    borderRadius: 36,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#000000",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },
});

function RootNavigator() {
  const { session, loading, signOut, isPasswordRecovery } = useAuth();
  const { colors } = useTheme();
  const { isRTL } = useLanguage();

  const [navigated, setNavigated] = useState(false);

  // Biometric lock state
  const [biometricPassed, setBiometricPassed] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session?.user) {
      setBiometricPassed(true);
      setBiometricEnabled(false);
      return;
    }
    AsyncStorage.getItem(userKey(session.user.id, BIOMETRIC_LOCK_KEY))
      .then((v) => {
        if (v === "true") {
          setBiometricEnabled(true);
        } else {
          setBiometricEnabled(false);
          setBiometricPassed(true);
        }
      })
      .catch(() => {
        setBiometricEnabled(false);
        setBiometricPassed(true);
      });
  }, [session, loading]);

  // Sync RTL direction: on web update document dir, on native update I18nManager
  useEffect(() => {
    if (isWeb) {
      if (typeof document !== "undefined") {
        document.documentElement.dir = isRTL ? "rtl" : "ltr";
        document.documentElement.lang = isRTL ? "ar" : "en";
      }
      return;
    }
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
      // Note: RTL change takes effect on next app restart
    }
  }, [isRTL]);

  // On web, handle Supabase auth error redirects (e.g. expired OTP in URL hash)
  useEffect(() => {
    if (!isWeb) return;
    const hash = window.location.hash;
    if (hash && hash.includes("error_code=otp_expired")) {
      // Clear the hash and redirect to auth with a message
      window.location.hash = "";
      router.replace("/auth");
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    // Don't redirect away from reset-password page during password recovery
    if (isPasswordRecovery) {
      setNavigated(true);
      return;
    }
    // Navigate to the correct screen based on auth state
    if (!session) {
      // Web: show landing page first; Native: go straight to auth
      router.replace(isWeb ? "/landing" : "/auth");
    } else {
      router.replace("/(tabs)");
    }
    // Wait for navigation animation to settle before removing splash overlay
    const handle = InteractionManager.runAfterInteractions(() => setNavigated(true));
    return () => handle.cancel();
  }, [session, loading, isPasswordRecovery]);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          ...(isWeb
            ? { animation: "none" }
            : {
                animation: I18nManager.isRTL ? "slide_from_left" : "slide_from_right",
                animationDuration: 250,
                gestureEnabled: true,
                gestureDirection: I18nManager.isRTL ? "horizontal-inverted" : "horizontal",
              }),
        }}
      >
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="property/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="unit-detail" options={{ headerShown: false }} />
        <Stack.Screen name="tenant-search" options={{ headerShown: false }} />
        <Stack.Screen name="recent-updates" options={{ headerShown: false }} />
        <Stack.Screen name="performance" options={{ headerShown: false }} />
        <Stack.Screen name="ejar-import" options={{ headerShown: false }} />
        <Stack.Screen name="personal-info" options={{ headerShown: false }} />
        <Stack.Screen name="vault" options={{ headerShown: false }} />
        <Stack.Screen name="reports" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
      {/* Splash overlay hides any flash of the wrong screen during redirect */}
      {(loading || !navigated || biometricEnabled === null) && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
          <SplashView isRTL={isRTL} />
        </View>
      )}
      {/* Biometric lock overlay */}
      {biometricEnabled && !biometricPassed && (
        <BiometricGate
          onAuthenticated={() => setBiometricPassed(true)}
          onFallbackPassword={() => { signOut(); setBiometricPassed(true); }}
        />
      )}
    </View>
  );
}

function useWebCSS() {
  const { colors } = useTheme();
  useEffect(() => {
    if (!isWeb) return;
    const id = "amlakey-web-css";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = `
      html { scroll-behavior: smooth; }
      body {
        background-color: ${colors.background};
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow-y: scroll;
      }
      *:focus-visible { outline: 2px solid #0EA5E9; outline-offset: 2px; }
      ::selection { background: rgba(14, 165, 233, 0.2); }
      [role="button"], button, a { cursor: pointer; }
      ::-webkit-scrollbar { width: 7px; height: 7px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: ${colors.textMuted}; }
      [role="button"]:hover, button:hover { opacity: 0.92; transition: opacity 0.15s ease; }
      [role="button"] { transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease; }
      input, textarea { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
      input:focus, textarea:focus { border-color: #0EA5E9 !important; box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12) !important; }
      /* Smooth modal transitions */
      [aria-modal="true"] > div { transition: opacity 0.2s ease; }
      /* Better scrollbar for modal content */
      [aria-modal="true"] ::-webkit-scrollbar { width: 5px; }
      [aria-modal="true"] ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.3); border-radius: 3px; }
      /* Modal backdrop blur + ensure modals are above fixed sidebar */
      [aria-modal="true"] { z-index: 10000 !important; }
      [aria-modal="true"] > div:first-child { backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
      /* Sidebar content offset — target the absolute-positioned screen child of scene container */
      :root { --sidebar-w: 240px; }
      @media (min-width: 768px) {
        div:has(> #amlakey-sidebar) > div:not(#amlakey-sidebar) > div {
          left: var(--sidebar-w) !important;
          transition: left 0.2s ease;
        }
        [dir="rtl"] div:has(> #amlakey-sidebar) > div:not(#amlakey-sidebar) > div {
          left: 0 !important;
          right: var(--sidebar-w) !important;
          transition: right 0.2s ease;
        }
      }
    `;
  }, [colors]);
}

function ThemedRoot() {
  const { colors, isDark } = useTheme();
  useWebCSS();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <LanguageProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <NotificationProvider>
              <RootNavigator />
            </NotificationProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}
