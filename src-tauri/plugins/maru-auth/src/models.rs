use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAuthSessionRequest {
  pub url: String,
  pub callback_scheme: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAuthSessionResponse {
  pub callback_url: String,
}
