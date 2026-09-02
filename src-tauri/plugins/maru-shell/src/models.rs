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

/// What the Swift side pushes down the channel when a person taps a tab.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSelected {
  pub index: u32,
}

/// One item on the native bar. The order, the titles and the SF Symbols come
/// from `MOBILE_TABS` in `src/mobile/state.ts`; Swift writes no tab list of its
/// own, so the two cannot drift apart.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabDescriptor {
  pub title: String,
  pub symbol: String,
}

/// Subscribes to tab taps and, in the same call, says what the bar carries.
///
/// A channel rather than `addPluginListener`: a channel argument is registered
/// by Tauri the moment it is deserialized from the invoke payload, so it needs
/// no `register_listener` command and no second permission to reach the ACL.
/// It is typed, so the payload the plugin promises is checked here rather than
/// only where JS reads it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchTabsRequest {
  pub channel: Channel<TabSelected>,
  pub tabs: Vec<TabDescriptor>,
}
