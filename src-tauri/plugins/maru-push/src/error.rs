use serde::{ser::SerializeStruct, ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[cfg(target_os = "ios")]
  #[error(transparent)]
  PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
}

/// Serialized as `{ code, message }`, exactly as maru-auth does it, so a typed
/// rejection from Swift survives the bridge instead of flattening to text.
impl Serialize for Error {
  fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
  where
    S: Serializer,
  {
    let (code, message): (String, String) = match self {
      #[cfg(target_os = "ios")]
      Error::PluginInvoke(tauri::plugin::mobile::PluginInvokeError::InvokeRejected(response)) => (
        response.code.clone().unwrap_or_else(|| "failed".to_string()),
        response.message.clone().unwrap_or_else(|| "failed".to_string()),
      ),
      #[allow(unreachable_patterns)]
      other => ("failed".to_string(), other.to_string()),
    };
    let mut state = serializer.serialize_struct("Error", 2)?;
    state.serialize_field("code", &code)?;
    state.serialize_field("message", &message)?;
    state.end()
  }
}
