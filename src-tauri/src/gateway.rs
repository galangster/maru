//! The agent gateway socket — a dumb, authenticated frame relay.
//!
//! WHAT THIS FILE IS NOT
//!
//! It is not an MCP server. It holds no protocol knowledge, no tool list, no
//! grant logic and no idea what a mailbox is. Every one of those lives in
//! TypeScript (`src/core/gateway-server/`), where it is unit-testable in plain
//! Node and where the trust substrate M1 built already lives. Splitting it the
//! other way would have put the security decisions in the one layer of this
//! app that has no tests.
//!
//! WHAT IT DOES
//!
//! 1. Listens on a user-private local channel: a unix domain socket at
//!    `<app-data>/gateway.sock` on macOS and Linux, a named pipe on Windows.
//!    Never a loopback TCP port — `docs/research/mcp-gateway-notes.md` §1 is
//!    explicit that "it is on localhost" is not an authentication story, and
//!    the DNS-rebinding advisories against the reference SDKs are what happens
//!    to people who believed otherwise.
//! 2. Frames are newline-delimited JSON, capped at 1 MiB, 8 connections.
//! 3. The FIRST frame of every connection is an auth frame. It is forwarded to
//!    the webview, which resolves it through `AgentRegistry.verifyCredential`
//!    and calls `gateway_auth_result` back. Nothing else is relayed until that
//!    verdict lands.
//! 4. After an accept, the connection is tagged with the verified agent id and
//!    every later frame is relayed webview<->socket verbatim. The agent id on
//!    a relayed frame comes from this tag and never from the frame itself
//!    (notes §2: `clientInfo` is a display label, not a credential).
//!
//! The socket path is deliberately inside Wren's own app-data directory, which
//! is chmodded 0700, with the socket itself at 0600. macOS ignores permission
//! bits on the socket file for `connect()`, so the 0700 *directory* is what
//! actually enforces "same user only" there; the 0600 is belt to that braces.

use interprocess::local_socket::prelude::*;
use interprocess::local_socket::{ListenerOptions, Name};
#[cfg(unix)]
use interprocess::local_socket::GenericFilePath;
#[cfg(windows)]
use interprocess::local_socket::GenericNamespaced;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// One frame may not exceed this. A shim that sends more is closed, not
/// truncated: a truncated JSON-RPC frame would desynchronise the stream.
const MAX_FRAME_BYTES: usize = 1024 * 1024;

/// Concurrent connections. Eight agents at once is far past any real desktop
/// use and low enough that a runaway client cannot exhaust the thread pool.
const MAX_CONNECTIONS: usize = 8;

/// How long a connection waits for the webview's verdict on its auth frame.
/// Generous: the webview may be mid-startup. Bounded: a webview that never
/// answers must not leak a thread and a socket per connection attempt.
const AUTH_VERDICT_TIMEOUT: Duration = Duration::from_secs(20);

/// The Windows pipe name. Mirrored by `bin/wren-mcp.mjs`.
#[cfg(windows)]
const PIPE_NAME: &str = "dev.wren.app-gateway";

// ---------------------------------------------------------------------------
// Events toward the webview
// ---------------------------------------------------------------------------

/// The first frame of a connection, awaiting `gateway_auth_result`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthEvent {
  conn_id: u64,
  frame: String,
}

/// Every frame after a successful auth. `agent_id` is this side's tag, not
/// anything the client said about itself.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrameEvent {
  conn_id: u64,
  agent_id: String,
  frame: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CloseEvent {
  conn_id: u64,
}

pub const EVENT_AUTH: &str = "gateway://auth";
pub const EVENT_FRAME: &str = "gateway://frame";
pub const EVENT_CLOSE: &str = "gateway://close";

/// What `gateway_info` tells the webview. The version travels with it so the
/// TS layer never has to reach for a Tauri app-info permission just to answer
/// `wren_ping`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayInfo {
  /// The path (or pipe name) an agent's shim connects to.
  socket_path: Option<String>,
  running: bool,
  version: String,
}

// ---------------------------------------------------------------------------
// Connection registry
// ---------------------------------------------------------------------------

struct Verdict {
  accepted: bool,
  agent_id: Option<String>,
  message: Option<String>,
}

struct Connection {
  /// The send half. Behind a mutex because the reply path runs on whichever
  /// thread Tauri dispatched the `gateway_reply` command onto.
  writer: Mutex<Box<dyn Write + Send>>,
  /// Filled once, before the auth event is emitted; taken by the verdict.
  verdict: Mutex<Option<SyncSender<Verdict>>>,
}

#[derive(Default)]
pub struct GatewayState {
  conns: Mutex<HashMap<u64, Arc<Connection>>>,
  next_id: AtomicU64,
  socket_path: Mutex<Option<String>>,
}

fn write_frame(conn: &Connection, frame: &str) -> std::io::Result<()> {
  let mut writer = conn
    .writer
    .lock()
    .map_err(|_| std::io::Error::other("gateway writer poisoned"))?;
  writer.write_all(frame.trim_end_matches('\n').as_bytes())?;
  writer.write_all(b"\n")?;
  writer.flush()
}

fn control_frame(kind: &str, message: &str) -> String {
  serde_json::json!({ "type": kind, "message": message }).to_string()
}

/// Read one newline-delimited frame. `Ok(None)` is a clean EOF.
fn read_frame(reader: &mut BufReader<Box<dyn Read + Send>>) -> Result<Option<String>, String> {
  let mut buf = Vec::new();
  // Bounded before the allocation, not after: `read_until` on an unbounded
  // reader would happily buy a gigabyte of memory for one hostile frame.
  let mut limited = Read::take(&mut *reader, (MAX_FRAME_BYTES + 1) as u64);
  let read = limited
    .read_until(b'\n', &mut buf)
    .map_err(|e| format!("read failed: {e}"))?;
  if read == 0 {
    return Ok(None);
  }
  if buf.len() > MAX_FRAME_BYTES {
    return Err(format!("frame exceeds the {MAX_FRAME_BYTES} byte limit"));
  }
  let line = String::from_utf8(buf).map_err(|_| "frame is not valid UTF-8".to_string())?;
  let trimmed = line.trim_end_matches('\n').trim_end_matches('\r');
  Ok(Some(trimmed.to_string()))
}

// ---------------------------------------------------------------------------
// Per-connection thread
// ---------------------------------------------------------------------------

fn handle_connection<R: Runtime>(app: AppHandle<R>, stream: LocalSocketStream) {
  let (recv_half, send_half) = stream.split();
  let conn = Arc::new(Connection {
    writer: Mutex::new(Box::new(send_half)),
    verdict: Mutex::new(None),
  });

  let state = app.state::<GatewayState>();

  // Admission. Over the cap the client gets one honest frame rather than a
  // silent hang it would have to time out of.
  let conn_id = {
    let mut conns = match state.conns.lock() {
      Ok(conns) => conns,
      Err(_) => return,
    };
    if conns.len() >= MAX_CONNECTIONS {
      drop(conns);
      let _ = write_frame(
        &conn,
        &control_frame(
          "error",
          "Wren is already serving the maximum number of agent connections.",
        ),
      );
      return;
    }
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    conns.insert(id, Arc::clone(&conn));
    id
  };

  let reader = BufReader::new(Box::new(recv_half) as Box<dyn Read + Send>);
  if let Err(message) = authenticate_and_relay(&app, &conn, conn_id, reader) {
    let _ = write_frame(&conn, &control_frame("error", &message));
  }

  if let Ok(mut conns) = state.conns.lock() {
    conns.remove(&conn_id);
  }
  let _ = app.emit(EVENT_CLOSE, CloseEvent { conn_id });
}

/// Read the auth frame, wait for the webview's verdict, then relay until EOF.
///
/// `Err` here is a message the client is told before the socket closes. A
/// rejected credential is not an `Err`: it has its own frame, and the reason
/// is deliberately vague (registry.rs's oracle argument — a caller that can
/// tell "wrong token" from "revoked agent" has been handed something it has no
/// legitimate use for).
fn authenticate_and_relay<R: Runtime>(
  app: &AppHandle<R>,
  conn: &Arc<Connection>,
  conn_id: u64,
  mut reader: BufReader<Box<dyn Read + Send>>,
) -> Result<(), String> {
  let Some(auth_frame) = read_frame(&mut reader)? else {
    // Connected and hung up without saying anything. Nothing to report.
    return Ok(());
  };

  let (verdict_tx, verdict_rx) = sync_channel::<Verdict>(1);
  {
    let mut slot = conn
      .verdict
      .lock()
      .map_err(|_| "gateway state poisoned".to_string())?;
    *slot = Some(verdict_tx);
  }

  // Registered before the emit: the webview may answer synchronously.
  app
    .emit(
      EVENT_AUTH,
      AuthEvent {
        conn_id,
        frame: auth_frame,
      },
    )
    .map_err(|e| format!("could not reach the Wren window: {e}"))?;

  let verdict = verdict_rx
    .recv_timeout(AUTH_VERDICT_TIMEOUT)
    .map_err(|_| "Wren did not answer the connection request in time.".to_string())?;

  if !verdict.accepted {
    let message = verdict
      .message
      .unwrap_or_else(|| "Wren rejected this credential.".to_string());
    let _ = write_frame(conn, &control_frame("auth_error", &message));
    return Ok(());
  }

  let agent_id = verdict
    .agent_id
    .ok_or_else(|| "Wren accepted the credential without naming an agent.".to_string())?;

  write_frame(conn, &control_frame("auth_ok", "connected"))
    .map_err(|e| format!("write failed: {e}"))?;

  // From here the relay is deliberately incurious: it forwards bytes and
  // attaches the agent id it verified, and never looks inside a frame again.
  while let Some(frame) = read_frame(&mut reader)? {
    if frame.trim().is_empty() {
      continue;
    }
    app
      .emit(
        EVENT_FRAME,
        FrameEvent {
          conn_id,
          agent_id: agent_id.clone(),
          frame,
        },
      )
      .map_err(|e| format!("could not reach the Wren window: {e}"))?;
  }
  Ok(())
}

// ---------------------------------------------------------------------------
// Listener
// ---------------------------------------------------------------------------

fn serve<R: Runtime>(app: AppHandle<R>, listener: LocalSocketListener) {
  for incoming in listener.incoming() {
    match incoming {
      Ok(stream) => {
        let app = app.clone();
        std::thread::spawn(move || handle_connection(app, stream));
      }
      Err(e) => {
        log::warn!("gateway: accept failed: {e}");
      }
    }
  }
}

/// Start the listener. Called once, from `setup`.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
  let (name, display) = resolve_name(app)?;
  let listener = ListenerOptions::new()
    .name(name)
    .try_overwrite(true)
    .create_sync()
    .map_err(|e| format!("failed to listen on {display}: {e}"))?;

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(&display, std::fs::Permissions::from_mode(0o600));
  }

  let state = app.state::<GatewayState>();
  if let Ok(mut path) = state.socket_path.lock() {
    *path = Some(display.clone());
  }

  let handle = app.clone();
  std::thread::spawn(move || serve(handle, listener));
  Ok(display)
}

fn resolve_name<R: Runtime>(app: &AppHandle<R>) -> Result<(Name<'static>, String), String> {
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let dir = app
      .path()
      .app_data_dir()
      .map_err(|e| format!("no app data directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    // The real enforcement on macOS, where the socket's own mode is ignored
    // by connect(). Best-effort: a pre-existing directory the user has
    // deliberately opened up is their call, not a reason to refuse to start.
    let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));

    let path = dir.join("gateway.sock");
    // A crash leaves the socket file behind and bind() would fail on it.
    let _ = std::fs::remove_file(&path);
    let display = path.display().to_string();
    let name = path
      .to_fs_name::<GenericFilePath>()
      .map_err(|e| format!("failed to build the socket name: {e}"))?;
    Ok((name, display))
  }
  #[cfg(windows)]
  {
    let _ = app;
    let name = PIPE_NAME
      .to_string()
      .to_ns_name::<GenericNamespaced>()
      .map_err(|e| format!("failed to build the pipe name: {e}"))?;
    Ok((name, format!("\\\\.\\pipe\\{PIPE_NAME}")))
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// The webview's verdict on a connection's auth frame.
#[tauri::command]
pub fn gateway_auth_result(
  state: tauri::State<'_, GatewayState>,
  conn_id: u64,
  accepted: bool,
  agent_id: Option<String>,
  message: Option<String>,
) -> Result<(), String> {
  let conn = {
    let conns = state.conns.lock().map_err(|_| "gateway state poisoned")?;
    conns.get(&conn_id).cloned()
  };
  let Some(conn) = conn else {
    // The connection went away while the webview was deciding. Not an error.
    return Ok(());
  };
  let sender = {
    let mut slot = conn.verdict.lock().map_err(|_| "gateway state poisoned")?;
    slot.take()
  };
  let Some(sender) = sender else {
    return Ok(());
  };
  sender
    .send(Verdict {
      accepted,
      agent_id,
      message,
    })
    .map_err(|_| "the connection stopped waiting for a verdict".to_string())
}

/// One frame from the webview back out to a connection.
#[tauri::command]
pub fn gateway_reply(
  state: tauri::State<'_, GatewayState>,
  conn_id: u64,
  frame: String,
) -> Result<(), String> {
  let conn = {
    let conns = state.conns.lock().map_err(|_| "gateway state poisoned")?;
    conns.get(&conn_id).cloned()
  };
  let Some(conn) = conn else {
    return Ok(());
  };
  write_frame(&conn, &frame).map_err(|e| format!("write failed: {e}"))
}

/// Stop serving a connection from this side.
///
/// It does not shut the file descriptor: the shim owns the connection's
/// lifetime, and a half-closed socket under a running agent is a worse failure
/// than a session that stops answering. Dropping the registry entry is enough
/// — no further frame can be written to it, and the reader thread finishes on
/// its own when the peer hangs up.
#[tauri::command]
pub fn gateway_close(state: tauri::State<'_, GatewayState>, conn_id: u64) -> Result<(), String> {
  let mut conns = state.conns.lock().map_err(|_| "gateway state poisoned")?;
  conns.remove(&conn_id);
  Ok(())
}

/// Where the shim connects, and what version is answering.
#[tauri::command]
pub fn gateway_info<R: Runtime>(
  app: AppHandle<R>,
  state: tauri::State<'_, GatewayState>,
) -> GatewayInfo {
  let socket_path = state.socket_path.lock().ok().and_then(|p| p.clone());
  GatewayInfo {
    running: socket_path.is_some(),
    socket_path,
    version: app.package_info().version.to_string(),
  }
}
