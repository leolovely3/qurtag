import Capacitor
import UIKit
import UserNotifications

/// The page's way to reach the native side of notifications (src/lib/nativeSession.ts).
@objc(QurTagPushPlugin)
public class QurTagPushPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "QurTagPushPlugin"
    public let jsName = "QurTagPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearDelivered", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "environment", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        QurTagNotifications.shared.attach(router: bridge?.notificationRouter)
    }

    /// Keeps the session token for "Reply" in a notification.
    @objc func setSession(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty,
              let base = call.getString("apiBase"), base.hasPrefix("https://") else {
            call.reject("A token and an https address are needed")
            return
        }
        QurTagSession.save(token: token, apiBase: base)
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        QurTagSession.clear()
        call.resolve()
    }

    @objc func setBadge(_ call: CAPPluginCall) {
        QurTagBadge.set(call.getInt("count") ?? 0)
        call.resolve()
    }

    /// Takes delivered notifications off the lock screen: one conversation's, or all.
    @objc func clearDelivered(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        let thread = call.getString("thread")
        center.getDeliveredNotifications { delivered in
            let ids = delivered
                .filter { thread == nil || $0.request.content.threadIdentifier == thread }
                .map { $0.request.identifier }
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
            call.resolve()
        }
    }

    /// Which Apple push server this build's device token belongs to. A build signed for development
    /// (run from Xcode) says so in its provisioning profile; TestFlight and App Store builds have none.
    @objc func environment(_ call: CAPPluginCall) {
        call.resolve(["environment": Self.apnsEnvironment()])
    }

    static func apnsEnvironment() -> String {
        if let path = Bundle.main.path(forResource: "embedded", ofType: "mobileprovision"),
           let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
           let text = String(data: data, encoding: .isoLatin1),
           let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>") {
            let xml = String(text[start.lowerBound..<end.upperBound])
            if let plist = try? PropertyListSerialization.propertyList(from: Data(xml.utf8), options: [], format: nil) as? [String: Any],
               let entitlements = plist["Entitlements"] as? [String: Any],
               let aps = entitlements["aps-environment"] as? String {
                return aps == "development" ? "sandbox" : "production"
            }
        }
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }
}
