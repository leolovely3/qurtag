import Capacitor
import Foundation
import Security
import UIKit
import UserNotifications

/// Everything the iPhone does with a notification outside the web page.
///
/// - Registers the two notification categories the server names in its payloads
///   (server/push/apns.ts): QURTAG_FOUND and QURTAG_MESSAGE. Both carry a "Reply" text-input
///   action, so a reply can be typed on the lock screen or in a banner.
/// - Handles "Reply" itself, in native code, so it works with the app in the background or
///   closed: the web page may be asleep or not loaded then. It reads the session token the page
///   handed over (Keychain, readable after the first unlock), asks the server for a short-lived
///   pass with it (GET /api/auth/token), and posts the text (POST /api/fn/push-reply). If that
///   fails, it says so in a notification so the reply is never silently lost.
/// - Everything else (a tap, a notification arriving while the app is open) goes to Capacitor's
///   router, which tells the page. The app sets `ios.handleApplicationNotifications` to false in
///   capacitor.config.ts so that this object, installed in AppDelegate before the app finishes
///   launching (iOS requires that for actions that wake a closed app), is the only delegate.
final class QurTagNotifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = QurTagNotifications()

    static let categoryFound = "QURTAG_FOUND"
    static let categoryMessage = "QURTAG_MESSAGE"
    static let categoryAdmin = "QURTAG_ADMIN"
    static let replyAction = "QURTAG_REPLY"

    /// Capacitor's router, set when the page's bridge is up.
    private weak var router: NotificationRouter?
    /// Taps that arrived before the bridge was up (the app was closed): handed over once it is.
    private var waiting: [UNNotificationResponse] = []

    func install() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let reply = UNTextInputNotificationAction(
            identifier: Self.replyAction,
            title: "Reply",
            options: [],
            textInputButtonTitle: "Send",
            textInputPlaceholder: "Write a reply"
        )
        // If the person hides previews in iPhone Settings, the lock screen shows this instead of the note.
        let placeholder = "You have a new note"
        let found = UNNotificationCategory(
            identifier: Self.categoryFound, actions: [reply], intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: placeholder, options: [])
        let message = UNNotificationCategory(
            identifier: Self.categoryMessage, actions: [reply], intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: placeholder, options: [])
        // Admin alerts carry no actions: a tap opens Admin.
        let admin = UNNotificationCategory(identifier: Self.categoryAdmin, actions: [], intentIdentifiers: [], options: [])
        center.setNotificationCategories([found, message, admin])
    }

    func attach(router: NotificationRouter?) {
        self.router = router
        guard let router = router else { return }
        let center = UNUserNotificationCenter.current()
        let pending = waiting
        waiting = []
        for response in pending {
            router.userNotificationCenter(center, didReceive: response, withCompletionHandler: {})
        }
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Let the page know (it may refresh the inbox), and show the alert even while the app is open.
        router?.userNotificationCenter(center, willPresent: notification, withCompletionHandler: { _ in })
        completionHandler([.banner, .list, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if response.actionIdentifier == Self.replyAction, let typed = response as? UNTextInputNotificationResponse {
            let thread = response.notification.request.content.userInfo["thread"] as? String
            QurTagReply.send(thread: thread, text: typed.userText) { completionHandler() }
            return
        }
        if let router = router {
            router.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
        } else {
            waiting.append(response)
            completionHandler()
        }
    }
}

/// Posts a reply typed in a notification.
enum QurTagReply {
    static func send(thread: String?, text: String, done: @escaping () -> Void) {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let thread = thread, !body.isEmpty else { done(); return }
        guard let session = QurTagSession.token, let base = QurTagSession.apiBase else {
            failed("Open QuR Tag and sign in, then reply.", done)
            return
        }
        // The system gives a notification action about 30 seconds; ask for the time to finish the two calls.
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "qurtag-reply") {
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
        let finish: (String?) -> Void = { problem in
            if let problem = problem { failed(problem, {}) }
            if task != .invalid {
                UIApplication.shared.endBackgroundTask(task)
                task = .invalid
            }
            done()
        }

        var passRequest = URLRequest(url: base.appendingPathComponent("api/auth/token"))
        passRequest.timeoutInterval = 15
        passRequest.setValue("Bearer \(session)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: passRequest) { data, response, _ in
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let pass = json["token"] as? String else {
                finish("Your reply was not sent. Open QuR Tag and reply there.")
                return
            }
            var request = URLRequest(url: base.appendingPathComponent("api/fn/push-reply"))
            request.httpMethod = "POST"
            request.timeoutInterval = 15
            request.setValue("Bearer \(pass)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["thread": thread, "body": body])
            URLSession.shared.dataTask(with: request) { data, response, _ in
                guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                    finish("Your reply was not sent. Open QuR Tag and reply there.")
                    return
                }
                if let data = data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let unread = json["unread"] as? Int {
                    QurTagBadge.set(unread)
                }
                finish(nil)
            }.resume()
        }.resume()
    }

    /// Tells the person a reply did not go, so it is not silently lost.
    private static func failed(_ message: String, _ done: @escaping () -> Void) {
        let content = UNMutableNotificationContent()
        content.title = "Reply not sent"
        content.body = message
        content.sound = .default
        let request = UNNotificationRequest(identifier: "qurtag-reply-failed", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { _ in done() }
    }
}

enum QurTagBadge {
    static func set(_ count: Int) {
        let n = max(0, count)
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(n) { _ in }
        } else {
            DispatchQueue.main.async { UIApplication.shared.applicationIconBadgeNumber = n }
        }
    }
}

/// The session token the page hands over, kept in the Keychain (this device only, readable after
/// the first unlock so a reply works with the phone locked), and the server's address.
enum QurTagSession {
    private static let service = "app.impactconsultingai.qurtag.session"
    private static let account = "bearer"
    private static let baseKey = "qurtag.apiBase"

    static var apiBase: URL? {
        guard let s = UserDefaults.standard.string(forKey: baseKey), let url = URL(string: s), url.scheme == "https" else { return nil }
        return url
    }

    static var token: String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(token: String, apiBase: String) {
        clear()
        UserDefaults.standard.set(apiBase, forKey: baseKey)
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemAdd(add as CFDictionary, nil)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
