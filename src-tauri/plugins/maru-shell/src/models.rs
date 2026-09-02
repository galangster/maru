use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

/// Which tab, by position in the `UITabBarController`: Inbox, Search, Settings.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectTabRequest {
  pub index: u32,
}

/// `value: None` clears the badge. A string, not a number, so the web layer
/// owns the "99+" rollover and the native side never has to know the cap.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBadgeRequest {
  pub index: u32,
  pub value: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTabBarHiddenRequest {
  pub hidden: bool,
}

/// `light` · `medium` · `heavy` · `soft` · `rigid`, mapped to
/// `UIImpactFeedbackGenerator.FeedbackStyle` on the Swift side.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactRequest {
  pub style: String,
}

/// `success` · `warning` · `error`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyRequest {
  pub kind: String,
}

/// The channel the Swift side pushes `{ index }` down when a person taps a tab.
///
/// A channel rather than `addPluginListener`: a channel argument is registered
/// by Tauri the moment it is deserialized from the invoke payload, so it needs
/// no `register_listener` command and no second permission to reach the ACL.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchTabsRequest {
  pub channel: Channel<serde_json::Value>,
}
