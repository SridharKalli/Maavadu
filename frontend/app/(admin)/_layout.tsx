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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{
        title: "Home",
        tabBarIcon: ({ color }) => <Feather name="grid" size={20} color={color} />,
      }} />
      <Tabs.Screen name="orders" options={{
        title: "Orders",
        tabBarIcon: ({ color }) => <Feather name="package" size={20} color={color} />,
      }} />
      <Tabs.Screen name="wallet" options={{
        title: "Wallets",
        tabBarIcon: ({ color }) => <Feather name="credit-card" size={20} color={color} />,
      }} />
      <Tabs.Screen name="menu" options={{
        title: "Menu",
        tabBarIcon: ({ color }) => <Feather name="book-open" size={20} color={color} />,
      }} />
      <Tabs.Screen name="pincodes" options={{
        title: "Pincodes",
        tabBarIcon: ({ color }) => <Feather name="map-pin" size={20} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        href: null,  // sign-out access via a button on the dashboard if needed
      }} />
    </Tabs>
  );
}
