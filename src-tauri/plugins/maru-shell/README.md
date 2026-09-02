# tauri-plugin-maru-shell

iOS-only. Hosts the Tauri WKWebView inside a `UITabBarController` so the bottom
chrome is the system's — Liquid Glass and scroll-minimize on the iOS 26 SDK,
the classic bar below it — and exposes the system haptic generators.

The web layer talks to it through `src/platform/shell.ts`.
