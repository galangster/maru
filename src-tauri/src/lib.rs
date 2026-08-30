mod gateway;

use socket2::{Domain, Protocol, SockAddr, Socket, Type};
use std::io::{BufRead, BufReader, ErrorKind, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::time::{Duration, Instant};

/// Service name used for every Wren keychain entry.
const KEYRING_SERVICE: &str = "dev.wren.app";

/// How long `oauth_listen` waits for the browser redirect before giving up.
const OAUTH_TIMEOUT: Duration = Duration::from_secs(180);

/// How long a single accepted connection may take to send its request line.
const OAUTH_SOCKET_TIMEOUT: Duration = Duration::from_secs(10);

const OAUTH_SUCCESS_BODY: &str = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Wren</title></head><body style=\"font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#1e293b\"><p>Signed in &mdash; you can close this tab and return to Wren.</p></body></html>";

const OAUTH_NOT_FOUND_BODY: &str = "Not Found";

// ---------------------------------------------------------------------------
// Keychain commands
// ---------------------------------------------------------------------------

fn keyring_entry(key: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| e.to_string())
}

/// Store `value` under `key` in the OS keychain.
#[tauri::command]
async fn secret_set(key: String, value: String) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    keyring_entry(&key)?
      .set_password(&value)
      .map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Read the value stored under `key`. Returns `None` when no entry exists.
#[tauri::command]
async fn secret_get(key: String) -> Result<Option<String>, String> {
  tauri::async_runtime::spawn_blocking(move || match keyring_entry(&key)?.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Delete the entry stored under `key`. Missing entries are not an error.
#[tauri::command]
async fn secret_delete(key: String) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || match keyring_entry(&key)?.delete_credential() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  })
  .await
  .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// OAuth loopback listener
// ---------------------------------------------------------------------------

fn write_http_response(stream: &mut TcpStream, status_line: &str, content_type: &str, body: &str) {
  let response = format!(
    "{status_line}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  );
  let _ = stream.write_all(response.as_bytes());
  let _ = stream.flush();
}

/// Read the HTTP request line and return the request target (path plus query).
fn read_request_target(stream: &TcpStream) -> Option<String> {
  let mut request_line = String::new();
  let mut reader = BufReader::new(stream);
  reader.read_line(&mut request_line).ok()?;
  let mut parts = request_line.split_whitespace();
  let method = parts.next()?;
  let target = parts.next()?;
  if method != "GET" {
    return None;
  }
  Some(target.to_string())
}

const OAUTH_TIMEOUT_MESSAGE: &str = "timed out waiting for the OAuth redirect";

/// Block on `accept()` until the browser arrives or the deadline passes.
///
/// This used to poll: a non-blocking accept and a 100 ms sleep, which woke the
/// thread 1,800 times over the three-minute window and still answered the real
/// redirect up to 100 ms late. A read timeout on the *listening* socket bounds
/// the accept directly, so the thread sleeps in the kernel until there is
/// something to do.
fn oauth_listen_blocking(port: u16) -> Result<String, String> {
  let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
  let socket = Socket::new(Domain::IPV4, Type::STREAM, Some(Protocol::TCP))
    .map_err(|e| format!("failed to open a socket: {e}"))?;
  socket
    .bind(&SockAddr::from(addr))
    .map_err(|e| format!("failed to bind {addr}: {e}"))?;
  socket
    .listen(16)
    .map_err(|e| format!("failed to listen on {addr}: {e}"))?;

  let deadline = Instant::now() + OAUTH_TIMEOUT;

  loop {
    // Browsers probe /favicon.ico first, so several connections can land
    // inside one window; each pass gets what is left of the deadline.
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
      return Err(OAUTH_TIMEOUT_MESSAGE.to_string());
    }
    socket
      .set_read_timeout(Some(remaining))
      .map_err(|e| format!("failed to set the accept timeout: {e}"))?;

    let accepted = match socket.accept() {
      Ok((stream, _addr)) => stream,
      Err(ref e) if e.kind() == ErrorKind::WouldBlock || e.kind() == ErrorKind::TimedOut => {
        return Err(OAUTH_TIMEOUT_MESSAGE.to_string());
      }
      Err(e) => return Err(format!("accept failed: {e}")),
    };

    let mut stream: TcpStream = accepted.into();
    let _ = stream.set_read_timeout(Some(OAUTH_SOCKET_TIMEOUT));
    let _ = stream.set_write_timeout(Some(OAUTH_SOCKET_TIMEOUT));

    let target = match read_request_target(&stream) {
      Some(target) => target,
      None => {
        write_http_response(
          &mut stream,
          "HTTP/1.1 404 Not Found",
          "text/plain; charset=utf-8",
          OAUTH_NOT_FOUND_BODY,
        );
        continue;
      }
    };

    // Browsers probe /favicon.ico and similar. Only /callback ends the wait.
    if target == "/callback" || target.starts_with("/callback?") {
      write_http_response(
        &mut stream,
        "HTTP/1.1 200 OK",
        "text/html; charset=utf-8",
        OAUTH_SUCCESS_BODY,
      );
      return Ok(target);
    }

    write_http_response(
      &mut stream,
      "HTTP/1.1 404 Not Found",
      "text/plain; charset=utf-8",
      OAUTH_NOT_FOUND_BODY,
    );
  }
}

/// Listen on `127.0.0.1:port` until the OAuth provider redirects to `/callback`.
/// Returns the full request target, for example `/callback?code=...&state=...`.
#[tauri::command]
async fn oauth_listen(port: u16) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || oauth_listen_blocking(port))
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]

/// Put the traffic lights where the design says they go.
///
/// macOS 26 pins overlay window buttons at (20, 11) against every polite
/// lever: `trafficLightPosition` ignores y, `setFrameOrigin` is reverted
/// within a frame, and a unified toolbar changes nothing under
/// `fullSizeContentView`. What works — and what Electron ships as
/// WindowButtonsProxy — is re-parenting the three standard buttons into a
/// container view of our own: once their superview is not the theme frame,
/// AppKit's relayout leaves them where we put them. The container pins to
/// the top-left through resizes via its autoresizing mask; each button
/// keeps its own target/action and hover highlight.
#[cfg(target_os = "macos")]
fn place_traffic_lights(window: &tauri::Window) {
  use objc2::{MainThreadMarker, MainThreadOnly};
  use objc2_app_kit::{NSAutoresizingMaskOptions, NSView, NSWindow, NSWindowButton};
  use objc2_foundation::{NSPoint, NSRect, NSSize};

  // The visual gap from the window's top-left corner to the red button's
  // circle, both axes — "equidistant" is the ruling. The circle sits ~2 pt
  // inside its frame horizontally; vertically the frame hugs the circle.
  const GAP: f64 = 16.0;
  const CIRCLE_PAD_X: f64 = -2.0; // measured: red reads 2pt left of frame origin

  let Ok(handle) = window.ns_window() else { return };
  let Some(mtm) = MainThreadMarker::new() else { return };
  let ns = unsafe { &*(handle as *const NSWindow) };
  unsafe {
    let buttons = [
      NSWindowButton::CloseButton,
      NSWindowButton::MiniaturizeButton,
      NSWindowButton::ZoomButton,
    ];
    let Some(close) = ns.standardWindowButton(buttons[0]) else { return };
    let Some(frame_view) = close.superview() else { return };

    // Idempotent: if the close button already lives in our container (its
    // superview is no longer the theme frame's direct child holding the
    // title bar), re-place only.
    let btn_h = close.frame().size.height;
    let pitch = 20.0; // AppKit's own spacing between button origins
    let container_w = GAP + CIRCLE_PAD_X + pitch * 2.0 + close.frame().size.width + 4.0;
    let container_h = GAP + btn_h;

    let parent_h = frame_view.frame().size.height;
    let container_frame = NSRect {
      origin: NSPoint { x: 0.0, y: parent_h - container_h },
      size: NSSize { width: container_w, height: container_h },
    };

    let container = NSView::initWithFrame(NSView::alloc(mtm), container_frame);
    // Pin to top-left: flexible right and bottom margins.
    container.setAutoresizingMask(
      NSAutoresizingMaskOptions::ViewMaxXMargin | NSAutoresizingMaskOptions::ViewMinYMargin,
    );
    frame_view.addSubview(&container);

    for (i, kind) in buttons.into_iter().enumerate() {
      let Some(button) = ns.standardWindowButton(kind) else { continue };
      let frame = button.frame();
      button.removeFromSuperview();
      container.addSubview(&button);
      button.setFrameOrigin(NSPoint {
        x: GAP - CIRCLE_PAD_X + pitch * (i as f64),
        // In the container, y=0 is its bottom; the top gap lives above.
        y: container_h - GAP - frame.size.height,
      });
    }
  }
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .manage(gateway::GatewayState::default())
    .invoke_handler(tauri::generate_handler![
      secret_set,
      secret_get,
      secret_delete,
      oauth_listen,
      gateway::gateway_auth_result,
      gateway::gateway_reply,
      gateway::gateway_close,
      gateway::gateway_info
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // The agent gateway. A failure here must not stop Wren from being a mail
      // client — the socket is an extra surface, not a dependency of the app.
      match gateway::start(app.handle()) {
        Ok(path) => log::info!("gateway: listening on {path}"),
        Err(e) => log::error!("gateway: {e}"),
      }
      #[cfg(target_os = "macos")]
      {
        use tauri::Manager;
        if let Some(window) = app.handle().webview_windows().values().next() {
          place_traffic_lights(&window.as_ref().window());
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
