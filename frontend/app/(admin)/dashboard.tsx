import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { adminApi, User } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

type Stats = { total_customers: number; active_subscriptions: number;
               today_orders: number; delivered_today: number };

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([adminApi.stats(), adminApi.users()]);
      setStats(s); setUsers(u);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const customers = users.filter((u) => u.role === "customer");
  const delivery = users.filter((u) => u.role === "delivery");

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <Text style={styles.greet} testID="admin-greeting">Hello, {user?.name || "Admin"}</Text>
        <Text style={styles.title}>Today at a glance</Text>

        <View style={styles.statsGrid}>
          <StatCard testID="stat-customers" icon="users" label="Total Families"
            value={stats?.total_customers} tint={colors.brand} />
          <StatCard testID="stat-subs" icon="repeat" label="Active Subs"
            value={stats?.active_subscriptions} tint={colors.success} />
          <StatCard testID="stat-orders" icon="package" label="Today's Orders"
            value={stats?.today_orders} tint={colors.warning} />
          <StatCard testID="stat-delivered" icon="check-circle" label="Delivered"
            value={stats?.delivered_today} tint={colors.info} />
        </View>

        <Text style={styles.sectionH}>Delivery team</Text>
        <View style={styles.card}>
          {delivery.length === 0 ? (
            <Text style={styles.empty}>No delivery partners yet</Text>
          ) : (
            delivery.map((d, i) => (
              <View key={d.id} style={[styles.row, i > 0 && styles.div]}>
                <View style={styles.avatar}>
                  <Feather name="truck" size={18} color={colors.onBrand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{d.name || "(unnamed)"}</Text>
                  <Text style={styles.rowSub}>{d.phone}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionH}>Customers · {customers.length}</Text>
        <View style={styles.card}>
          {customers.map((c, i) => (
            <View key={c.id} style={[styles.row, i > 0 && styles.div]}>
              <View style={[styles.avatar, { backgroundColor: colors.brandSecondary }]}>
                <Feather name="user" size={18} color={colors.onSurface} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} testID={`customer-${i}-name`}>
                  {c.name || "(unnamed)"}
                </Text>
                <Text style={styles.rowSub}>{c.phone}</Text>
                {c.address ? <Text style={styles.rowAddr}>{c.address}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, tint, testID }: any) {
  return (
    <View style={styles.statCard} testID={testID}>
      <View style={[styles.statIcon, { backgroundColor: tint }]}>
        <Feather name={icon} size={18} color={colors.onBrand} />
      </View>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  greet: { color: colors.onSurfaceMuted, fontSize: 14, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5, marginBottom: spacing.lg },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.card,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  statValue: { fontSize: 28, fontWeight: "700", color: colors.onSurface,
               letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2,
               fontWeight: "600" },

  sectionH: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
              letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
              textTransform: "uppercase" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
          padding: spacing.lg, ...shadow.card },
  empty: { color: colors.onSurfaceMuted, fontSize: 14, textAlign: "center",
           paddingVertical: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md,
         paddingVertical: spacing.sm },
  div: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md,
         marginTop: spacing.xs },
  avatar: { width: 36, height: 36, borderRadius: radius.pill,
            backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceMuted },
  rowAddr: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
});
