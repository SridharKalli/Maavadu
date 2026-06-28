import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import { colors } from "@/src/lib/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RouterGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    const inAuth = root === "login";
    const inOnboarding = root === "onboarding";

    if (!user) {
      if (!inAuth) router.replace("/login");
      return;
    }

    // Customer not yet onboarded → wizard
    if (user.role === "customer" && !user.onboarded) {
      if (!inOnboarding) router.replace("/onboarding");
      return;
    }

    // Already onboarded but stuck on login / onboarding / index → push to home
    if (inAuth || inOnboarding || segments.length === 0) {
      if (user.role === "admin") router.replace("/(admin)/dashboard");
      else if (user.role === "delivery") router.replace("/(delivery)/route");
      else if (user.role === "agent") router.replace("/(agent)/threads");
      else router.replace("/(customer)/home");
    }
  }, [user, loading, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
        animation: "fade",
      }}
    />
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <AuthProvider>
          <RouterGate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
