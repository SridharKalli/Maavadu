import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
  ActivityIndicator, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { deliveryApi, DailyOrder } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const MEALS: ("breakfast" | "lunch" | "dinner")[] = ["breakfast", "lunch", "dinner"];

function nextNDates(n: number): { iso: string; label: string; isHoliday: boolean }[] {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    const label = i === 0 ? "Today"
      : i === 1 ? "Tomorrow"
      : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
    out.push({ iso, label, isHoliday: d.getDay() === 0 });
  }
  return out;
}

export default function DeliveryRoute() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [pickups, setPickups] = useState<DailyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"deliveries" | "pickups">("deliveries");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]);
  const dates = nextNDates(7);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        deliveryApi.route(selectedDate),
        deliveryApi.pickups(),
      ]);
      setOrders(r);
      setPickups(p);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  async function markDelivered(o: DailyOrder) {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const updated = await deliveryApi.markDelivered(o.id);
      setOrders((prev) => prev.map((x) => x.id === o.id ? { ...x, ...updated } : x));
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }
  async function markHotbox(o: DailyOrder, fromPickups: boolean) {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const updated = await deliveryApi.markHotbox(o.id);
      if (fromPickups) {
        setPickups((prev) => prev.filter((x) => x.id !== o.id));
      } else {
        setOrders((prev) => prev.map((x) => x.id === o.id ? { ...x, ...updated } : x));
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  const pendingDeliveries = orders.filter((o) => !o.delivered).length;
  const done = orders.length - pendingDeliveries;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.greet}>Hello, {user?.name?.split(" ")[0] || "partner"}</Text>
        <Text style={styles.title}>Today&apos;s Route</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill,
              { width: orders.length ? `${(done / orders.length) * 100}%` : "0%" }]} />
          </View>
          <Text style={styles.progressText} testID="progress-text">
            {done}/{orders.length} delivered
          </Text>
        </View>

        {/* Date selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}>
          {dates.map((d) => {
            const active = selectedDate === d.iso;
            return (
              <Pressable
                key={d.iso}
                testID={`date-${d.iso}`}
                onPress={() => { setSelectedDate(d.iso); setLoading(true); }}
                style={[styles.dateChip, active && styles.dateChipActive]}
              >
                <Text style={[styles.dateLabel,
                  active && { color: colors.onBrand }]}>
                  {d.label}
                </Text>
                {d.isHoliday && (
                  <Text style={[styles.dateHoliday,
                    active && { color: colors.onBrand }]}>
                    Holiday
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Tabs — chip row */}
        <View style={styles.tabs}>
          <Pressable
            testID="tab-deliveries"
            style={[styles.tab, tab === "deliveries" && styles.tabActive]}
            onPress={() => setTab("deliveries")}
          >
            <Feather name="truck" size={14}
              color={tab === "deliveries" ? colors.onBrand : colors.onSurfaceMuted} />
            <Text style={[styles.tabText,
              tab === "deliveries" && { color: colors.onBrand }]}>
              Deliveries · {orders.length}
            </Text>
          </Pressable>
          <Pressable
            testID="tab-pickups"
            style={[styles.tab, tab === "pickups" && styles.tabActive]}
            onPress={() => setTab("pickups")}
          >
            <Feather name="package" size={14}
              color={tab === "pickups" ? colors.onBrand : colors.onSurfaceMuted} />
            <Text style={[styles.tabText,
              tab === "pickups" && { color: colors.onBrand }]}>
              Pickups · {pickups.length}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {tab === "pickups" ? (
          pickups.length === 0 ? (
            <View style={[styles.card, { alignItems: "center", paddingVertical: spacing.xxl }]}
              testID="pickups-empty">
              <Feather name="check-circle" size={36} color={colors.success} />
              <Text style={{ color: colors.onSurface, fontWeight: "700", marginTop: spacing.sm }}>
                All hotboxes collected
              </Text>
              <Text style={{ color: colors.onSurfaceMuted, marginTop: 4 }}>
                No empty hotboxes pending pickup.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.banner}>
                <Feather name="info" size={16} color={colors.warning} />
                <Text style={styles.bannerText}>
                  Collect these hotboxes before delivering today&apos;s order.
                </Text>
              </View>
              {pickups.map((p, idx) => (
                <View key={p.id} style={[styles.stopCard, styles.pickupCard]}
                  testID={`pickup-${p.id}`}>
                  <View style={styles.stopHead}>
                    <View style={[styles.stopNum, { backgroundColor: colors.warningBg }]}>
                      <Text style={[styles.stopNumText, { color: colors.warning }]}>
                        {idx + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stopName}>{p.customer_name}</Text>
                      <Text style={styles.stopAddr}>{p.customer_address}</Text>
                      <View style={styles.pickupMeta}>
                        <Feather name="clock" size={11} color={colors.onSurfaceMuted} />
                        <Text style={styles.pickupMetaText}>
                          From {p.date}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      testID={`call-pickup-${p.id}`}
                      style={styles.callBtn}
                      onPress={() => p.customer_phone && Linking.openURL(`tel:${p.customer_phone}`)}
                    >
                      <Feather name="phone" size={16} color={colors.brand} />
                    </Pressable>
                  </View>
                  <Pressable
                    testID={`mark-pickup-${p.id}`}
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => markHotbox(p, true)}
                  >
                    <Feather name="package" size={18} color={colors.onBrand} />
                    <Text style={[styles.actionText, { color: colors.onBrand }]}>
                      Mark Hotbox Picked
                    </Text>
                  </Pressable>
                </View>
              ))}
            </>
          )
        ) : orders.length === 0 ? (
          <View style={[styles.card, { alignItems: "center", paddingVertical: spacing.xxl }]}>
            <Feather name="check-circle" size={36} color={colors.success} />
            <Text style={{ color: colors.onSurface, fontWeight: "700", marginTop: spacing.sm }}>
              All clear!
            </Text>
            <Text style={{ color: colors.onSurfaceMuted, marginTop: 4 }}>
              No deliveries assigned right now.
            </Text>
          </View>
        ) : (
          orders.map((o, idx) => (
            <View key={o.id}
              style={[styles.stopCard, o.delivered && styles.stopDone]}
              testID={`stop-${o.id}`}>
              <View style={styles.stopHead}>
                <View style={styles.stopNum}>
                  <Text style={styles.stopNumText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName}>{o.customer_name}</Text>
                  <Text style={styles.stopAddr}>{o.customer_address}</Text>
                  {o.customer_notes ? (
                    <View style={styles.noteRow}>
                      <Feather name="info" size={11} color={colors.warning} />
                      <Text style={styles.noteText}>{o.customer_notes}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  testID={`call-${o.id}`}
                  style={styles.callBtn}
                  onPress={() => o.customer_phone && Linking.openURL(`tel:${o.customer_phone}`)}
                >
                  <Feather name="phone" size={16} color={colors.brand} />
                </Pressable>
              </View>

              <View style={styles.mealsRow}>
                {MEALS.map((m) =>
                  o[m].enabled && o[m].quantity > 0 ? (
                    <View key={m} style={styles.mealChip}>
                      <Text style={styles.mealChipText}>
                        {m[0].toUpperCase()}{m.slice(1)} · {o[m].quantity} member{o[m].quantity > 1 ? "s" : ""}
                      </Text>
                    </View>
                  ) : null,
                )}
              </View>

              <View style={styles.actions}>
                <Pressable
                  testID={`mark-delivered-${o.id}`}
                  style={[styles.actionBtn,
                    o.delivered ? styles.actionDone : styles.actionPrimary]}
                  onPress={() => !o.delivered && markDelivered(o)}
                  disabled={o.delivered}
                >
                  <Feather name={o.delivered ? "check-circle" : "circle"} size={18}
                    color={o.delivered ? colors.success : colors.onBrand} />
                  <Text style={[styles.actionText,
                    { color: o.delivered ? colors.success : colors.onBrand }]}>
                    {o.delivered ? "Delivered" : "Mark Delivered"}
                  </Text>
                </Pressable>

                <Pressable
                  testID={`mark-hotbox-${o.id}`}
                  style={[styles.actionBtn,
                    o.hotbox_collected ? styles.actionDone : styles.actionSecondary]}
                  onPress={() => !o.hotbox_collected && markHotbox(o, false)}
                  disabled={o.hotbox_collected}
                >
                  <Feather name="package" size={16}
                    color={o.hotbox_collected ? colors.success : colors.onBrandTertiary} />
                  <Text style={[styles.actionText,
                    { color: o.hotbox_collected ? colors.success : colors.onBrandTertiary }]}>
                    {o.hotbox_collected ? "Hotbox in" : "Collect Hotbox"}
                  </Text>
                </Pressable>
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
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  greet: { color: colors.onSurfaceMuted, fontSize: 13 },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5, marginTop: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.md,
                 marginTop: spacing.md },
  progressBar: { flex: 1, height: 8, borderRadius: 4,
                 backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brand },
  progressText: { fontSize: 12, color: colors.onSurface, fontWeight: "700" },

  tabs: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },

  dateRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  dateChip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center",
  },
  dateChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dateLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  dateHoliday: { fontSize: 9, fontWeight: "700", color: colors.warning,
                 marginTop: 1, letterSpacing: 0.3 },
  tab: {
    flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  tabActive: { backgroundColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceMuted,
             letterSpacing: 0.2 },

  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
          padding: spacing.lg, ...shadow.card },

  banner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.warningBg,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  bannerText: { color: colors.onSurface, fontSize: 13, flex: 1 },

  stopCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
    borderLeftWidth: 4, borderLeftColor: colors.brand,
  },
  stopDone: { borderLeftColor: colors.success, opacity: 0.7 },
  pickupCard: { borderLeftColor: colors.warning },
  stopHead: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  stopNum: { width: 32, height: 32, borderRadius: radius.pill,
             backgroundColor: colors.surfaceTertiary,
             alignItems: "center", justifyContent: "center" },
  stopNumText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 14 },
  stopName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  stopAddr: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  noteText: { fontSize: 12, color: colors.warning, fontWeight: "600" },
  pickupMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  pickupMetaText: { fontSize: 11, color: colors.onSurfaceMuted, fontWeight: "600" },
  callBtn: { width: 36, height: 36, borderRadius: radius.pill,
             backgroundColor: colors.surfaceTertiary,
             alignItems: "center", justifyContent: "center" },

  mealsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap",
              marginBottom: spacing.md },
  mealChip: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.sm,
  },
  mealChipText: { fontSize: 12, fontWeight: "600", color: colors.onSurface },

  actions: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.xs, paddingVertical: 12, borderRadius: radius.md,
  },
  actionPrimary: { backgroundColor: colors.brand },
  actionSecondary: { backgroundColor: colors.surfaceTertiary },
  actionDone: { backgroundColor: "#E5EFE5" },
  actionText: { fontWeight: "700", fontSize: 13 },
});
