import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator, Pressable, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { supportApi, SupportThread } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";
import ChatPanel from "@/src/components/ChatPanel";

export default function CustomerSupport() {
  const { user } = useAuth();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [contact, setContact] = useState<{ name: string; phone: string;
    available: string } | null>(null);

  useEffect(() => {
    supportApi.myThread().then(setThread).catch(() => setThread(null));
    supportApi.contact().then(setContact).catch(() => setContact(null));
  }, []);

  if (!user || !thread) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {contact && contact.phone ? (
        <Pressable
          testID="support-call-card"
          onPress={() => Linking.openURL(`tel:${contact.phone}`)
            .catch(() => {})}
          style={styles.callCard}
        >
          <View style={styles.callIcon}>
            <Feather name="phone-call" size={18} color={colors.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.callLabel}>Prefer to talk?</Text>
            <Text testID="support-call-phone" style={styles.callPhone}>
              {contact.phone}
            </Text>
            <Text style={styles.callHours}>
              {contact.name.split(" ")[0]} · {contact.available}
            </Text>
          </View>
          <Feather name="chevron-right" size={18}
            color={colors.onSurfaceMuted} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <ChatPanel
          thread={thread}
          myRole="customer"
          myUserId={user.id}
          headerTitle="Maavadu Support"
          headerSubtitle="Or chat below — typically replies in a few minutes"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center",
            backgroundColor: colors.surface },
  callCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    margin: spacing.lg, marginBottom: 0,
    padding: spacing.md, borderRadius: radius.lg,
    ...shadow.card,
    borderLeftWidth: 4, borderLeftColor: colors.brand,
  },
  callIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  callLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
               letterSpacing: 0.5, textTransform: "uppercase" },
  callPhone: { fontSize: 16, fontWeight: "700", color: colors.brand,
               letterSpacing: 0.3, marginTop: 2 },
  callHours: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },
});
