import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const CARDS: {
  key: string; title: string; sub: string; icon: any; tint: string;
}[] = [
  { key: "menu", title: "Weekly menu",
    sub: "Edit dishes for each day of the week",
    icon: "book-open", tint: colors.brand },
  { key: "pricing", title: "Pricing grid",
    sub: "Per-meal prices by family size",
    icon: "tag", tint: colors.brandSecondary },
  { key: "team", title: "Team",
    sub: "Admins, support agents & delivery partners",
    icon: "users", tint: colors.success },
  { key: "pincodes", title: "Service area",
    sub: "Pincodes you currently deliver to",
    icon: "map-pin", tint: colors.warning },
];

export default function ManageHub() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Manage</Text>
        <Text style={styles.sub}>
          Products, team and service area — one tap away.
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {CARDS.map((c) => (
          <Pressable
            key={c.key}
            testID={`manage-${c.key}`}
            onPress={() => router.push(`/(admin)/${c.key}` as any)}
            style={styles.card}
          >
            <View style={[styles.iconWrap, { backgroundColor: c.tint }]}>
              <Feather name={c.icon} size={22} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{c.title}</Text>
              <Text style={styles.cardSub}>{c.sub}</Text>
            </View>
            <Feather name="chevron-right" size={20}
              color={colors.onSurfaceMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    paddingBottom: spacing.lg, borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },
  sub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 4 },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface,
               letterSpacing: -0.2 },
  cardSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 4,
             lineHeight: 16 },
});
