import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors } from "@/src/lib/theme";

export default function AdminLayout() {
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
      <Tabs.Screen name="dashboard" options={{
        title: "Home",
        tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
      }} />
      <Tabs.Screen name="orders" options={{
        title: "Orders",
        tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} />,
      }} />
      <Tabs.Screen name="wallet" options={{
        title: "Wallets",
        tabBarIcon: ({ color }) =>
          <Feather name="credit-card" size={22} color={color} />,
      }} />
      <Tabs.Screen name="manage" options={{
        title: "Manage",
        tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color} />,
      }} />
      {/* Sub-screens reached from Manage / Dashboard — hidden from the tab bar */}
      <Tabs.Screen name="menu" options={{ href: null }} />
      <Tabs.Screen name="pincodes" options={{ href: null }} />
      <Tabs.Screen name="pricing" options={{ href: null }} />
      <Tabs.Screen name="team" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
