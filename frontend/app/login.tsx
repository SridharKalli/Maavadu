import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { auth } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const HERO = "https://images.pexels.com/photos/35008222/pexels-photo-35008222.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Login() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`;

  async function sendOtp() {
    setError(null);
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid phone number");
      return;
    }
    setBusy(true);
    try {
      const r = await auth.sendOtp(normalizedPhone);
      setDevOtp(r.dev_otp || null);
      setStep("otp");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const r = await auth.verifyOtp(normalizedPhone, code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signIn(r.token, r.user);
    } catch (e: any) {
      setError(e.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.frame}>
          <View style={styles.hero}>
            <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={["rgba(44,42,40,0.1)", "rgba(44,42,40,0.85)"]}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView edges={["top"]} style={styles.heroInner}>
              <Text style={styles.heroSmall}>Welcome to</Text>
              <Text style={styles.heroTitle} testID="login-title">Home Tiffin</Text>
              <Text style={styles.heroSub}>Fresh, home-cooked meals delivered daily.</Text>
            </SafeAreaView>
          </View>

          <View style={styles.card}>
            {step === "phone" ? (
              <>
                <Text style={styles.h2}>Sign in with phone</Text>
                <Text style={styles.muted}>
                  We&apos;ll send a 6-digit code to verify your number.
                </Text>
                <View style={styles.phoneRow}>
                  <View style={styles.cc}><Text style={styles.ccText}>+91</Text></View>
                  <TextInput
                    testID="phone-input"
                    style={styles.phoneInput}
                    placeholder="98765 43210"
                    placeholderTextColor={colors.onSurfaceMuted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={15}
                    autoFocus
                  />
                </View>
                {error && <Text style={styles.error} testID="login-error">{error}</Text>}
                <Pressable
                  testID="send-otp-button"
                  style={[styles.cta, busy && { opacity: 0.6 }]}
                  onPress={sendOtp}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color={colors.onBrand} /> :
                    <Text style={styles.ctaText}>Send OTP</Text>}
                </Pressable>
                <Text style={styles.hint}>
                  Try seeded accounts: 9000000001 (Admin) · 9000000002 (Delivery) · 9999911111 (Customer)
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.h2}>Enter the code</Text>
                <Text style={styles.muted}>
                  Sent to <Text style={{ fontWeight: "700" }}>{normalizedPhone}</Text>
                </Text>
                {devOtp && (
                  <View style={styles.devOtp} testID="dev-otp-banner">
                    <Text style={styles.devOtpLabel}>DEV OTP</Text>
                    <Text style={styles.devOtpCode} testID="dev-otp-code">{devOtp}</Text>
                  </View>
                )}
                <TextInput
                  testID="otp-input"
                  style={styles.otpInput}
                  placeholder="••••••"
                  placeholderTextColor={colors.onSurfaceMuted}
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                  maxLength={6}
                  autoFocus
                />
                {error && <Text style={styles.error} testID="otp-error">{error}</Text>}
                <Pressable
                  testID="verify-otp-button"
                  style={[styles.cta, busy && { opacity: 0.6 }]}
                  onPress={verifyOtp}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color={colors.onBrand} /> :
                    <Text style={styles.ctaText}>Verify & Sign in</Text>}
                </Pressable>
                <Pressable
                  testID="change-phone-button"
                  style={styles.ghost}
                  onPress={() => { setStep("phone"); setCode(""); setDevOtp(null); }}
                >
                  <Text style={styles.ghostText}>Change number</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start",
            backgroundColor: colors.surfaceInverse },
  frame: { width: "100%", maxWidth: 480, alignSelf: "center",
           backgroundColor: colors.surface, flexGrow: 1 },
  hero: { height: 320, backgroundColor: colors.surfaceInverse,
          overflow: "hidden" },
  heroInner: { flex: 1, padding: spacing.xl, justifyContent: "flex-end" },
  heroSmall: { color: colors.brandTertiary, fontSize: 14, marginBottom: spacing.xs },
  heroTitle: { color: colors.onSurfaceInverse, fontSize: 40, fontWeight: "700",
               letterSpacing: -0.5 },
  heroSub: { color: colors.brandTertiary, fontSize: 15, marginTop: spacing.sm },

  card: {
    marginTop: -spacing.xl,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.card,
  },
  h2: { fontSize: 22, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.xs },
  muted: { color: colors.onSurfaceMuted, fontSize: 14, marginBottom: spacing.lg },

  phoneRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cc: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    borderRadius: radius.md,
  },
  ccText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 16 },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    fontSize: 18, color: colors.onSurface,
  },

  otpInput: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 16,
    fontSize: 28, color: colors.onSurface,
    textAlign: "center", letterSpacing: 12,
    marginVertical: spacing.md,
  },

  cta: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 16, letterSpacing: 0.3 },

  ghost: { paddingVertical: spacing.md, alignItems: "center" },
  ghostText: { color: colors.brand, fontWeight: "600" },

  error: {
    color: colors.error, fontSize: 14, marginTop: spacing.sm,
    backgroundColor: "#FBE9E9", padding: spacing.md, borderRadius: radius.sm,
  },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.lg, textAlign: "center" },

  devOtp: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginVertical: spacing.sm,
  },
  devOtpLabel: { color: colors.warning, fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  devOtpCode: { color: colors.onSurface, fontWeight: "700", fontSize: 22, letterSpacing: 6 },
});
