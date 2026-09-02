use tauri::{command, ipc::Channel, AppHandle, Runtime};

use crate::models::*;
use crate::MaruPushExt;
use crate::Result;

#[command]
pub(crate) async fn start<R: Runtime>(
  app: AppHandle<R>,
  on_event: Channel<serde_json::Value>,
) -> Result<PushStatus> {
  app.maru_push().start(StartRequest { on_event }).await
}

#[command]
pub(crate) async fn permission_state<R: Runtime>(app: AppHandle<R>) -> Result<PushStatus> {
  app.maru_push().permission_state().await
}

#[command]
pub(crate) async fn request_permission<R: Runtime>(app: AppHandle<R>) -> Result<PushStatus> {
  app.maru_push().request_permission().await
}

#[command]
pub(crate) async fn token<R: Runtime>(app: AppHandle<R>) -> Result<PushStatus> {
  app.maru_push().token().await
}

#[command]
pub(crate) async fn set_badge_count<R: Runtime>(app: AppHandle<R>, count: i64) -> Result<PushOk> {
  app.maru_push().set_badge_count(BadgeRequest { count }).await
}

#[command]
pub(crate) async fn schedule_local_notification<R: Runtime>(
  app: AppHandle<R>,
  title: String,
  body: String,
  thread_id: Option<String>,
) -> Result<PushOk> {
  app
    .maru_push()
    .schedule_local_notification(LocalNotificationRequest { title, body, thread_id })
    .await
}

#[command]
pub(crate) async fn complete_push<R: Runtime>(
  app: AppHandle<R>,
  id: String,
  new_data: bool,
) -> Result<PushOk> {
  app
    .maru_push()
    .complete_push(CompletePushRequest { id, new_data })
    .await
}
