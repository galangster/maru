use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

tauri::ios_plugin_binding!(init_plugin_maru_push);

// Initializes the Swift plugin class.
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<MaruPush<R>> {
  let handle = api.register_ios_plugin(init_plugin_maru_push)?;
  Ok(MaruPush(handle))
}

/// Access to the maru-push APIs.
pub struct MaruPush<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MaruPush<R> {
  pub async fn start(&self, payload: StartRequest) -> crate::Result<PushStatus> {
    self
      .0
      .run_mobile_plugin_async("start", payload)
      .await
      .map_err(Into::into)
  }

  pub async fn permission_state(&self) -> crate::Result<PushStatus> {
    self
      .0
      .run_mobile_plugin_async("permissionState", ())
      .await
      .map_err(Into::into)
  }

  pub async fn request_permission(&self) -> crate::Result<PushStatus> {
    self
      .0
      .run_mobile_plugin_async("requestPermission", ())
      .await
      .map_err(Into::into)
  }

  pub async fn set_badge_count(&self, payload: BadgeRequest) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin_async("setBadgeCount", payload)
      .await
      .map_err(Into::into)
  }

  pub async fn schedule_local_notification(
    &self,
    payload: LocalNotificationRequest,
  ) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin_async("scheduleLocalNotification", payload)
      .await
      .map_err(Into::into)
  }

  pub async fn complete_push(&self, payload: CompletePushRequest) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin_async("completePush", payload)
      .await
      .map_err(Into::into)
  }
}
