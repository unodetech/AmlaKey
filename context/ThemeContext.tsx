import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ColorSet, darkColors, lightColors, makeShadow } from "../constants/theme";

export type ThemeMode = "dark" | "light";

interface ThemeCtx {
  mode: ThemeMode;
  toggleTheme: () => void;
  colors: ColorSet;
  isDark: boolean;
  shadow: ReturnType<typeof makeShadow>;
}

const ThemeContext = createContext<ThemeCtx>({
  mode: "light", toggleTheme: () => {}, colors: lightColors, isDark: false, shadow: makeShadow(false),
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    AsyncStorage.getItem("@theme").then((v) => {
      if (v === "light" || v === "dark") {
        setMode(v);
      } else {
        setMode(systemScheme === "dark" ? "dark" : "light");
      }
    }).catch(() => {});
  }, []);

  const toggleTheme = useCallback(async () => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem("@theme", next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    mode, toggleTheme,
    colors: mode === "dark" ? darkColors : lightColors,
    isDark: mode === "dark",
    shadow: makeShadow(mode === "dark"),
  }), [mode, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
