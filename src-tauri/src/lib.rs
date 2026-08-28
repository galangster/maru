use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
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

fn oauth_listen_blocking(port: u16) -> Result<String, String> {
  let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
  let listener = TcpListener::bind(addr).map_err(|e| format!("failed to bind {addr}: {e}"))?;
  listener
    .set_nonblocking(true)
    .map_err(|e| format!("failed to set non-blocking mode: {e}"))?;

  let deadline = Instant::now() + OAUTH_TIMEOUT;

  loop {
    if Instant::now() >= deadline {
      return Err("timed out waiting for the OAuth redirect".to_string());
    }

    let mut stream = match listener.accept() {
      Ok((stream, _addr)) => stream,
      Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
        std::thread::sleep(Duration::from_millis(100));
        continue;
      }
      Err(e) => return Err(format!("accept failed: {e}")),
    };

    // The accepted socket inherits non-blocking mode on some platforms.
    let _ = stream.set_nonblocking(false);
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
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      secret_set,
      secret_get,
      secret_delete,
      oauth_listen
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
