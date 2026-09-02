use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::MaruAuth;
#[cfg(mobile)]
use mobile::MaruAuth;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the maru-auth APIs.
pub trait MaruAuthExt<R: Runtime> {
  fn maru_auth(&self) -> &MaruAuth<R>;
}

impl<R: Runtime, T: Manager<R>> crate::MaruAuthExt<R> for T {
  fn maru_auth(&self) -> &MaruAuth<R> {
    self.state::<MaruAuth<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("maru-auth")
    .invoke_handler(tauri::generate_handler![commands::start_auth_session])
    .setup(|app, api| {
      #[cfg(mobile)]
      let maru_auth = mobile::init(app, api)?;
      #[cfg(desktop)]
      let maru_auth = desktop::init(app, api)?;
      app.manage(maru_auth);
      Ok(())
    })
    .build()
}
