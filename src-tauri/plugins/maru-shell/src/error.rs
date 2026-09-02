use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

/// Every maru-shell command resolves; the Swift side never rejects one, because
/// a tab selection or a haptic the web layer cannot act on is not worth an
/// error path. So this only carries the bridge's own failures, and serializes
/// as a plain string rather than the `{ code, message }` shape maru-auth needs
/// for its typed `cancelled`.
#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[cfg(target_os = "ios")]
  #[error(transparent)]
  PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
}

impl Serialize for Error {
  fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
  where
    S: Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}
