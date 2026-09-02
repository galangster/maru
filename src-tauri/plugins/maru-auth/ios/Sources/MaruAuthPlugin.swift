import AuthenticationServices
import Tauri
import UIKit
import WebKit

private final class StartAuthSessionArgs: Decodable {
  let url: String
  let callbackScheme: String
}

final class MaruAuthPlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
  private var session: ASWebAuthenticationSession?
  private weak var webView: WKWebView?

  @objc public override func load(webview: WKWebView) {
    self.webView = webview
  }

  @objc public func startAuthSession(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartAuthSessionArgs.self)
    guard let authorizationURL = URL(string: args.url) else {
      invoke.reject("failed", code: "failed")
      return
    }

    DispatchQueue.main.async { [weak self] in
      guard let self, self.session == nil else {
        invoke.reject("failed", code: "failed")
        return
      }

      let session = ASWebAuthenticationSession(
        url: authorizationURL,
        callbackURLScheme: args.callbackScheme
      ) { [weak self] callbackURL, error in
        DispatchQueue.main.async {
          self?.session = nil
          if let authError = error as? ASWebAuthenticationSessionError,
             authError.code == .canceledLogin {
            invoke.reject("cancelled", code: "cancelled")
          } else if error != nil || callbackURL == nil {
            invoke.reject("failed", code: "failed")
          } else {
            invoke.resolve(["callbackUrl": callbackURL!.absoluteString])
          }
        }
      }
      session.prefersEphemeralWebBrowserSession = false
      session.presentationContextProvider = self
      self.session = session
      if !session.start() {
        self.session = nil
        invoke.reject("failed", code: "failed")
      }
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    let keyWindow = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
    guard let anchor = keyWindow ?? webView?.window else {
      preconditionFailure("Maru auth requires a connected presentation window")
    }
    return anchor
  }
}

@_cdecl("init_plugin_maru_auth")
func initPlugin() -> Plugin {
  MaruAuthPlugin()
}
