use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::MaruAuthExt;

#[command]
pub(crate) async fn start_auth_session<R: Runtime>(
  app: AppHandle<R>,
  url: String,
  callback_scheme: String,
) -> Result<StartAuthSessionResponse> {
  app
    .maru_auth()
    .start_auth_session(StartAuthSessionRequest { url, callback_scheme })
    .await
}
