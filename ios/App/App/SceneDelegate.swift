import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The web view's own colours follow the phone's light or dark setting, so nothing white shows
/// behind the page in dark mode (capacitor.config.ts can only give one fixed colour). The page
/// draws its own bar under the status bar (src/index.css), so iOS's blurred top edge is turned off.
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let canvas = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 10 / 255, green: 11 / 255, blue: 15 / 255, alpha: 1)
                : UIColor.white
        }
        view.backgroundColor = canvas
        webView?.backgroundColor = canvas
        webView?.scrollView.backgroundColor = canvas
        webView?.underPageBackgroundColor = canvas
        if #available(iOS 26.0, *) {
            webView?.scrollView.topEdgeEffect.isHidden = true
        }
    }
}
