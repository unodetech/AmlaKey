import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../context/LanguageContext";
import { useResponsive } from "../components/WebContainer";
import { useSEO } from "../components/SEOHead";

const isWeb = Platform.OS === "web";

/* ── Feature data ──────────────────────────────────────── */

const FEATURES = [
  { emoji: "🏢", titleKey: "landingFeat1Title", descKey: "landingFeat1Desc" },
  { emoji: "👥", titleKey: "landingFeat2Title", descKey: "landingFeat2Desc" },
  { emoji: "💰", titleKey: "landingFeat3Title", descKey: "landingFeat3Desc" },
  { emoji: "📊", titleKey: "landingFeat4Title", descKey: "landingFeat4Desc" },
  { emoji: "💬", titleKey: "landingFeat5Title", descKey: "landingFeat5Desc" },
  { emoji: "🔔", titleKey: "landingFeat6Title", descKey: "landingFeat6Desc" },
  { emoji: "🧾", titleKey: "landingFeat7Title", descKey: "landingFeat7Desc" },
  { emoji: "📈", titleKey: "landingFeat8Title", descKey: "landingFeat8Desc" },
  { emoji: "🌐", titleKey: "landingFeat9Title", descKey: "landingFeat9Desc" },
  { emoji: "🌙", titleKey: "landingFeat10Title", descKey: "landingFeat10Desc" },
  { emoji: "📱", titleKey: "landingFeat11Title", descKey: "landingFeat11Desc" },
  { emoji: "📄", titleKey: "landingFeat12Title", descKey: "landingFeat12Desc" },
] as const;

const HOW_STEPS = [
  { num: "1", titleKey: "landingHow1Title", descKey: "landingHow1Desc", icon: "person-add-outline" },
  { num: "2", titleKey: "landingHow2Title", descKey: "landingHow2Desc", icon: "home-outline" },
  { num: "3", titleKey: "landingHow3Title", descKey: "landingHow3Desc", icon: "rocket-outline" },
] as const;

/* ── Animated counter ──────────────────────────────────── */

function AnimatedCounter({ end, suffix = "", duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) { setValue(end); clearInterval(timer); }
      else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [end, duration]);
  return <Text style={s.statNumber}>{value.toLocaleString()}{suffix}</Text>;
}

/* ── Colors (fixed light palette for landing) ────────── */

const C = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  primary: "#0D9488",
  primaryDark: "#0C8379",
  accent: "#0EA5E9",
  footerBg: "#0F172A",
  footerText: "rgba(255,255,255,0.7)",
  footerLink: "rgba(255,255,255,0.9)",
  gradient1: "#0D9488",
  gradient2: "#0EA5E9",
};

/* ── Component ─────────────────────────────────────────── */

export default function LandingPage() {
  const { t, isRTL, toggle, lang } = useLanguage();
  const { isDesktop } = useResponsive();
  useSEO({ isAr: lang === "ar" });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Navbar ──────────────────────────────── */}
      <View
        style={[
          s.navbar,
          {
            flexDirection: isRTL ? "row-reverse" : "row",
            ...(isWeb && ({ position: "sticky" as any, top: 0 } as any)),
          },
        ]}
      >
        <View style={[s.navInner, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[s.navBrand, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Image
              source={require("../assets/images/splash-icon.png")}
              style={s.navLogo}
              resizeMode="contain"
            />
            <Text style={s.navBrandText}>{isRTL ? "أملاكي" : "Amlakey"}</Text>
          </View>

          <View style={[s.navActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Pressable
              onPress={toggle}
              style={({ hovered }: any) => [
                s.langBtn,
                hovered && { backgroundColor: C.primary, borderColor: C.primary },
              ]}
            >
              <Text style={s.langBtnText}>
                {lang === "en" ? "العربية" : "English"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/auth")}
              style={({ hovered }: any) => [
                s.loginBtn,
                { flexDirection: isRTL ? "row-reverse" : "row" },
                hovered && { backgroundColor: C.primaryDark },
              ]}
            >
              <Ionicons name="person-circle-outline" size={18} color="#fff" />
              <Text style={s.loginBtnText}>{t("landingLogin")}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Scrollable content ──────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────── */}
        <View style={s.hero}>
          <Animated.View style={[s.heroInner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Tag */}
            <View style={s.heroTag}>
              <Text style={s.heroTagText}>{t("landingHeroTag" as any)}</Text>
            </View>

            <Text style={[s.heroTitle, !isDesktop && { fontSize: 36 }]}>
              {t("landingHeroTitle1" as any)}{"\n"}
              <Text style={s.heroTitleAccent}>{t("landingHeroTitle2" as any)}</Text>
            </Text>
            <Text style={[s.heroSubtitle, !isDesktop && { fontSize: 16, maxWidth: "95%" }]}>
              {t("landingHeroDesc" as any)}
            </Text>

            <View
              style={[
                s.heroCTAs,
                {
                  flexDirection: isDesktop
                    ? isRTL ? "row-reverse" : "row"
                    : "column",
                },
              ]}
            >
              <Pressable
                onPress={() => router.push("/auth")}
                style={({ hovered }: any) => [
                  s.ctaPrimary,
                  { flexDirection: isRTL ? "row-reverse" : "row" },
                  hovered && s.ctaHover,
                ]}
              >
                <Ionicons name="rocket-outline" size={20} color="#fff" />
                <Text style={s.ctaPrimaryText}>{t("landingGetStarted")}</Text>
              </Pressable>

              <Pressable
                onPress={() => Linking.openURL("https://apps.apple.com")}
                style={({ hovered }: any) => [
                  s.ctaOutline,
                  { flexDirection: isRTL ? "row-reverse" : "row" },
                  hovered && s.ctaOutlineHover,
                ]}
              >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={s.ctaOutlineText}>{t("landingDownload")}</Text>
              </Pressable>
            </View>

            <Text style={s.trustedText}>{t("landingTrustedBy" as any)}</Text>
          </Animated.View>
          <View style={s.heroCurve} />
        </View>

        {/* ── Stats Bar ──────────────────────────── */}
        <View style={s.statsSection}>
          <View style={[s.statsInner, { flexDirection: isDesktop ? (isRTL ? "row-reverse" : "row") : "row", flexWrap: "wrap" }]}>
            {[
              { end: 500, suffix: "+", label: t("landingStatsProperties" as any) },
              { end: 10000, suffix: "+", label: t("landingStatsTransactions" as any) },
              { end: 99.9, suffix: "%", label: t("landingStatsUptime" as any) },
              { end: 3, suffix: "", label: t("landingStatsPlatforms" as any) },
            ].map((stat, i) => (
              <View key={i} style={[s.statItem, { width: isDesktop ? "25%" : "50%" }]}>
                <AnimatedCounter end={stat.end} suffix={stat.suffix} />
                <Text style={s.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Features ─────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionInner}>
            <View style={s.sectionBadge}>
              <Text style={s.sectionBadgeText}>{isRTL ? "المميزات" : "Features"}</Text>
            </View>
            <Text style={[s.sectionTitle, !isDesktop && { fontSize: 26 }]}>
              {t("landingFeaturesTitle")}
            </Text>
            <Text style={s.sectionSub}>{t("landingFeaturesSub")}</Text>

            <View
              style={[
                s.featuresGrid,
                { flexDirection: isRTL ? "row-reverse" : "row" },
              ]}
            >
              {FEATURES.map((f, i) => (
                <Pressable
                  key={i}
                  style={({ hovered }: any) => [
                    s.featureCard,
                    { width: isDesktop ? "31%" : "100%" } as any,
                    hovered && isWeb && s.cardHover,
                  ]}
                >
                  <View style={s.featureEmojiWrap}>
                    <Text style={s.featureEmoji}>{f.emoji}</Text>
                  </View>
                  <Text style={[s.featureTitle, isRTL && { textAlign: "right" }]}>
                    {t(f.titleKey as any)}
                  </Text>
                  <Text style={[s.featureDesc, isRTL && { textAlign: "right" }]}>
                    {t(f.descKey as any)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* ── How It Works ───────────────────────── */}
        <View style={[s.section, { backgroundColor: C.surface }]}>
          <View style={s.sectionInner}>
            <View style={s.sectionBadge}>
              <Text style={s.sectionBadgeText}>{isRTL ? "كيف يعمل" : "How It Works"}</Text>
            </View>
            <Text style={[s.sectionTitle, !isDesktop && { fontSize: 26 }]}>
              {t("landingHowTitle" as any)}
            </Text>
            <Text style={s.sectionSub}>{t("landingHowSub" as any)}</Text>

            <View style={[s.stepsRow, { flexDirection: isDesktop ? (isRTL ? "row-reverse" : "row") : "column" }]}>
              {HOW_STEPS.map((step, i) => (
                <View key={i} style={[s.stepCard, { width: isDesktop ? "30%" : "100%" } as any]}>
                  <View style={s.stepNumber}>
                    <Text style={s.stepNumberText}>{step.num}</Text>
                  </View>
                  <Ionicons name={step.icon as any} size={32} color={C.primary} style={{ marginBottom: 12 }} />
                  <Text style={[s.stepTitle, isRTL && { textAlign: "right" }]}>{t(step.titleKey as any)}</Text>
                  <Text style={[s.stepDesc, isRTL && { textAlign: "right" }]}>{t(step.descKey as any)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Pricing ──────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionInner}>
            <View style={s.sectionBadge}>
              <Text style={s.sectionBadgeText}>{isRTL ? "الأسعار" : "Pricing"}</Text>
            </View>
            <Text style={[s.sectionTitle, !isDesktop && { fontSize: 26 }]}>
              {t("landingPricingTitle")}
            </Text>
            <Text style={s.sectionSub}>{t("landingPricingSub")}</Text>

            <View
              style={[
                s.pricingRow,
                {
                  flexDirection: isDesktop
                    ? isRTL ? "row-reverse" : "row"
                    : "column",
                },
              ]}
            >
              {/* Free plan */}
              <View style={[s.priceCard, !isDesktop && { width: "100%" }]}>
                <Text style={s.priceCardTitle}>{t("landingFree")}</Text>
                <Text style={s.priceAmount}>
                  0 <Text style={s.priceCurrency}>SAR</Text>
                </Text>
                <View style={s.priceList}>
                  {t("landingPriceFreeItems")
                    .split("|")
                    .map((item, i) => (
                      <View key={i} style={[s.priceItem, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={s.priceCheck}>✓</Text>
                        <Text style={[s.priceItemText, isRTL && { textAlign: "right" }]}>{item}</Text>
                      </View>
                    ))}
                  {t("landingPriceFreeDisabled")
                    .split("|")
                    .map((item, i) => (
                      <View key={`d${i}`} style={[s.priceItem, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={s.priceX}>✕</Text>
                        <Text style={[s.priceItemText, s.priceDisabled, isRTL && { textAlign: "right" }]}>
                          {item}
                        </Text>
                      </View>
                    ))}
                </View>
                <Pressable
                  onPress={() => router.push("/auth")}
                  style={({ hovered }: any) => [s.priceBtn, hovered && { backgroundColor: "#E2E8F0" }]}
                >
                  <Text style={s.priceBtnText}>{t("landingGetStarted")}</Text>
                </Pressable>
              </View>

              {/* Pro plan */}
              <View
                style={[
                  s.priceCard,
                  s.priceCardFeatured,
                  !isDesktop && { width: "100%" },
                ]}
              >
                <View style={s.priceBadge}>
                  <Text style={s.priceBadgeText}>{t("landingBestValue")}</Text>
                </View>
                <Text style={s.priceCardTitle}>{t("landingPro")}</Text>
                <Text style={s.priceAmount}>
                  14.99{" "}
                  <Text style={s.priceCurrency}>
                    {isRTL ? "ر.س/شهر" : "SAR/mo"}
                  </Text>
                </Text>
                <Text style={s.priceYearly}>{t("landingOrYearly")}</Text>
                <View style={s.priceList}>
                  {t("landingPriceProItems")
                    .split("|")
                    .map((item, i) => (
                      <View key={i} style={[s.priceItem, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={s.priceCheck}>✓</Text>
                        <Text style={[s.priceItemText, isRTL && { textAlign: "right" }]}>{item}</Text>
                      </View>
                    ))}
                </View>
                <Pressable
                  onPress={() => router.push("/auth")}
                  style={({ hovered }: any) => [s.priceBtnPro, hovered && { backgroundColor: C.primaryDark }]}
                >
                  <Text style={s.priceBtnProText}>{t("landingGetStarted")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* ── CTA Section ────────────────────────── */}
        <View style={s.ctaSection}>
          <View style={s.sectionInner}>
            <Text style={[s.ctaSectionTitle, !isDesktop && { fontSize: 26 }]}>
              {t("landingCtaTitle" as any)}
            </Text>
            <Text style={s.ctaSectionSub}>{t("landingCtaSub" as any)}</Text>
            <View style={[s.ctaSectionBtns, { flexDirection: isDesktop ? (isRTL ? "row-reverse" : "row") : "column" }]}>
              <Pressable
                onPress={() => router.push("/auth")}
                style={({ hovered }: any) => [s.ctaSectionBtn, hovered && { backgroundColor: "#f1f5f9" }]}
              >
                <Ionicons name="rocket-outline" size={20} color={C.primary} />
                <Text style={s.ctaSectionBtnText}>{t("landingGetStarted")}</Text>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL("mailto:support@amlakeyapp.com")}
                style={({ hovered }: any) => [s.ctaSectionBtnOutline, hovered && { backgroundColor: "rgba(255,255,255,0.15)" }]}
              >
                <Ionicons name="mail-outline" size={20} color="#fff" />
                <Text style={s.ctaSectionBtnOutlineText}>{t("landingFooterContact")}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Footer ───────────────────────────── */}
        <View style={s.footer}>
          <View style={s.sectionInner}>
            <Text style={s.footerBrand}>{t("landingFooterBrand")}</Text>
            <Text style={s.footerSub}>{t("landingFooterSub")}</Text>
            <View style={[s.footerLinks, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Pressable onPress={() => router.push("/privacy")}>
                <Text style={s.footerLink}>{t("privacyPolicy")}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/terms")}>
                <Text style={s.footerLink}>{t("termsOfService")}</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL("mailto:support@amlakeyapp.com")}>
                <Text style={s.footerLink}>{t("landingFooterContact")}</Text>
              </Pressable>
            </View>
            <Text style={s.footerCopy}>{t("landingCopyright")}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

const s = StyleSheet.create({
  /* Navbar */
  navbar: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    zIndex: 50,
    paddingVertical: 12,
    paddingHorizontal: 24,
    ...(isWeb && ({ boxShadow: "0 1px 8px rgba(0,0,0,0.04)", backdropFilter: "blur(12px)" } as any)),
  },
  navInner: {
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBrand: { alignItems: "center", gap: 10 },
  navLogo: { width: 36, height: 36, borderRadius: 10 },
  navBrandText: { fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  navActions: { alignItems: "center", gap: 10 },
  langBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: C.surface,
    ...(isWeb && ({ transition: "all 0.2s" } as any)),
  },
  langBtnText: { fontSize: 13, fontWeight: "600", color: C.primary },
  loginBtn: {
    backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 9,
    borderRadius: 12, alignItems: "center", gap: 6,
    ...(isWeb && ({ transition: "all 0.2s" } as any)),
  },
  loginBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  /* Hero */
  hero: {
    paddingTop: 80, paddingBottom: 80, position: "relative", overflow: "hidden",
    ...(isWeb && ({ backgroundImage: "linear-gradient(135deg, #0D9488 0%, #0891B2 50%, #0EA5E9 100%)" } as any)),
    ...(!isWeb && { backgroundColor: C.primary }),
  },
  heroInner: {
    maxWidth: 1200, width: "100%", alignSelf: "center", alignItems: "center", paddingHorizontal: 24,
  },
  heroTag: {
    backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, marginBottom: 24,
  },
  heroTagText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  heroTitle: {
    fontSize: 52, fontWeight: "800", color: "#fff", marginBottom: 8,
    letterSpacing: -1, textAlign: "center", lineHeight: 62,
  },
  heroTitleAccent: {
    color: "#A7F3D0",
  },
  heroSubtitle: {
    fontSize: 18, color: "rgba(255,255,255,0.85)", fontWeight: "400",
    marginBottom: 40, textAlign: "center", lineHeight: 28, maxWidth: 600,
  },
  heroCTAs: { gap: 14, alignItems: "center" },
  ctaPrimary: {
    backgroundColor: "#fff", paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: 14, alignItems: "center", gap: 10,
    ...(isWeb && ({ boxShadow: "0 4px 20px rgba(0,0,0,0.15)", transition: "transform 0.2s, box-shadow 0.2s" } as any)),
  },
  ctaHover: {
    ...(isWeb && ({ transform: [{ translateY: -2 }], boxShadow: "0 8px 30px rgba(0,0,0,0.2)" } as any)),
  },
  ctaPrimaryText: { fontSize: 17, fontWeight: "700", color: C.primary },
  ctaOutline: {
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", paddingHorizontal: 32,
    paddingVertical: 14, borderRadius: 14, alignItems: "center", gap: 10,
    ...(isWeb && ({ transition: "all 0.2s" } as any)),
  },
  ctaOutlineHover: { borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.1)" },
  ctaOutlineText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  trustedText: {
    marginTop: 40, color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "500",
  },
  heroCurve: {
    position: "absolute", bottom: -2, left: 0, right: 0, height: 60,
    backgroundColor: C.bg, borderTopLeftRadius: 9999, borderTopRightRadius: 9999,
  },

  /* Stats */
  statsSection: {
    marginTop: -30, paddingBottom: 40, zIndex: 10,
  },
  statsInner: {
    maxWidth: 1000, width: "90%", alignSelf: "center", backgroundColor: C.surface,
    borderRadius: 20, paddingVertical: 32, paddingHorizontal: 16,
    ...(isWeb && ({ boxShadow: "0 8px 40px rgba(0,0,0,0.08)" } as any)),
  },
  statItem: { alignItems: "center", paddingVertical: 8 },
  statNumber: { fontSize: 32, fontWeight: "800", color: C.primary, marginBottom: 4 },
  statLabel: { fontSize: 13, color: C.muted, fontWeight: "500" },

  /* Sections */
  section: { paddingVertical: 80 },
  sectionInner: { maxWidth: 1200, width: "100%", alignSelf: "center", paddingHorizontal: 24 },
  sectionBadge: {
    alignSelf: "center", backgroundColor: "#E0F2FE", paddingHorizontal: 16,
    paddingVertical: 6, borderRadius: 20, marginBottom: 16,
  },
  sectionBadgeText: { color: "#0284C7", fontSize: 13, fontWeight: "700" },
  sectionTitle: {
    fontSize: 34, fontWeight: "800", color: C.text, textAlign: "center", marginBottom: 12, letterSpacing: -0.5,
  },
  sectionSub: { fontSize: 16, color: C.muted, textAlign: "center", marginBottom: 48, lineHeight: 24 },

  /* Features grid */
  featuresGrid: { flexWrap: "wrap", gap: 20, justifyContent: "center" },
  featureCard: {
    backgroundColor: C.surface, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: "#F1F5F9",
    ...(isWeb && ({ boxShadow: "0 2px 12px rgba(0,0,0,0.04)", transition: "transform 0.25s, box-shadow 0.25s" } as any)),
  },
  cardHover: {
    ...(isWeb && ({ transform: [{ translateY: -6 }], boxShadow: "0 12px 32px rgba(0,0,0,0.1)" } as any)),
  },
  featureEmojiWrap: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: "#F0FDFA",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  featureEmoji: { fontSize: 28 },
  featureTitle: { fontSize: 17, fontWeight: "700", color: C.text, marginBottom: 8 },
  featureDesc: { fontSize: 14, color: C.muted, lineHeight: 22 },

  /* How it works */
  stepsRow: { gap: 24, justifyContent: "center", alignItems: "flex-start" },
  stepCard: {
    alignItems: "center", padding: 32, backgroundColor: C.bg, borderRadius: 20,
    ...(isWeb && ({ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" } as any)),
  },
  stepNumber: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  stepNumberText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  stepTitle: { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 8, textAlign: "center" },
  stepDesc: { fontSize: 14, color: C.muted, lineHeight: 22, textAlign: "center" },

  /* Pricing */
  pricingRow: { gap: 24, justifyContent: "center", alignItems: "flex-start" },
  priceCard: {
    backgroundColor: C.surface, borderRadius: 24, padding: 36, width: 340,
    alignItems: "center", position: "relative", borderWidth: 2, borderColor: "#F1F5F9",
    ...(isWeb && ({ boxShadow: "0 2px 16px rgba(0,0,0,0.04)" } as any)),
  },
  priceCardFeatured: {
    borderColor: C.primary, backgroundColor: C.surface,
    ...(isWeb && ({ boxShadow: "0 8px 40px rgba(13,148,136,0.15)" } as any)),
  },
  priceBadge: {
    position: "absolute", top: -14, alignSelf: "center",
    backgroundColor: C.primary, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20,
  },
  priceBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  priceCardTitle: { fontSize: 24, fontWeight: "700", color: C.text, marginBottom: 8 },
  priceAmount: { fontSize: 44, fontWeight: "800", color: C.primary },
  priceCurrency: { fontSize: 16, fontWeight: "500", color: C.muted },
  priceYearly: { color: C.primary, fontSize: 13, fontWeight: "600", marginTop: 4 },
  priceList: { marginTop: 28, width: "100%" },
  priceItem: { alignItems: "center", gap: 10, paddingVertical: 7 },
  priceCheck: { color: C.primary, fontWeight: "700", fontSize: 15 },
  priceX: { color: "#CBD5E1", fontWeight: "700", fontSize: 15 },
  priceItemText: { fontSize: 14, color: C.text, flex: 1 },
  priceDisabled: { color: C.muted, textDecorationLine: "line-through" },
  priceBtn: {
    marginTop: 24, paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center",
    ...(isWeb && ({ transition: "all 0.2s" } as any)),
  },
  priceBtnText: { fontSize: 15, fontWeight: "700", color: C.text },
  priceBtnPro: {
    marginTop: 24, paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 12, backgroundColor: C.primary, alignItems: "center",
    ...(isWeb && ({ transition: "all 0.2s" } as any)),
  },
  priceBtnProText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  /* CTA Section */
  ctaSection: {
    paddingVertical: 80,
    ...(isWeb && ({ backgroundImage: "linear-gradient(135deg, #0D9488 0%, #0891B2 50%, #0EA5E9 100%)" } as any)),
    ...(!isWeb && { backgroundColor: C.primary }),
  },
  ctaSectionTitle: {
    fontSize: 34, fontWeight: "800", color: "#fff", textAlign: "center",
    marginBottom: 12, letterSpacing: -0.5,
  },
  ctaSectionSub: {
    fontSize: 16, color: "rgba(255,255,255,0.8)", textAlign: "center", marginBottom: 36, lineHeight: 24,
  },
  ctaSectionBtns: { gap: 14, justifyContent: "center", alignItems: "center" },
  ctaSectionBtn: {
    backgroundColor: "#fff", paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8,
    ...(isWeb && ({ transition: "all 0.2s" } as any)),
  },
  ctaSectionBtnText: { fontSize: 16, fontWeight: "700", color: C.primary },
  ctaSectionBtnOutline: {
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", paddingHorizontal: 28,
    paddingVertical: 12, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8,
    ...(isWeb && ({ transition: "all 0.2s" } as any)),
  },
  ctaSectionBtnOutlineText: { fontSize: 16, fontWeight: "600", color: "#fff" },

  /* Footer */
  footer: { backgroundColor: C.footerBg, paddingVertical: 48 },
  footerBrand: { fontSize: 22, fontWeight: "700", color: "#fff", textAlign: "center", marginBottom: 8 },
  footerSub: { fontSize: 14, color: C.footerText, textAlign: "center", marginBottom: 20 },
  footerLinks: { justifyContent: "center", gap: 24, flexWrap: "wrap", marginBottom: 20 },
  footerLink: { color: C.footerLink, fontSize: 14, fontWeight: "500" },
  footerCopy: { color: C.footerText, fontSize: 13, textAlign: "center" },
});
