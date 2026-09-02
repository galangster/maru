//! iOS-only push plugin: APNs registration, background push delivery, and the
//! local notification Maru composes on the phone.
//!
//! The relay sends a content-free `content-available: 1` push
//! (`docs/spec/MARU-ACCOUNT.md` §9). Everything a person reads on the lock
//! screen is built here, from mail this device fetched itself.

use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};
#[cfg(target_os = "ios")]
use tauri::Manager;

pub use models::*;

#[cfg(target_os = "ios")]
mod mobile;

#[cfg(target_os = "ios")]
mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(target_os = "ios")]
use mobile::MaruPush;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the maru-push APIs.
#[cfg(target_os = "ios")]
pub trait MaruPushExt<R: Runtime> {
  fn maru_push(&self) -> &MaruPush<R>;
}

#[cfg(target_os = "ios")]
impl<R: Runtime, T: Manager<R>> crate::MaruPushExt<R> for T {
  fn maru_push(&self) -> &MaruPush<R> {
    self.state::<MaruPush<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  let builder = Builder::new("maru-push");
  #[cfg(target_os = "ios")]
  let builder = builder.invoke_handler(tauri::generate_handler![
    commands::start,
    commands::permission_state,
    commands::request_permission,
    commands::set_badge_count,
    commands::schedule_local_notification,
    commands::complete_push
  ]);
  builder
    .setup(|app, api| {
      #[cfg(target_os = "ios")]
      app.manage(mobile::init(app, api)?);
      #[cfg(not(target_os = "ios"))]
      let _ = (app, api);
      Ok(())
    })
    .build()
}
