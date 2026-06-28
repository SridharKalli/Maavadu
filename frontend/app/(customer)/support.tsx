import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { supportApi, SupportThread } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors } from "@/src/lib/theme";
import ChatPanel from "@/src/components/ChatPanel";

export default function CustomerSupport() {
  const { user } = useAuth();
  const [thread, setThread] = useState<SupportThread | null>(null);

  useEffect(() => {
    supportApi.myThread().then(setThread).catch(() => setThread(null));
  }, []);

  if (!user || !thread) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <ChatPanel
      thread={thread}
      myRole="customer"
      myUserId={user.id}
      headerTitle="Maavadu Support"
      headerSubtitle="Typically replies in a few minutes"
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center",
            backgroundColor: colors.surface },
});
