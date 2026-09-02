//! iOS-only native shell: the system tab bar around the web content, and the
//! system haptic generators.
//!
//! Nothing here has a desktop half. On every other platform `init()` returns a
//! plugin with no commands, so a desktop build links none of it and a stray
//! call from the web layer simply fails the ACL.

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
use mobile::MaruShell;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the maru-shell APIs.
#[cfg(target_os = "ios")]
pub trait MaruShellExt<R: Runtime> {
  fn maru_shell(&self) -> &MaruShell<R>;
}

#[cfg(target_os = "ios")]
impl<R: Runtime, T: Manager<R>> crate::MaruShellExt<R> for T {
  fn maru_shell(&self) -> &MaruShell<R> {
    self.state::<MaruShell<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  let builder = Builder::new("maru-shell");
  #[cfg(target_os = "ios")]
  let builder = builder.invoke_handler(tauri::generate_handler![
    commands::select_tab,
    commands::set_badge,
    commands::set_tab_bar_hidden,
    commands::impact,
    commands::notify,
    commands::selection,
    commands::watch_tabs,
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
