import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { supportApi, SupportThread } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";
import ChatPanel from "@/src/components/ChatPanel";

export default function AgentThreads() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [active, setActive] = useState<SupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setThreads(await supportApi.listThreads()); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh thread list every 10s when on the list
  useEffect(() => {
    if (active) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [active, load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  if (active && user) {
    return (
      <ChatPanel
        thread={active}
        myRole={user.role}
        myUserId={user.id}
        headerTitle={active.customer_name || "Customer"}
        headerSubtitle={`${active.customer_phone} · ${active.customer_pincode || "—"}`}
        onBack={() => { setActive(null); load(); }}
      />
    );
  }

  const totalUnread = threads.reduce((a, t) => a + (t.unread_for_agent || 0), 0);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Support Inbox</Text>
        <Text style={styles.sub}>
          {threads.length} thread{threads.length !== 1 ? "s" : ""}
          {totalUnread > 0 ? ` · ${totalUnread} unread` : ""}
        </Text>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={32} color={colors.onSurfaceMuted} />
            <Text style={styles.emptyText}>No customer messages yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`thread-${item.id}`}
            style={styles.row}
            onPress={() => setActive(item)}
          >
            <View style={styles.avatar}>
              <Feather name="user" size={18} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>
                  {item.customer_name || item.customer_phone || "Customer"}
                </Text>
                <Text style={styles.rowTime}>
                  {item.last_message_at
                    ? new Date(item.last_message_at).toLocaleString([],
                        { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </Text>
              </View>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {item.last_message_preview || "(no messages yet)"}
              </Text>
              <Text style={styles.rowMeta}>
                {item.customer_phone} · {item.customer_pincode || "—"}
              </Text>
            </View>
            {item.unread_for_agent > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread_for_agent}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
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
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },
  sub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2 },

  row: {
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.card,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand,
            alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", justifyContent: "space-between",
            alignItems: "center" },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface, flex: 1 },
  rowTime: { fontSize: 11, color: colors.onSurfaceMuted },
  rowPreview: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  rowMeta: { color: colors.onSurfaceMuted, fontSize: 11, marginTop: 2 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: colors.onBrand, fontWeight: "700", fontSize: 11 },

  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxxl },
  emptyText: { color: colors.onSurfaceMuted },
});
