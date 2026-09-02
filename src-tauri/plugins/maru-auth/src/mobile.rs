use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_maru_auth);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<MaruAuth<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("", "ExamplePlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_maru_auth)?;
  Ok(MaruAuth(handle))
}

/// Access to the maru-auth APIs.
pub struct MaruAuth<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MaruAuth<R> {
  pub async fn start_auth_session(
    &self,
    payload: StartAuthSessionRequest,
  ) -> crate::Result<StartAuthSessionResponse> {
    self
      .0
      .run_mobile_plugin_async("startAuthSession", payload)
      .await
      .map_err(Into::into)
  }
}
