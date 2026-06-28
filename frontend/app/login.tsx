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
import { colors, spacing, radius, shadow, font } from "@/src/lib/theme";

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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.frame}>
          <View style={styles.hero}>
            <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={["rgba(44,42,40,0.15)", "rgba(44,42,40,0.85)"]}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView edges={["top"]} style={styles.heroInner}>
              <Text style={styles.heroSmall}>Welcome to</Text>
              <Text style={styles.heroTitle} testID="login-title">Home Tiffin</Text>
              <Text style={styles.heroSub}>Fresh, home-cooked meals · delivered daily</Text>
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
                <View style={styles.hintBlock}>
                  <Text style={styles.hintLabel}>Seeded test accounts</Text>
                  <Text style={styles.hintLine}>
                    <Text style={styles.hintRole}>Admin</Text>  9000000001
                  </Text>
                  <Text style={styles.hintLine}>
                    <Text style={styles.hintRole}>Delivery</Text>  9000000002
                  </Text>
                  <Text style={styles.hintLine}>
                    <Text style={styles.hintRole}>Customer</Text>  9999911111
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.h2}>Enter the code</Text>
                <Text style={styles.muted}>
                  Sent to{" "}
                  <Text style={styles.mutedStrong}>{normalizedPhone}</Text>
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
  hero: { height: 260, backgroundColor: colors.surfaceInverse,
          overflow: "hidden" },
  heroInner: { flex: 1, paddingHorizontal: spacing.xl,
               paddingBottom: spacing.xl + 8, justifyContent: "flex-end" },
  heroSmall: { color: colors.brandTertiary, fontSize: 13,
               marginBottom: 2, letterSpacing: 0.3,
               fontFamily: font.body },
  heroTitle: { color: colors.onSurfaceInverse, fontSize: 36, fontWeight: "700",
               fontFamily: font.display,
               letterSpacing: -0.5, lineHeight: 42 },
  heroSub: { color: colors.brandTertiary, fontSize: 13,
             marginTop: spacing.sm, lineHeight: 18,
             fontFamily: font.body },

  card: {
    marginTop: -spacing.xxl,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 4,
    ...shadow.card,
  },
  h2: { fontSize: 20, fontWeight: "700", color: colors.onSurface,
        fontFamily: font.bodyBold,
        marginBottom: spacing.xs, letterSpacing: -0.3 },
  muted: { color: colors.onSurfaceMuted, fontSize: 13,
           marginBottom: spacing.md, lineHeight: 18,
           fontFamily: font.body },
  mutedStrong: { color: colors.onSurface, fontFamily: font.bodyBold,
                 fontWeight: "700" },

  phoneRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cc: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderRadius: radius.md,
    minWidth: 56, alignItems: "center",
  },
  ccText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 15,
            fontFamily: font.bodyBold },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 17, color: colors.onSurface,
    fontFamily: font.body,
  },

  otpInput: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    fontSize: 26, color: colors.onSurface,
    textAlign: "center", letterSpacing: 10,
    marginTop: spacing.xs, marginBottom: spacing.sm,
    fontFamily: font.bodyBold,
  },

  cta: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15,
             letterSpacing: 0.3, fontFamily: font.bodyBold },

  ghost: { paddingVertical: spacing.md - 2, alignItems: "center" },
  ghostText: { color: colors.brand, fontWeight: "600",
               fontFamily: font.bodyBold },

  error: {
    color: colors.error, fontSize: 13, marginTop: spacing.xs,
    backgroundColor: "#FBE9E9", paddingVertical: 10,
    paddingHorizontal: spacing.md, borderRadius: radius.sm,
    fontFamily: font.body,
  },
  hintBlock: {
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider,
  },
  hintLabel: {
    color: colors.onSurfaceMuted, fontSize: 11,
    fontFamily: font.bodyBold, fontWeight: "700",
    letterSpacing: 0.8, textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  hintLine: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 18,
              fontFamily: font.body },
  hintRole: { color: colors.onBrandTertiary, fontFamily: font.bodyBold,
              fontWeight: "700" },

  devOtp: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginVertical: spacing.sm,
  },
  devOtpLabel: { color: colors.warning, fontWeight: "700", fontSize: 11,
                 letterSpacing: 1, fontFamily: font.bodyBold },
  devOtpCode: { color: colors.onSurface, fontWeight: "700", fontSize: 20,
                letterSpacing: 5, fontFamily: font.bodyBold },
});
