import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Notifications from 'expo-notifications';

const APP_URL = 'https://app.qurtag.com';

/**
 * Injected before content loads — exposes window.qurtagBridge to the web app.
 * The web detects it via `if (window.qurtagBridge)` and routes capability
 * calls through here.
 */
const BRIDGE_JS = `
  window.qurtagBridge = {
    isNative: true,
    platform: ${Platform.OS === 'ios' ? '"ios"' : '"android"'},
    registerPushToken(token) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'register-push-token', token }));
    },
    addToWallet(passUrl) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'add-to-wallet', passUrl }));
    },
    startLiveActivity(payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'start-live-activity', payload }));
    },
  };
  true;
`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        const token = await Notifications.getExpoPushTokenAsync();
        webRef.current?.injectJavaScript(
          `window.qurtagBridge && window.qurtagBridge.__onPushToken && window.qurtagBridge.__onPushToken(${JSON.stringify(token.data)}); true;`,
        );
      }
    })();
  }, []);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; [k: string]: unknown };
      switch (msg.type) {
        case 'register-push-token':
          // The web has the user's auth; it'll POST this to Supabase itself.
          break;
        case 'add-to-wallet':
          // TODO: native Wallet integration. iOS: PKAddPassesViewController.
          break;
        case 'start-live-activity':
          // TODO: native ActivityKit module for iOS.
          break;
      }
    } catch (err) {
      console.warn('[QurTag bridge]', err);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <WebView
        ref={webRef}
        source={{ uri: APP_URL }}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
        onMessage={onMessage}
        allowsBackForwardNavigationGestures
        style={styles.web}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  web: { flex: 1, backgroundColor: '#FFFFFF' },
});
