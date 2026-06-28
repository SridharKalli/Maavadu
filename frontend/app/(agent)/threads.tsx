import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, RefreshControl,
  ActivityIndicator, Modal, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { supportApi, SupportThread, User } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";
import ChatPanel from "@/src/components/ChatPanel";

type Customer = User & { thread_id?: string; last_seen_at?: string };

function presenceLabel(lastSeen?: string): { label: string; color: string } {
  if (!lastSeen) return { label: "Never seen", color: colors.onSurfaceMuted };
  const seen = new Date(lastSeen).getTime();
  const age = (Date.now() - seen) / 1000;
  if (age < 60) return { label: "Online now", color: colors.success };
  if (age < 300) return { label: "Active recently", color: colors.success };
  if (age < 3600) return { label: `Seen ${Math.floor(age / 60)}m ago`,
                            color: colors.warning };
  if (age < 86400) return { label: `Seen ${Math.floor(age / 3600)}h ago`,
                             color: colors.onSurfaceMuted };
  return { label: `Seen ${Math.floor(age / 86400)}d ago`,
           color: colors.onSurfaceMuted };
}

export default function AgentThreads() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [active, setActive] = useState<SupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try { setThreads(await supportApi.listThreads()); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (active) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [active, load]);

  async function openPicker() {
    Haptics.selectionAsync();
    setSearch("");
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      setCustomers(await supportApi.customers());
    } finally { setPickerLoading(false); }
  }

  async function startWith(c: Customer) {
    if (starting) return;
    setStarting(true);
    try {
      const t = await supportApi.startThread(c.id);
      const decorated: SupportThread = {
        ...t,
        customer_name: c.name, customer_phone: c.phone,
        customer_pincode: c.pincode, customer_last_seen: c.last_seen_at,
      };
      setPickerOpen(false);
      setActive(decorated);
      load();
    } finally { setStarting(false); }
  }

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
  const filtered = customers.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name?.toLowerCase().includes(s)
      || c.phone?.toLowerCase().includes(s));
  });

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Support Inbox</Text>
          <Text style={styles.sub}>
            {threads.length} thread{threads.length !== 1 ? "s" : ""}
            {totalUnread > 0 ? ` · ${totalUnread} unread` : ""}
          </Text>
        </View>
        <Pressable testID="agent-new-chat" onPress={openPicker}
          style={styles.newBtn}>
          <Feather name="edit" size={16} color={colors.onBrand} />
          <Text style={styles.newBtnText}>New chat</Text>
        </Pressable>
      </View>

      {threads.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="message-circle" size={36} color={colors.onSurfaceMuted} />
          <Text style={styles.emptyText}>
            No conversations yet — tap “New chat” to reach out.
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const presence = presenceLabel(item.customer_last_seen);
            return (
              <Pressable
                testID={`thread-${item.id}`}
                style={styles.threadRow}
                onPress={() => setActive(item)}
              >
                <View style={styles.threadAvatar}>
                  <Feather name="user" size={18} color={colors.onBrand} />
                  {presence.label === "Online now" && (
                    <View style={styles.onlineDot} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.threadName}>
                    {item.customer_name || "Customer"}
                  </Text>
                  <Text style={styles.threadPreview} numberOfLines={1}>
                    {item.last_message_preview || "(no messages)"}
                  </Text>
                  <Text style={[styles.threadPresence, { color: presence.color }]}>
                    {presence.label}
                  </Text>
                </View>
                {item.unread_for_agent > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread_for_agent}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={pickerOpen} transparent animationType="slide"
        onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop}
            onPress={() => setPickerOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Start a new chat</Text>
            <Text style={styles.sheetSub}>
              Pick a customer to reach out to. The first message will create
              the chat — they&apos;ll see it next time they open the app.
            </Text>

            <View style={styles.searchWrap}>
              <Feather name="search" size={14} color={colors.onSurfaceMuted} />
              <TextInput
                testID="agent-search"
                style={styles.searchInput}
                value={search} onChangeText={setSearch}
                placeholder="Search by name or phone"
                placeholderTextColor={colors.onSurfaceMuted}
              />
            </View>

            {pickerLoading ? (
              <ActivityIndicator color={colors.brand}
                style={{ marginTop: spacing.lg }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(c) => c.id}
                style={{ marginTop: spacing.md, maxHeight: 380 }}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                renderItem={({ item }) => {
                  const presence = presenceLabel(item.last_seen_at);
                  return (
                    <Pressable
                      testID={`pick-${item.id}`}
                      style={styles.pickRow}
                      onPress={() => startWith(item)}
                      disabled={starting}
                    >
                      <View style={styles.threadAvatar}>
                        <Feather name="user" size={16} color={colors.onBrand} />
                        {presence.label === "Online now" && (
                          <View style={styles.onlineDot} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.threadName}>
                          {item.name || "(unnamed)"}
                        </Text>
                        <Text style={styles.threadPreview}>
                          {item.phone}
                        </Text>
                        <Text style={[styles.threadPresence,
                          { color: presence.color }]}>
                          {presence.label}
                          {item.thread_id ? " · existing chat" : ""}
                        </Text>
                      </View>
                      <Feather name="message-square" size={16}
                        color={colors.brand} />
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.3 },
  sub: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  newBtn: { flexDirection: "row", gap: 6, alignItems: "center",
            backgroundColor: colors.brand, paddingHorizontal: spacing.md,
            paddingVertical: 8, borderRadius: radius.pill, ...shadow.card },
  newBtnText: { color: colors.onBrand, fontWeight: "700", fontSize: 13 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center",
           padding: spacing.xl, gap: spacing.md },
  emptyText: { color: colors.onSurfaceMuted, textAlign: "center" },
  threadRow: { flexDirection: "row", alignItems: "center", gap: spacing.md,
               backgroundColor: colors.surfaceSecondary,
               padding: spacing.md, borderRadius: radius.lg,
               marginBottom: spacing.sm, ...shadow.card },
  threadAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  onlineDot: {
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: colors.success, borderWidth: 2,
    borderColor: colors.surface,
    position: "absolute", bottom: -2, right: -2,
  },
  threadName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  threadPreview: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  threadPresence: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  badge: { backgroundColor: colors.brand, paddingHorizontal: 8,
           paddingVertical: 3, borderRadius: radius.pill, minWidth: 22,
           alignItems: "center" },
  badgeText: { color: colors.onBrand, fontWeight: "700", fontSize: 11 },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, paddingBottom: spacing.xxl,
    maxHeight: "85%",
  },
  handle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2,
            backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  sheetSub: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: 2,
              marginBottom: spacing.md, lineHeight: 18 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14,
                 color: colors.onSurface },
  pickRow: { flexDirection: "row", alignItems: "center", gap: spacing.md,
             paddingVertical: spacing.sm },
  sep: { height: 1, backgroundColor: colors.divider },
});
