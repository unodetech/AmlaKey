import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { I18nManager, Image, InteractionManager, StyleSheet, Text, View } from "react-native";
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
import { RTLSwipeBack } from "../components/RTLSwipeBack";

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
  const { session, loading, signOut } = useAuth();
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

  // Sync I18nManager with saved language preference on launch (no restart needed for first launch)
  useEffect(() => {
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
    }
  }, [isRTL]);

  useEffect(() => {
    if (loading) return;
    // Navigate to the correct screen based on auth state
    if (!session) {
      router.replace("/auth");
    } else {
      router.replace("/(tabs)");
    }
    // Wait for navigation animation to settle before removing splash overlay
    const handle = InteractionManager.runAfterInteractions(() => setNavigated(true));
    return () => handle.cancel();
  }, [session, loading]);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: I18nManager.isRTL ? "slide_from_left" : "slide_from_right",
          animationDuration: 250,
          gestureEnabled: !I18nManager.isRTL,
          gestureDirection: "horizontal",
        }}
        screenLayout={({ children }) => (
          <RTLSwipeBack>{children}</RTLSwipeBack>
        )}
      >
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="property/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="unit-detail" options={{ headerShown: false }} />
        <Stack.Screen name="tenant-search" options={{ headerShown: false }} />
        <Stack.Screen name="recent-updates" options={{ headerShown: false }} />
        <Stack.Screen name="performance" options={{ headerShown: false }} />
        <Stack.Screen name="ejar-import" options={{ headerShown: false }} />
        <Stack.Screen name="personal-info" options={{ headerShown: false }} />
        <Stack.Screen name="reports" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
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

function ThemedRoot() {
  const { colors, isDark } = useTheme();
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
