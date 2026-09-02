use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<MaruAuth<R>> {
  Ok(MaruAuth(app.clone()))
}

/// Access to the maru-auth APIs.
pub struct MaruAuth<R: Runtime>(AppHandle<R>);

impl<R: Runtime> MaruAuth<R> {
  pub async fn start_auth_session(
    &self,
    _payload: StartAuthSessionRequest,
  ) -> crate::Result<StartAuthSessionResponse> {
    Err(crate::Error::Unsupported)
  }
}
