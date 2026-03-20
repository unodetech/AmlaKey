import React, { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useResponsive } from "../../components/WebContainer";

const SIDEBAR_FULL = 240;
const SIDEBAR_COLLAPSED = 64;

/* ── Tab definitions ─────────────────────────────────── */

const TAB_ITEMS = [
  { name: "index", icon: "speedometer-outline" as const, labelKey: "dashboard" },
  { name: "properties", icon: "business-outline" as const, labelKey: "properties" },
  { name: "expenses", icon: "receipt-outline" as const, labelKey: "expenses" },
  { name: "profile", icon: "person-outline" as const, labelKey: "profile" },
] as const;

/* ── Desktop sidebar component ───────────────────────── */

function DesktopSidebar({ state, descriptors, navigation, collapsed, onToggle }: any) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, isRTL } = useLanguage();

  return (
    <View
      style={[
        sidebarStyles.container,
        {
          width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL,
          backgroundColor: colors.surface,
          borderRightWidth: isRTL ? 0 : 1,
          borderLeftWidth: isRTL ? 1 : 0,
          borderColor: colors.border,
        },
      ]}
    >
      {/* App logo + collapse toggle */}
      <View style={[sidebarStyles.logoRow, { flexDirection: isRTL ? "row-reverse" : "row" }, collapsed && { justifyContent: "center", paddingHorizontal: 0 }]}>
        {collapsed ? (
          <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={isRTL ? "توسيع القائمة الجانبية" : "Expand sidebar"}>
            <Image
              source={require("../../assets/images/splash-icon.png")}
              style={[sidebarStyles.logo, isRTL && { marginRight: 0, marginLeft: 10 }]}
              resizeMode="contain"
            />
          </Pressable>
        ) : (
          <>
            <Image
              source={require("../../assets/images/splash-icon.png")}
              style={[sidebarStyles.logo, { marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }]}
              resizeMode="contain"
            />
            <Text style={[sidebarStyles.logoText, { color: colors.text, flex: 1, textAlign: isRTL ? "right" : "left" }]}>
              {isRTL ? "أملاكي" : "Amlakey"}
            </Text>
            <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={isRTL ? "طي القائمة الجانبية" : "Collapse sidebar"}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          </>
        )}
      </View>

      {/* Nav items */}
      <View style={sidebarStyles.nav}>
        {TAB_ITEMS.map((tab, idx) => {
          const isActive = state.index === idx;
          return (
            <Pressable
              key={tab.name}
              onPress={() => navigation.navigate(state.routes[idx].name)}
              style={({ hovered }: any) => [
                sidebarStyles.navItem,
                collapsed && { justifyContent: "center", paddingHorizontal: 0 },
                {
                  backgroundColor: isActive
                    ? colors.accentSoft
                    : hovered
                      ? `${colors.textMuted}11`
                      : "transparent",
                  flexDirection: isRTL ? "row-reverse" : "row",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t(tab.labelKey)}
            >
              {/* Active indicator bar */}
              {!collapsed && (
                <View
                  style={[
                    sidebarStyles.activeBar,
                    {
                      backgroundColor: isActive ? colors.accent : "transparent",
                      [isRTL ? "right" : "left"]: 0,
                    },
                  ]}
                />
              )}
              <Ionicons
                name={tab.icon}
                size={20}
                color={isActive ? colors.accent : colors.textMuted}
                style={collapsed ? {} : { marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }}
              />
              {!collapsed && (
                <Text
                  style={[
                    sidebarStyles.navLabel,
                    {
                      color: isActive ? colors.accent : colors.textMuted,
                      fontWeight: isActive ? "700" : "500",
                    },
                  ]}
                >
                  {t(tab.labelKey)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Theme toggle at bottom */}
      <Pressable
        onPress={toggleTheme}
        style={({ hovered }: any) => [
          sidebarStyles.themeToggle,
          collapsed && { justifyContent: "center", paddingHorizontal: 0, marginHorizontal: 8 },
          {
            backgroundColor: hovered ? `${colors.textMuted}11` : "transparent",
            flexDirection: isRTL ? "row-reverse" : "row",
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={isDark ? (isRTL ? "التبديل إلى الوضع الفاتح" : "Switch to light mode") : (isRTL ? "التبديل إلى الوضع الداكن" : "Switch to dark mode")}
      >
        <Ionicons
          name={isDark ? "sunny-outline" : "moon-outline"}
          size={20}
          color={colors.textMuted}
          style={collapsed ? {} : { marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }}
        />
        {!collapsed && (
          <Text style={[sidebarStyles.navLabel, { color: colors.textMuted }]}>
            {isDark ? t("lightMode") : t("darkMode")}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    paddingTop: 24,
    paddingBottom: 20,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  nav: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 2,
  },
  navItem: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 2,
    position: "relative",
  },
  activeBar: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  themeToggle: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 12,
    borderRadius: 10,
  },
});

/* ── Custom tab bar ──────────────────────────────────── */

function CustomTabBar(props: any) {
  const { isDesktop } = useResponsive();
  const { colors, isDark } = useTheme();
  const { isRTL } = useLanguage();

  // Collapsed sidebar state (web desktop only)
  const [collapsed, setCollapsed] = useState(() => {
    if (Platform.OS !== "web") return false;
    try { return localStorage.getItem("amlakey-sidebar-collapsed") === "true"; } catch { return false; }
  });

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL;

  // Sync CSS variable for content offset
  useEffect(() => {
    if (Platform.OS !== "web" || !isDesktop) return;
    document.documentElement.style.setProperty("--sidebar-w", `${sidebarWidth}px`);
  }, [sidebarWidth, isDesktop]);

  const toggleCollapsed = () => {
    setCollapsed((prev: boolean) => {
      const next = !prev;
      if (Platform.OS === "web") {
        try { localStorage.setItem("amlakey-sidebar-collapsed", String(next)); } catch {}
      }
      return next;
    });
  };

  if (isDesktop) {
    return (
      <View
        nativeID="amlakey-sidebar"
        style={[
          {
            width: sidebarWidth,
            backgroundColor: colors.surface,
          },
          Platform.OS === "web" && ({
            position: "fixed",
            top: 0,
            bottom: 0,
            zIndex: 100,
            [isRTL ? "right" : "left"]: 0,
            transition: "width 0.2s ease",
            boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
          } as any),
        ]}
      >
        <DesktopSidebar {...props} collapsed={collapsed} onToggle={toggleCollapsed} />
      </View>
    );
  }

  // Mobile: standard bottom tab bar
  const { state, descriptors, navigation } = props;
  return (
    <View
      style={{
        flexDirection: isRTL ? "row-reverse" : "row",
        backgroundColor: colors.surfaceElevated,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingBottom: Platform.OS === "ios" ? 20 : 4,
        paddingTop: 6,
      }}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        if (options.href === null) return null;

        const isActive = state.index === index;
        const tab = TAB_ITEMS[index];
        if (!tab) return null;

        return (
          <Pressable
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
            accessibilityRole="button"
            accessibilityLabel={options.tabBarAccessibilityLabel}
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons
              name={tab.icon}
              size={22}
              color={isActive ? colors.accent : colors.textMuted}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: isActive ? colors.accent : colors.textMuted,
                marginTop: 2,
              }}
            >
              {options.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Main tabs layout ────────────────────────────────── */

export default function TabsLayout() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const { isDesktop } = useResponsive();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("dashboard"),
          tabBarAccessibilityLabel: t("dashboard"),
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          title: t("properties"),
          tabBarAccessibilityLabel: t("properties"),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t("expenses"),
          tabBarAccessibilityLabel: t("expenses"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile"),
          tabBarAccessibilityLabel: t("profile"),
        }}
      />
      <Tabs.Screen name="tenants" options={{ href: null }} />
    </Tabs>
  );
}
