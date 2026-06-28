import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors } from "@/src/lib/theme";

export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceMuted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="home" options={{
        title: "Home",
        tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
      }} />
      <Tabs.Screen name="wallet" options={{
        title: "Wallet",
        tabBarIcon: ({ color }) => <Feather name="credit-card" size={22} color={color} />,
      }} />
      <Tabs.Screen name="calendar" options={{
        title: "Menu",
        tabBarIcon: ({ color }) => <Feather name="calendar" size={22} color={color} />,
      }} />
      <Tabs.Screen name="support" options={{
        title: "Support",
        tabBarIcon: ({ color }) => <Feather name="message-circle" size={22} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        href: null,  // opened from the home screen header — no bottom tab
      }} />
    </Tabs>
  );
}
