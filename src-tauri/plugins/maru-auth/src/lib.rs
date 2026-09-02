//! iOS-only native authentication-session plugin.

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
use mobile::MaruAuth;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the maru-auth APIs.
#[cfg(target_os = "ios")]
pub trait MaruAuthExt<R: Runtime> {
  fn maru_auth(&self) -> &MaruAuth<R>;
}

#[cfg(target_os = "ios")]
impl<R: Runtime, T: Manager<R>> crate::MaruAuthExt<R> for T {
  fn maru_auth(&self) -> &MaruAuth<R> {
    self.state::<MaruAuth<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  let builder = Builder::new("maru-auth");
  #[cfg(target_os = "ios")]
  let builder = builder.invoke_handler(tauri::generate_handler![commands::start_auth_session]);
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
