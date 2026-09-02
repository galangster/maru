use serde::{Deserialize, Serialize};

/// Opens the event stream. The Swift side keeps the channel for the life of
/// the process and pushes `pushToken`, `pushReceived` and `notificationOpened`
/// down it, so an APNs wake that arrives before the webview is ready is
/// buffered rather than lost.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
  pub on_event: tauri::ipc::Channel<serde_json::Value>,
}

/// `granted` · `denied` · `prompt` — the three states the row in Settings can
/// draw. `prompt` means the system alert has not been shown yet.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushStatus {
  pub permission: String,
  /// Lowercase hex. `None` until APNs answers the registration.
  pub token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BadgeRequest {
  pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNotificationRequest {
  pub title: String,
  pub body: String,
  /// Maru's own thread key. It rides in the notification's userInfo and comes
  /// back as `notificationOpened` when the person taps it.
  pub thread_id: Option<String>,
}

/// Resolves the `fetchCompletionHandler` iOS handed us for one background push.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletePushRequest {
  pub id: String,
  /// True when the sync that ran actually brought mail in.
  pub new_data: bool,
}
