import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  AudioModule, useAudioRecorder, useAudioPlayer, RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system";

import { supportApi, SupportMessage, SupportThread, Role } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

interface Props {
  thread: SupportThread;
  myRole: Role;
  myUserId: string;
  headerTitle: string;
  headerSubtitle?: string;
  onBack?: () => void;
}

export default function ChatPanel({ thread, myRole, myUserId, headerTitle,
                                    headerSubtitle, onBack }: Props) {
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recStart, setRecStart] = useState<number | null>(null);
  const listRef = useRef<FlatList<SupportMessage>>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const load = useCallback(async () => {
    try {
      const m = await supportApi.messages(thread.id);
      setMsgs(m);
    } finally { setLoading(false); }
  }, [thread.id]);

  useEffect(() => { load(); }, [load]);

  // Poll every 4 seconds for new messages while panel is open
  useEffect(() => {
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (msgs.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [msgs.length]);

  async function sendText() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const sent = await supportApi.send(thread.id,
        { kind: "text", text: text.trim() });
      setMsgs((p) => [...p, sent]);
      setText("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setRecStart(Date.now());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.warn("rec start failed", e);
    }
  }

  async function stopAndSend() {
    if (!recording) return;
    setRecording(false);
    const durationMs = recStart ? Date.now() - recStart : 0;
    setRecStart(null);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      const b64 = await FileSystem.readAsStringAsync(uri,
        { encoding: FileSystem.EncodingType.Base64 });
      const dataUri = `data:audio/mp4;base64,${b64}`;
      setBusy(true);
      const sent = await supportApi.send(thread.id, {
        kind: "voice", voice_b64: dataUri, voice_duration_ms: durationMs,
      });
      setMsgs((p) => [...p, sent]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function cancelRecording() {
    setRecording(false);
    setRecStart(null);
    try { await recorder.stop(); } catch {}
    Haptics.selectionAsync();
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        {onBack && (
          <Pressable testID="chat-back" onPress={onBack} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
        )}
        <View style={styles.avatar}>
          <Feather name="message-circle" size={18} color={colors.onBrand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          {headerSubtitle ? <Text style={styles.headerSub}>{headerSubtitle}</Text> : null}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Bubble
              msg={item}
              mine={item.sender_id === myUserId}
              canAction={myRole === "admin" || myRole === "agent"}
              onAction={async (action) => {
                try {
                  if (action === "approve") {
                    await supportApi.approveTopup(item.id);
                  } else {
                    await supportApi.rejectTopup(item.id);
                  }
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success);
                  load();
                } catch {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Error);
                }
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Feather name="message-square" size={28} color={colors.onSurfaceMuted} />
              <Text style={styles.emptyText}>
                {myRole === "customer"
                  ? "Send a message or a voice note — we usually reply within a few minutes."
                  : "No messages yet. Send the first reply when the customer writes in."}
              </Text>
            </View>
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Composer */}
        <View style={styles.composer}>
          {recording ? (
            <View style={styles.recRow}>
              <View style={styles.recDot} />
              <Text style={styles.recText} testID="recording-status">
                Recording… release to send
              </Text>
              <Pressable testID="cancel-rec" onPress={cancelRecording}
                style={styles.iconBtn}>
                <Feather name="x" size={18} color={colors.error} />
              </Pressable>
              <Pressable testID="send-voice" onPress={stopAndSend}
                style={[styles.iconBtn, styles.iconBtnPrimary]}>
                <Feather name="send" size={18} color={colors.onBrand} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.composeRow}>
              <TextInput
                testID="chat-input"
                style={styles.textInput}
                value={text} onChangeText={setText}
                placeholder="Type your message…"
                placeholderTextColor={colors.onSurfaceMuted}
                multiline
              />
              {text.trim() ? (
                <Pressable testID="send-text" onPress={sendText}
                  disabled={busy}
                  style={[styles.iconBtn, styles.iconBtnPrimary]}>
                  <Feather name="send" size={18} color={colors.onBrand} />
                </Pressable>
              ) : (
                <Pressable testID="start-rec" onPress={startRecording}
                  style={[styles.iconBtn, styles.iconBtnMic]}>
                  <Feather name="mic" size={20} color={colors.onBrand} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ msg, mine, canAction, onAction }: {
  msg: SupportMessage; mine: boolean;
  canAction: boolean;
  onAction: (action: "approve" | "reject") => void;
}) {
  const time = new Date(msg.created_at).toLocaleTimeString([],
    { hour: "2-digit", minute: "2-digit" });
  const meta = msg.meta;
  const isTopupReq = meta?.type === "topup_request";
  const isTopupAct = meta?.type === "topup_action";
  const pending = isTopupReq && meta?.status === "pending";
  const approved = (isTopupReq || isTopupAct) && meta?.status === "approved";
  const rejected = (isTopupReq || isTopupAct) && meta?.status === "rejected";
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {msg.kind === "voice" ? (
          <VoicePlayer uri={msg.voice_b64} durationMs={msg.voice_duration_ms} mine={mine} />
        ) : (
          <Text style={[styles.bubbleText, mine && { color: colors.onBrand }]}>
            {msg.text}
          </Text>
        )}

        {/* Pending top-up: show Approve / Reject for agents/admins, or a
            "waiting" hint to the customer. */}
        {pending && canAction && (
          <View style={styles.topupActions} testID={`topup-actions-${msg.id}`}>
            <Pressable
              testID={`topup-approve-${msg.id}`}
              onPress={() => onAction("approve")}
              style={[styles.topupBtn, styles.topupBtnApprove]}>
              <Feather name="check" size={14} color={colors.onBrand} />
              <Text style={styles.topupBtnText}>Approve</Text>
            </Pressable>
            <Pressable
              testID={`topup-reject-${msg.id}`}
              onPress={() => onAction("reject")}
              style={[styles.topupBtn, styles.topupBtnReject]}>
              <Feather name="x" size={14} color={colors.error} />
              <Text style={[styles.topupBtnText,
                { color: colors.error }]}>Reject</Text>
            </Pressable>
          </View>
        )}
        {pending && !canAction && (
          <View style={[styles.topupBadge, styles.topupBadgePending]}>
            <Feather name="clock" size={12}
              color={mine ? colors.onBrand : colors.warning} />
            <Text style={[styles.topupBadgeText,
              mine && { color: colors.onBrand }]}>
              Waiting for confirmation
            </Text>
          </View>
        )}
        {(approved || rejected) && isTopupReq && (
          <View style={[styles.topupBadge,
            approved ? styles.topupBadgeApproved : styles.topupBadgeRejected]}>
            <Feather
              name={approved ? "check-circle" : "x-circle"}
              size={12}
              color={mine
                ? colors.onBrand
                : (approved ? colors.success : colors.error)} />
            <Text style={[styles.topupBadgeText,
              mine && { color: colors.onBrand }]}>
              {approved ? "Approved" : "Not approved"}
            </Text>
          </View>
        )}

        <Text style={[styles.bubbleTime, mine && { color: "rgba(255,255,255,0.7)" }]}>
          {time}
        </Text>
      </View>
    </View>
  );
}

function VoicePlayer({ uri, durationMs, mine }: { uri: string; durationMs: number; mine: boolean }) {
  const player = useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);

  function toggle() {
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.seekTo(0);
      player.play();
      setPlaying(true);
      // auto-stop UI state when done
      const t = setTimeout(() => setPlaying(false), Math.max(500, durationMs + 100));
      return () => clearTimeout(t);
    }
  }

  const secs = Math.max(1, Math.round(durationMs / 1000));
  return (
    <Pressable onPress={toggle} style={styles.voiceRow} testID="voice-play-btn">
      <View style={[styles.voiceIcon,
        mine && { backgroundColor: "rgba(255,255,255,0.2)" }]}>
        <Feather name={playing ? "pause" : "play"} size={14}
          color={mine ? colors.onBrand : colors.brand} />
      </View>
      <View style={styles.wave}>
        {Array.from({ length: 16 }).map((_, i) => (
          <View key={i} style={[styles.waveBar,
            { height: 4 + ((i * 7) % 14), backgroundColor: mine ? colors.onBrand : colors.brand }]} />
        ))}
      </View>
      <Text style={[styles.voiceDuration, mine && { color: colors.onBrand }]}>
        {secs}s
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center",
             borderRadius: radius.pill },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand,
            alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceMuted },

  emptyChat: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyText: { color: colors.onSurfaceMuted, fontSize: 14, textAlign: "center",
               lineHeight: 20, maxWidth: 280 },

  bubbleRow: { flexDirection: "row", marginVertical: 2 },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", padding: spacing.md, borderRadius: radius.lg,
            ...shadow.card },
  bubbleMine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: colors.onSurface, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.onSurfaceMuted, marginTop: 4,
                alignSelf: "flex-end" },

  // Inline top-up approve/reject card inside a chat bubble
  topupActions: { flexDirection: "row", gap: 8, marginTop: spacing.sm },
  topupBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1,
  },
  topupBtnApprove: { backgroundColor: colors.brand, borderColor: colors.brand },
  topupBtnReject: { backgroundColor: colors.surface, borderColor: colors.error },
  topupBtnText: { color: colors.onBrand, fontWeight: "700", fontSize: 13 },
  topupBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill, alignSelf: "flex-start",
  },
  topupBadgePending: { backgroundColor: "rgba(217,160,91,0.18)" },
  topupBadgeApproved: { backgroundColor: "rgba(107,142,107,0.18)" },
  topupBadgeRejected: { backgroundColor: "rgba(184,92,92,0.18)" },
  topupBadgeText: { fontSize: 11, fontWeight: "700", color: colors.onSurface },

  composer: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  composeRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  textInput: {
    flex: 1, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: 15, color: colors.onSurface,
    maxHeight: 120, minHeight: 40,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnPrimary: { backgroundColor: colors.brand },
  iconBtnMic: { backgroundColor: colors.brand },

  recRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm,
            paddingVertical: 4 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
  recText: { flex: 1, color: colors.onSurface, fontWeight: "600", fontSize: 14 },

  voiceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm,
              minWidth: 180 },
  voiceIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  wave: { flexDirection: "row", alignItems: "center", gap: 2, flex: 1, height: 20 },
  waveBar: { width: 2, borderRadius: 1, opacity: 0.6 },
  voiceDuration: { fontSize: 12, color: colors.onSurfaceMuted, fontWeight: "700" },
});
