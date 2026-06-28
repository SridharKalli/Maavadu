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
        title: "Dashboard",
        tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color} />,
      }} />
      <Tabs.Screen name="orders" options={{
        title: "Orders",
        tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} />,
      }} />
      <Tabs.Screen name="menu" options={{
        title: "Menu",
        tabBarIcon: ({ color }) => <Feather name="book-open" size={22} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: "Profile",
        tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
      }} />
    </Tabs>
  );
}
