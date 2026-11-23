import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from "react-native-webview";

// The WebView typings lag behind the React types in this SDK; a typed alias keeps the props checked without the overload clash.
const NativeWebView = WebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebView> }>;
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";

/**
 * Crayons Staff: the website inside a native shell, plus the things a website
 * cannot do on a phone: push notifications, a break reminder, Face ID, and a
 * clean hand-off of the Wallet pass.
 */
const SITE = (Constants.expoConfig?.extra?.siteUrl as string) || "https://www.crayonstaff.com";
const LOCK_KEY = "crayons.lock";

SplashScreen.preventAutoHideAsync().catch(() => {});
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

type Bridge = { type: string; [k: string]: unknown };

async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators cannot receive push
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Schedule and breaks", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return t.data;
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const [token, setToken] = useState<string | null>(null);
  const [locked, setLocked] = useState<boolean>(false);
  const [lockEnabled, setLockEnabled] = useState<boolean>(false);
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState<string>("/schedule");
  const breakReminder = useRef<string | null>(null);
  // Refs mirror the lock state for the AppState listener, which is registered once.
  const lockEnabledRef = useRef(false);
  const authing = useRef(false);
  const lastAppState = useRef(AppState.currentState);

  // Face ID / passcode gate (optional; toggled from the web app's menu via the bridge).
  // The system prompt itself flips the app to "inactive" and back, so `authing` keeps
  // that round trip from being mistaken for a return from the background.
  const unlock = useCallback(async () => {
    if (authing.current) return;
    authing.current = true;
    try {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hw && (await LocalAuthentication.isEnrolledAsync());
      if (!enrolled) { setLocked(false); return; }
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Crayons Staff", cancelLabel: "Cancel" });
      setLocked(!r.success);
    } catch {
      setLocked(false);
    } finally {
      authing.current = false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const enabled = (await SecureStore.getItemAsync(LOCK_KEY).catch(() => null)) === "1";
      lockEnabledRef.current = enabled;
      setLockEnabled(enabled);
      if (enabled) { setLocked(true); unlock(); }
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
      try { setToken(await getPushToken()); } catch { /* no push on this device */ }
    })();
    // Re-lock only when the app comes back from the background (not from the brief
    // "inactive" state that the Face ID sheet, Control Center or a phone call cause).
    const sub = AppState.addEventListener("change", (s) => {
      const was = lastAppState.current;
      lastAppState.current = s;
      if (s === "active" && was === "background" && lockEnabledRef.current && !authing.current) { setLocked(true); unlock(); }
    });
    return () => sub.remove();
  }, [unlock]);

  // Tapping a notification opens the page it points to.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const url = resp.notification.request.content.data?.url as string | undefined;
      if (url && typeof url === "string") setPath(url);
    });
    return () => sub.remove();
  }, []);

  // Hand the push token to the page whenever it (re)loads; the page registers it for the signed-in person.
  const sendToPage = useCallback((msg: Bridge) => {
    webRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent("message", { data: ${JSON.stringify(JSON.stringify(msg))} })); true;`);
  }, []);
  const onLoadEnd = useCallback(() => {
    sendToPage({ type: "native", platform: Platform.OS, version: Constants.expoConfig?.version || "", lockEnabled });
    if (token) sendToPage({ type: "pushToken", token, platform: Platform.OS });
  }, [sendToPage, token, lockEnabled]);

  // Messages from the page.
  const onMessage = useCallback(async (e: WebViewMessageEvent) => {
    let msg: Bridge;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === "breakStarted") {
      const minutes = Number(msg.minutes) || 30;
      if (breakReminder.current) await Notifications.cancelScheduledNotificationAsync(breakReminder.current).catch(() => {});
      breakReminder.current = await Notifications.scheduleNotificationAsync({
        content: { title: "Break check", body: `You have been on break for ${minutes} minutes.`, data: { url: "/clock" } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
      });
    } else if (msg.type === "breakEnded") {
      if (breakReminder.current) { await Notifications.cancelScheduledNotificationAsync(breakReminder.current).catch(() => {}); breakReminder.current = null; }
    } else if (msg.type === "openExternal" && typeof msg.url === "string") {
      const url = msg.url.startsWith("http") ? msg.url : SITE + msg.url;
      // Safari knows how to add a .pkpass to Wallet; the in-app browser does not.
      if (url.includes("/api/wallet/")) Linking.openURL(url).catch(() => {});
      else WebBrowser.openBrowserAsync(url).catch(() => {});
    } else if (msg.type === "setLock") {
      let on = !!msg.enabled;
      if (on) {
        // Confirm Face ID / passcode works on this phone before trusting it as the gate.
        const hw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hw && (await LocalAuthentication.isEnrolledAsync());
        if (!enrolled) on = false;
        else {
          authing.current = true;
          try { on = (await LocalAuthentication.authenticateAsync({ promptMessage: "Turn on app lock", cancelLabel: "Cancel" })).success; }
          catch { on = false; }
          finally { authing.current = false; }
        }
      }
      await SecureStore.setItemAsync(LOCK_KEY, on ? "1" : "0").catch(() => {});
      lockEnabledRef.current = on;
      setLockEnabled(on);
      sendToPage({ type: "native", platform: Platform.OS, version: Constants.expoConfig?.version || "", lockEnabled: on });
    }
  }, [sendToPage]);

  // Keep the page inside the site; anything else opens outside the app.
  const onShouldStart = useCallback((nav: WebViewNavigation) => {
    if (nav.url.startsWith(SITE)) {
      if (nav.url.includes("/api/wallet/")) { Linking.openURL(nav.url).catch(() => {}); return false; }
      return true;
    }
    if (nav.url.startsWith("http")) { WebBrowser.openBrowserAsync(nav.url).catch(() => {}); return false; }
    if (nav.url.startsWith("sms:") || nav.url.startsWith("tel:") || nav.url.startsWith("mailto:")) { Linking.openURL(nav.url).catch(() => {}); return false; }
    return true;
  }, []);

  if (!ready) return <View style={styles.center}><ActivityIndicator /></View>;
  // The page stays mounted under the lock screen so unlocking never reloads it.
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {locked && (
        <View style={styles.lockOverlay}>
          <Text style={styles.lockTitle}>Crayons Staff</Text>
          <TouchableOpacity style={styles.btn} onPress={unlock}><Text style={styles.btnText}>Unlock</Text></TouchableOpacity>
        </View>
      )}
      <NativeWebView
        ref={webRef}
        source={{ uri: SITE + path }}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => <View style={styles.center}><ActivityIndicator /></View>}
        style={styles.web}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f4fb" },
  web: { flex: 1, backgroundColor: "#f5f4fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f4fb", gap: 16 },
  lockOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f4fb", gap: 16 },
  lockTitle: { fontSize: 24, fontWeight: "700", color: "#1e1b3a" },
  btn: { backgroundColor: "#5b3df5", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 17 },
});
