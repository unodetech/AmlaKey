import React, { useCallback, useMemo } from "react";
import {
  Dimensions, Modal, Platform, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate, runOnJS, SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { spacing, radii } from "../constants/theme";

const isWeb = Platform.OS === "web";

// Lazy-load expo-haptics only on native (crashes on web)
let Haptics: typeof import("expo-haptics") | null = null;
if (!isWeb) {
  Haptics = require("expo-haptics");
}

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_H_PADDING = 20;
const CARD_WIDTH = SCREEN_W - CARD_H_PADDING * 2;
const SWIPE_THRESHOLD = 50;
const SLIDE_COUNT = 5;

interface Props {
  visible: boolean;
  onComplete: () => void;
}

interface SlideData {
  emoji: string;
  titleKey: string;
  descKey: string;
}

const FEATURE_SLIDES: SlideData[] = [
  { emoji: "🏠", titleKey: "onboardingPropertiesTitle", descKey: "onboardingPropertiesDesc" },
  { emoji: "👥💰", titleKey: "onboardingTenantsTitle", descKey: "onboardingTenantsDesc" },
  { emoji: "🧾📊", titleKey: "onboardingExpensesTitle", descKey: "onboardingExpensesDesc" },
];

export function Onboarding({ visible, onComplete }: Props) {
  const { t, isRTL, lang, setLanguage } = useLanguage();
  const { colors: C, isDark, toggleTheme, shadow } = useTheme();
  const S = useMemo(() => styles(C, isRTL), [C, isRTL]);

  const currentSlide = useSharedValue(0);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const cardTranslateY = useSharedValue(40);

  // Animate card entrance
  React.useEffect(() => {
    if (visible) {
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 160 });
    }
  }, [visible]);

  const goToSlide = useCallback((idx: number) => {
    "worklet";
    const clamped = Math.max(0, Math.min(idx, SLIDE_COUNT - 1));
    currentSlide.value = clamped;
    translateX.value = withTiming(-clamped * CARD_WIDTH, { duration: 300 });
    if (Haptics) runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const goNext = useCallback(() => {
    const next = Math.min(currentSlide.value + 1, SLIDE_COUNT - 1);
    goToSlide(next);
  }, [goToSlide]);

  const goBack = useCallback(() => {
    const prev = Math.max(currentSlide.value - 1, 0);
    goToSlide(prev);
  }, [goToSlide]);

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onStart(() => { startX.value = translateX.value; })
    .onUpdate((e) => {
      // RTL: reverse swipe direction
      const dir = isRTL ? -1 : 1;
      translateX.value = startX.value + e.translationX * dir;
    })
    .onEnd((e) => {
      const dir = isRTL ? -1 : 1;
      const swipeDist = e.translationX * dir;
      if (swipeDist < -SWIPE_THRESHOLD) {
        // Swiped forward
        const next = Math.min(currentSlide.value + 1, SLIDE_COUNT - 1);
        goToSlide(next);
      } else if (swipeDist > SWIPE_THRESHOLD) {
        // Swiped back
        const prev = Math.max(currentSlide.value - 1, 0);
        goToSlide(prev);
      } else {
        // Snap back
        translateX.value = withTiming(-currentSlide.value * CARD_WIDTH, { duration: 200 });
      }
    });

  const slideStripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const cardEntranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
  }));

  /* ── Slide renderers ── */

  const renderWelcome = () => (
    <View style={S.slideContent}>
      <Text style={S.welcomeEmoji}>🏗️</Text>
      <Text style={S.welcomeTitle}>
        {lang === "ar" ? "أملاكي" : "Amlakey"}
      </Text>
      <Text style={S.welcomeSubtitle}>{t("onboardingWelcome" as any)}</Text>
      <Text style={S.welcomeDesc}>{t("onboardingWelcomeSub" as any)}</Text>
    </View>
  );

  const renderFeatureSlide = (slide: SlideData) => (
    <View style={S.slideContent}>
      <Text style={S.featureEmoji}>{slide.emoji}</Text>
      <Text style={S.featureTitle}>{t(slide.titleKey as any)}</Text>
      <Text style={S.featureDesc}>{t(slide.descKey as any)}</Text>
    </View>
  );

  const renderSetup = () => (
    <View style={S.slideContent}>
      <Text style={S.setupTitle}>{t("onboardingSetupTitle" as any)}</Text>

      {/* Theme toggle */}
      <Text style={S.setupLabel}>{t("onboardingSetupTheme" as any)}</Text>
      <View style={[S.toggleRow, isRTL && { flexDirection: "row-reverse" }]}>
        <TouchableOpacity
          style={[S.toggleBtn, !isDark && S.toggleBtnActive]}
          onPress={() => { if (isDark) toggleTheme(); }}
          activeOpacity={0.7}
        >
          <Text style={S.toggleEmoji}>☀️</Text>
          <Text style={[S.toggleLabel, !isDark && S.toggleLabelActive]}>{t("lightMode")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.toggleBtn, isDark && S.toggleBtnActive]}
          onPress={() => { if (!isDark) toggleTheme(); }}
          activeOpacity={0.7}
        >
          <Text style={S.toggleEmoji}>🌙</Text>
          <Text style={[S.toggleLabel, isDark && S.toggleLabelActive]}>{t("darkMode")}</Text>
        </TouchableOpacity>
      </View>

      {/* Language toggle */}
      <Text style={[S.setupLabel, { marginTop: 20 }]}>{t("onboardingSetupLang" as any)}</Text>
      <View style={[S.toggleRow, isRTL && { flexDirection: "row-reverse" }]}>
        <TouchableOpacity
          style={[S.toggleBtn, lang === "en" && S.toggleBtnActive]}
          onPress={() => setLanguage("en")}
          activeOpacity={0.7}
        >
          <Text style={S.toggleEmoji}>🇬🇧</Text>
          <Text style={[S.toggleLabel, lang === "en" && S.toggleLabelActive]}>English</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.toggleBtn, lang === "ar" && S.toggleBtnActive]}
          onPress={() => setLanguage("ar")}
          activeOpacity={0.7}
        >
          <Text style={S.toggleEmoji}>🇸🇦</Text>
          <Text style={[S.toggleLabel, lang === "ar" && S.toggleLabelActive]}>العربية</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={S.overlay}>
        <Animated.View style={[S.card, shadow, cardEntranceStyle]}>
          {/* Skip button */}
          <TouchableOpacity
            style={[S.skipBtn, isRTL ? { left: 16 } : { right: 16 }]}
            onPress={onComplete}
            activeOpacity={0.6}
          >
            <Text style={S.skipText}>{t("onboardingSkip" as any)}</Text>
          </TouchableOpacity>

          {/* Slide strip */}
          <View style={S.slideViewport}>
            <GestureDetector gesture={pan}>
              <Animated.View style={[S.slideStrip, slideStripStyle]}>
                {/* Slide 0: Welcome */}
                <View style={S.slide}>{renderWelcome()}</View>
                {/* Slides 1-3: Features */}
                {FEATURE_SLIDES.map((s, i) => (
                  <View key={i} style={S.slide}>{renderFeatureSlide(s)}</View>
                ))}
                {/* Slide 4: Setup */}
                <View style={S.slide}>{renderSetup()}</View>
              </Animated.View>
            </GestureDetector>
          </View>

          {/* Dot indicators */}
          <DotIndicators current={currentSlide} count={SLIDE_COUNT} accentColor={C.accent} borderColor={C.border} />

          {/* Navigation buttons */}
          <NavigationButtons
            current={currentSlide}
            total={SLIDE_COUNT}
            onNext={goNext}
            onBack={goBack}
            onComplete={onComplete}
            t={t}
            isRTL={isRTL}
            accentColor={C.accent}
            textColor={C.text}
            textMuted={C.textMuted}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ── Dot indicators ── */
function DotIndicators({ current, count, accentColor, borderColor }: {
  current: SharedValue<number>; count: number; accentColor: string; borderColor: string;
}) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <DotItem key={i} index={i} current={current} accentColor={accentColor} borderColor={borderColor} />
      ))}
    </View>
  );
}

function DotItem({ index, current, accentColor, borderColor }: {
  index: number; current: SharedValue<number>; accentColor: string; borderColor: string;
}) {
  const style = useAnimatedStyle(() => {
    const isActive = Math.round(current.value) === index;
    return {
      width: withTiming(isActive ? 24 : 8, { duration: 200 }),
      backgroundColor: withTiming(isActive ? accentColor : borderColor, { duration: 200 }),
    };
  });
  return <Animated.View style={[dotStyles.dot, style]} />;
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 12 },
  dot: { height: 8, borderRadius: 4 },
});

/* ── Navigation buttons ── */
function NavigationButtons({ current, total, onNext, onBack, onComplete, t, isRTL, accentColor, textColor, textMuted }: {
  current: SharedValue<number>; total: number;
  onNext: () => void; onBack: () => void; onComplete: () => void;
  t: (k: any) => string; isRTL: boolean; accentColor: string; textColor: string; textMuted: string;
}) {
  const style = useAnimatedStyle(() => {
    const isLast = Math.round(current.value) === total - 1;
    const isFirst = Math.round(current.value) === 0;
    return { opacity: 1 }; // Just to use animated
  });

  // We need a non-animated wrapper that reads current for button rendering
  // Use a simple approach with state synced from shared value
  const [slideIdx, setSlideIdx] = React.useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setSlideIdx(Math.round(current.value));
    }, 100);
    return () => clearInterval(interval);
  }, [current]);

  const isFirst = slideIdx === 0;
  const isLast = slideIdx === total - 1;

  return (
    <View style={[navStyles.row, isRTL && { flexDirection: "row-reverse" }]}>
      {!isFirst ? (
        <TouchableOpacity onPress={onBack} style={navStyles.backBtn} activeOpacity={0.7}>
          <Text style={[navStyles.backText, { color: textMuted }]}>{t("onboardingBack")}</Text>
        </TouchableOpacity>
      ) : <View style={navStyles.backBtn} />}

      {isLast ? (
        <TouchableOpacity
          onPress={onComplete}
          style={[navStyles.primaryBtn, { backgroundColor: accentColor }]}
          activeOpacity={0.8}
        >
          <Text style={navStyles.primaryText}>{t("onboardingGetStarted")}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onNext}
          style={[navStyles.primaryBtn, { backgroundColor: accentColor }]}
          activeOpacity={0.8}
        >
          <Text style={navStyles.primaryText}>{t("onboardingNext")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const navStyles = StyleSheet.create({
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4,
  },
  backBtn: { width: 80 },
  backText: { fontSize: 15, fontWeight: "600" },
  primaryBtn: {
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

/* ── Styles ── */
const styles = (C: any, isRTL: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
      justifyContent: "center", alignItems: "center",
      paddingHorizontal: CARD_H_PADDING,
    },
    card: {
      backgroundColor: C.surface,
      borderRadius: 24,
      width: CARD_WIDTH,
      maxHeight: "85%",
      overflow: "hidden",
    },
    skipBtn: {
      position: "absolute", top: 16, zIndex: 10,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    skipText: { color: C.textMuted, fontSize: 14, fontWeight: "600" },

    slideViewport: {
      width: CARD_WIDTH, overflow: "hidden",
    },
    slideStrip: {
      flexDirection: "row",
      width: CARD_WIDTH * SLIDE_COUNT,
    },
    slide: {
      width: CARD_WIDTH,
      paddingHorizontal: 24,
      paddingTop: 50,
      paddingBottom: 8,
      minHeight: 340,
      justifyContent: "center",
      alignItems: "center",
    },
    slideContent: {
      alignItems: "center", width: "100%",
    },

    // Welcome slide
    welcomeEmoji: { fontSize: 60, marginBottom: 12 },
    welcomeTitle: {
      fontSize: 32, fontWeight: "800", color: C.accent, marginBottom: 8,
      textAlign: "center",
    },
    welcomeSubtitle: {
      fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 8,
      textAlign: "center",
    },
    welcomeDesc: {
      fontSize: 14, color: C.textMuted, textAlign: "center", lineHeight: 22,
    },

    // Feature slides
    featureEmoji: { fontSize: 56, marginBottom: 16 },
    featureTitle: {
      fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 12,
      textAlign: "center",
    },
    featureDesc: {
      fontSize: 14, color: C.textMuted, textAlign: "center", lineHeight: 22,
      paddingHorizontal: 8,
    },

    // Setup slide
    setupTitle: {
      fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 20,
      textAlign: "center",
    },
    setupLabel: {
      fontSize: 14, fontWeight: "600", color: C.textMuted, marginBottom: 10,
      textAlign: "center",
    },
    toggleRow: {
      flexDirection: "row", gap: 12, justifyContent: "center",
    },
    toggleBtn: {
      flex: 1, paddingVertical: 14, paddingHorizontal: 8,
      borderRadius: radii.md, borderWidth: 2, borderColor: C.border,
      alignItems: "center", backgroundColor: C.background,
    },
    toggleBtnActive: {
      borderColor: C.accent, backgroundColor: C.accentSoft,
    },
    toggleEmoji: { fontSize: 24, marginBottom: 4 },
    toggleLabel: {
      fontSize: 13, fontWeight: "600", color: C.textMuted,
    },
    toggleLabelActive: { color: C.accent, fontWeight: "700" },
  });
