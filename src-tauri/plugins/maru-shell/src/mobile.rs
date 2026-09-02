use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

tauri::ios_plugin_binding!(init_plugin_maru_shell);

// Initializes the Swift plugin class.
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<MaruShell<R>> {
  let handle = api.register_ios_plugin(init_plugin_maru_shell)?;
  Ok(MaruShell(handle))
}

/// Access to the maru-shell APIs.
pub struct MaruShell<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MaruShell<R> {
  pub async fn select_tab(&self, payload: SelectTabRequest) -> crate::Result<()> {
    self.call("selectTab", payload).await
  }

  pub async fn set_badge(&self, payload: SetBadgeRequest) -> crate::Result<()> {
    self.call("setBadge", payload).await
  }

  pub async fn set_tab_bar_hidden(&self, payload: SetTabBarHiddenRequest) -> crate::Result<()> {
    self.call("setTabBarHidden", payload).await
  }

  pub async fn impact(&self, payload: ImpactRequest) -> crate::Result<()> {
    self.call("impact", payload).await
  }

  pub async fn notify(&self, payload: NotifyRequest) -> crate::Result<()> {
    self.call("notify", payload).await
  }

  pub async fn selection(&self) -> crate::Result<()> {
    self.call("selection", ()).await
  }

  pub async fn watch_tabs(&self, payload: WatchTabsRequest) -> crate::Result<()> {
    self.call("watchTabs", payload).await
  }

  /// Every command resolves with nothing. Swift's `invoke.resolve()` sends a
  /// bare `null`, which deserializes into `()` and nothing else.
  async fn call(&self, command: &str, payload: impl serde::Serialize) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin_async::<()>(command, payload)
      .await
      .map_err(Into::into)
  }
}
