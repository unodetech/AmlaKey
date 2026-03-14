import React from "react";
import {
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

const isWeb = Platform.OS === "web";

/* ── Feature data ──────────────────────────────────────── */

const FEATURES = [
  { emoji: "🏢", titleKey: "landingFeat1Title", descKey: "landingFeat1Desc" },
  { emoji: "👥", titleKey: "landingFeat2Title", descKey: "landingFeat2Desc" },
  { emoji: "💰", titleKey: "landingFeat3Title", descKey: "landingFeat3Desc" },
  { emoji: "📊", titleKey: "landingFeat4Title", descKey: "landingFeat4Desc" },
  { emoji: "💬", titleKey: "landingFeat5Title", descKey: "landingFeat5Desc" },
  { emoji: "🔔", titleKey: "landingFeat6Title", descKey: "landingFeat6Desc" },
] as const;

/* ── Colors (fixed light palette for landing) ────────── */

const C = {
  bg: "#F1F5F9",
  surface: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  primary: "#0D9488",
  accent: "#0EA5E9",
  footerBg: "#0F172A",
  footerText: "rgba(255,255,255,0.7)",
  footerLink: "rgba(255,255,255,0.9)",
};

/* ── Component ─────────────────────────────────────────── */

export default function LandingPage() {
  const { t, isRTL, toggle, lang } = useLanguage();
  const { isDesktop } = useResponsive();

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
          {/* Logo */}
          <View style={[s.navBrand, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Image
              source={require("../assets/images/splash-icon.png")}
              style={s.navLogo}
              resizeMode="contain"
            />
            <Text style={s.navBrandText}>{isRTL ? "أملاكي" : "Amlakey"}</Text>
          </View>

          {/* Right: lang toggle + login */}
          <View style={[s.navActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Pressable
              onPress={toggle}
              style={({ hovered }: any) => [
                s.langBtn,
                hovered && { backgroundColor: C.primary, borderColor: C.primary },
              ]}
            >
              <Text
                style={[s.langBtnText]}
              >
                {lang === "en" ? "العربية" : "English"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/auth")}
              style={({ hovered }: any) => [
                s.loginBtn,
                { flexDirection: isRTL ? "row-reverse" : "row" },
                hovered && { backgroundColor: "#0C8379" },
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
          <View style={s.heroInner}>
            <Image
              source={require("../assets/images/splash-icon.png")}
              style={s.heroImage}
              resizeMode="contain"
            />
            <Text style={[s.heroTitle, !isDesktop && { fontSize: 32 }]}>
              {isRTL ? "أملاكي" : "Amlakey"}
            </Text>
            <Text style={[s.heroSubtitle, !isDesktop && { fontSize: 16 }]}>
              {isRTL ? "مدير عقاراتك الذكي" : "Your Smart Property Manager"}
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
              {/* App Store */}
              <Pressable
                onPress={() => Linking.openURL("https://apps.apple.com")}
                style={({ hovered }: any) => [
                  s.ctaPrimary,
                  { flexDirection: isRTL ? "row-reverse" : "row" },
                  hovered && s.ctaHover,
                ]}
              >
                <Ionicons name="logo-apple" size={22} color={C.primary} />
                <Text style={s.ctaPrimaryText}>{t("landingDownload")}</Text>
              </Pressable>

              {/* Web App */}
              <Pressable
                onPress={() => router.push("/auth")}
                style={({ hovered }: any) => [
                  s.ctaOutline,
                  { flexDirection: isRTL ? "row-reverse" : "row" },
                  hovered && s.ctaOutlineHover,
                ]}
              >
                <Ionicons name="globe-outline" size={20} color="#fff" />
                <Text style={s.ctaOutlineText}>{t("landingUseWeb")}</Text>
              </Pressable>
            </View>
          </View>
          {/* Curved bottom */}
          <View style={s.heroCurve} />
        </View>

        {/* ── Features ─────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionInner}>
            <Text style={[s.sectionTitle, !isDesktop && { fontSize: 24 }]}>
              {t("landingFeaturesTitle")}
            </Text>
            <Text style={s.sectionSub}>{t("landingFeaturesSub")}</Text>

            <View
              style={[
                s.featuresGrid,
                {
                  flexDirection: isRTL ? "row-reverse" : "row",
                },
              ]}
            >
              {FEATURES.map((f, i) => (
                <Pressable
                  key={i}
                  style={({ hovered }: any) => [
                    s.featureCard,
                    {
                      width: isDesktop ? "31%" : "100%",
                    } as any,
                    hovered && isWeb && s.cardHover,
                  ]}
                >
                  <Text style={s.featureEmoji}>{f.emoji}</Text>
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

        {/* ── Pricing ──────────────────────────── */}
        <View style={[s.section, { backgroundColor: C.surface }]}>
          <View style={s.sectionInner}>
            <Text style={[s.sectionTitle, !isDesktop && { fontSize: 24 }]}>
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
              </View>
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
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    zIndex: 50,
    paddingVertical: 10,
    paddingHorizontal: 24,
    ...(isWeb && ({ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" } as any)),
  },
  navInner: {
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBrand: {
    alignItems: "center",
    gap: 8,
  },
  navLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  navBrandText: {
    fontSize: 20,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.5,
  },
  navActions: {
    alignItems: "center",
    gap: 10,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: C.surface,
  },
  langBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: C.primary,
  },
  loginBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    gap: 6,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  /* Hero */
  hero: {
    paddingTop: 80,
    paddingBottom: 60,
    position: "relative",
    overflow: "hidden",
    ...(isWeb &&
      ({
        backgroundImage: "linear-gradient(135deg, #0D9488 0%, #0EA5E9 100%)",
      } as any)),
    ...(!isWeb && { backgroundColor: C.primary }),
  },
  heroInner: {
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  heroImage: {
    width: 120,
    height: 120,
    marginBottom: 16,
    borderRadius: 24,
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
    letterSpacing: -1,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 20,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "500",
    marginBottom: 32,
    textAlign: "center",
  },
  heroCTAs: {
    gap: 14,
    alignItems: "center",
  },
  ctaPrimary: {
    backgroundColor: "#fff",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    gap: 10,
    ...(isWeb &&
      ({
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        transition: "transform 0.2s, box-shadow 0.2s",
      } as any)),
  },
  ctaHover: {
    ...(isWeb &&
      ({
        transform: [{ translateY: -2 }],
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      } as any)),
  },
  ctaPrimaryText: {
    fontSize: 17,
    fontWeight: "700",
    color: C.primary,
  },
  ctaOutline: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    gap: 10,
  },
  ctaOutlineHover: {
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  ctaOutlineText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  heroCurve: {
    position: "absolute",
    bottom: -2,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: C.bg,
    borderTopLeftRadius: 9999,
    borderTopRightRadius: 9999,
  },

  /* Sections */
  section: {
    paddingVertical: 70,
  },
  sectionInner: {
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
    marginBottom: 12,
  },
  sectionSub: {
    fontSize: 16,
    color: C.muted,
    textAlign: "center",
    marginBottom: 48,
  },

  /* Features grid */
  featuresGrid: {
    flexWrap: "wrap",
    gap: 20,
    justifyContent: "center",
  },
  featureCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 28,
    ...(isWeb &&
      ({
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        transition: "transform 0.2s, box-shadow 0.2s",
      } as any)),
  },
  cardHover: {
    ...(isWeb &&
      ({
        transform: [{ translateY: -4 }],
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      } as any)),
  },
  featureEmoji: {
    fontSize: 36,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.text,
    marginBottom: 6,
  },
  featureDesc: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 21,
  },

  /* Pricing */
  pricingRow: {
    gap: 24,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  priceCard: {
    backgroundColor: C.bg,
    borderRadius: 20,
    padding: 32,
    width: 320,
    alignItems: "center",
    position: "relative",
    borderWidth: 2,
    borderColor: "transparent",
  },
  priceCardFeatured: {
    borderColor: C.primary,
    backgroundColor: C.surface,
    ...(isWeb &&
      ({ boxShadow: "0 8px 32px rgba(13,148,136,0.15)" } as any)),
  },
  priceBadge: {
    position: "absolute",
    top: -12,
    alignSelf: "center",
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
  },
  priceBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  priceCardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: C.text,
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: C.primary,
  },
  priceCurrency: {
    fontSize: 16,
    fontWeight: "500",
    color: C.muted,
  },
  priceYearly: {
    color: C.primary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  priceList: {
    marginTop: 24,
    width: "100%",
  },
  priceItem: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  priceCheck: {
    color: C.primary,
    fontWeight: "700",
    fontSize: 14,
  },
  priceX: {
    color: "#CBD5E1",
    fontWeight: "700",
    fontSize: 14,
  },
  priceItemText: {
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  priceDisabled: {
    color: C.muted,
    textDecorationLine: "line-through",
  },

  /* Footer */
  footer: {
    backgroundColor: C.footerBg,
    paddingVertical: 40,
  },
  footerBrand: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  footerSub: {
    fontSize: 14,
    color: C.footerText,
    textAlign: "center",
    marginBottom: 16,
  },
  footerLinks: {
    justifyContent: "center",
    gap: 24,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  footerLink: {
    color: C.footerLink,
    fontSize: 14,
    fontWeight: "500",
  },
  footerCopy: {
    color: C.footerText,
    fontSize: 14,
    textAlign: "center",
  },
});
