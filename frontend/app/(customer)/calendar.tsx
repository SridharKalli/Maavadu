import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { menuApi, ordersApi, WeeklyMenu, DailyOrder } from "@/src/lib/api";
import { colors, spacing, radius, shadow, DAY_NAMES_FULL } from "@/src/lib/theme";

const MEALS: ("breakfast" | "lunch" | "dinner")[] = ["breakfast", "lunch", "dinner"];

function fmt(d: Date) { return d.toISOString().split("T")[0]; }

export default function Calendar() {
  const [week, setWeek] = useState<WeeklyMenu[]>([]);
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, o] = await Promise.all([menuApi.week(), ordersApi.upcoming()]);
      setWeek(w);
      setOrders(o);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  // Build next 7 days schedule
  const today = new Date();
  const schedule = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const menu = week.find((m) => m.day_of_week === dow);
    const order = orders.find((o) => o.date === fmt(d));
    schedule.push({ date: fmt(d), dow, menu, order, isToday: i === 0 });
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Menu</Text>
        <Text style={styles.subtitle}>Next 7 days · Sunday is a holiday</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {schedule.map((day) => (
          <View key={day.date} style={[styles.dayCard, day.isToday && styles.todayCard]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayName, day.isToday && { color: colors.brand }]}>
                {DAY_NAMES_FULL[day.dow]} {day.isToday && " · Today"}
              </Text>
              <Text style={styles.dayDate}>
                {new Date(day.date + "T00:00:00").toLocaleString("en-US",
                  { day: "numeric", month: "short" })}
              </Text>
            </View>

            {day.menu?.is_holiday ? (
              <View style={styles.holiday}>
                <Feather name="coffee" size={18} color={colors.onSurfaceMuted} />
                <Text style={styles.holidayText}>Holiday — kitchen closed</Text>
              </View>
            ) : (
              MEALS.map((m, i) => {
                const item = day.menu?.[m];
                const orderMeal = day.order?.[m];
                return (
                  <View key={m} style={[styles.meal, i > 0 && styles.div]}>
                    <Text style={styles.mealKey}>{m.toUpperCase()}</Text>
                    <Text style={styles.mealName}>{item?.name || "—"}</Text>
                    {item?.description ? (
                      <Text style={styles.mealDesc}>{item.description}</Text>
                    ) : null}
                    {orderMeal ? (
                      <View style={styles.qtyChip}>
                        <Text style={styles.qtyChipText}>
                          {orderMeal.enabled ? `×${orderMeal.quantity} ordered` : "Skipped"}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { color: colors.onSurfaceMuted, marginTop: 2, fontSize: 13 },

  dayCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    ...shadow.card,
  },
  todayCard: { borderWidth: 2, borderColor: colors.brand },
  dayHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: spacing.md,
  },
  dayName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  dayDate: { fontSize: 13, color: colors.onSurfaceMuted },
  holiday: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    padding: spacing.md, borderRadius: radius.md,
  },
  holidayText: { color: colors.onBrandTertiary, fontWeight: "600" },
  meal: { paddingVertical: spacing.sm },
  div: { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.xs,
         paddingTop: spacing.md },
  mealKey: { fontSize: 11, fontWeight: "700", color: colors.brand, letterSpacing: 1 },
  mealName: { fontSize: 15, color: colors.onSurface, fontWeight: "600", marginTop: 2 },
  mealDesc: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  qtyChip: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill, alignSelf: "flex-start", marginTop: spacing.sm,
  },
  qtyChipText: { fontSize: 11, fontWeight: "700", color: colors.onBrandTertiary,
                 letterSpacing: 0.3 },
});
