import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { adminApi, DailyOrder } from "@/src/lib/api";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const MEALS: ("breakfast" | "lunch" | "dinner")[] = ["breakfast", "lunch", "dinner"];

export default function AdminOrders() {
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await adminApi.orders();
      setOrders(o);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // totals across all orders
  const totals = orders.reduce(
    (acc, o) => {
      MEALS.forEach((m) => {
        if (o[m].enabled) acc[m] += o[m].quantity;
      });
      return acc;
    },
    { breakfast: 0, lunch: 0, dinner: 0 } as Record<string, number>,
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Today&apos;s Orders</Text>
        <Text style={styles.sub}>{orders.length} families · {new Date().toDateString()}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {/* Aggregate */}
        <View style={styles.totalsCard} testID="kitchen-totals">
          <Text style={styles.totalsLabel}>KITCHEN COUNT</Text>
          <View style={styles.totalsRow}>
            {MEALS.map((m) => (
              <View key={m} style={styles.totalCol}>
                <Text style={styles.totalQty} testID={`total-${m}`}>{totals[m]}</Text>
                <Text style={styles.totalKey}>{m}</Text>
              </View>
            ))}
          </View>
        </View>

        {orders.length === 0 ? (
          <View style={[styles.card, { alignItems: "center", paddingVertical: spacing.xxl }]}>
            <Feather name="inbox" size={32} color={colors.onSurfaceMuted} />
            <Text style={{ color: colors.onSurfaceMuted, marginTop: spacing.sm }}>
              No orders for today (holiday)
            </Text>
          </View>
        ) : (
          orders.map((o) => (
            <View key={o.id} style={styles.card} testID={`order-${o.id}`}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{o.customer_name}</Text>
                  <Text style={styles.customerAddr}>{o.customer_address}</Text>
                </View>
                <View style={[styles.statusPill,
                  o.delivered ? styles.statusDone : styles.statusPending]}>
                  <Feather
                    name={o.delivered ? "check" : "clock"}
                    size={12}
                    color={o.delivered ? colors.success : colors.warning}
                  />
                  <Text style={[styles.statusText,
                    { color: o.delivered ? colors.success : colors.warning }]}>
                    {o.delivered ? "Delivered" : "Pending"}
                  </Text>
                </View>
              </View>
              <View style={styles.mealsRow}>
                {MEALS.map((m) => (
                  <View key={m} style={[styles.mealChip,
                    !o[m].enabled && { opacity: 0.4 }]}>
                    <Text style={styles.mealChipKey}>{m[0].toUpperCase()}</Text>
                    <Text style={styles.mealChipQty}>×{o[m].enabled ? o[m].quantity : 0}</Text>
                  </View>
                ))}
                {o.hotbox_collected && (
                  <View style={styles.hbChip}>
                    <Feather name="package" size={11} color={colors.success} />
                    <Text style={styles.hbText}>Hotbox in</Text>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },
  sub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2 },

  totalsCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg,
  },
  totalsLabel: { fontSize: 11, color: colors.brandTertiary, fontWeight: "700",
                 letterSpacing: 1, marginBottom: spacing.md },
  totalsRow: { flexDirection: "row", justifyContent: "space-around" },
  totalCol: { alignItems: "center" },
  totalQty: { fontSize: 32, fontWeight: "700", color: colors.onSurfaceInverse,
              letterSpacing: -0.5 },
  totalKey: { fontSize: 11, color: colors.brandSecondary, fontWeight: "700",
              textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },

  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
  customerName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  customerAddr: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusPending: { backgroundColor: colors.warningBg },
  statusDone: { backgroundColor: "#E5EFE5" },
  statusText: { fontSize: 11, fontWeight: "700" },

  mealsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  mealChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm,
  },
  mealChipKey: { fontSize: 11, fontWeight: "700", color: colors.onBrandTertiary,
                 letterSpacing: 0.5 },
  mealChipQty: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  hbChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#E5EFE5",
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm,
  },
  hbText: { fontSize: 11, fontWeight: "700", color: colors.success },
});
