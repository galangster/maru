use tauri::{command, ipc::Channel, AppHandle, Runtime};

use crate::models::*;
use crate::MaruShellExt;
use crate::Result;

#[command]
pub(crate) async fn select_tab<R: Runtime>(app: AppHandle<R>, index: u32) -> Result<()> {
  app.maru_shell().select_tab(SelectTabRequest { index }).await
}

#[command]
pub(crate) async fn set_badge<R: Runtime>(
  app: AppHandle<R>,
  index: u32,
  value: Option<String>,
) -> Result<()> {
  app.maru_shell().set_badge(SetBadgeRequest { index, value }).await
}

#[command]
pub(crate) async fn set_tab_bar_hidden<R: Runtime>(app: AppHandle<R>, hidden: bool) -> Result<()> {
  app
    .maru_shell()
    .set_tab_bar_hidden(SetTabBarHiddenRequest { hidden })
    .await
}

#[command]
pub(crate) async fn impact<R: Runtime>(app: AppHandle<R>, style: String) -> Result<()> {
  app.maru_shell().impact(ImpactRequest { style }).await
}

#[command]
pub(crate) async fn notify<R: Runtime>(app: AppHandle<R>, kind: String) -> Result<()> {
  app.maru_shell().notify(NotifyRequest { kind }).await
}

#[command]
pub(crate) async fn prepare_haptics<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.maru_shell().prepare_haptics().await
}

#[command]
pub(crate) async fn watch_tabs<R: Runtime>(
  app: AppHandle<R>,
  channel: Channel<TabSelected>,
  tabs: Vec<TabDescriptor>,
) -> Result<()> {
  app
    .maru_shell()
    .watch_tabs(WatchTabsRequest { channel, tabs })
    .await
}

#[command]
pub(crate) async fn unwatch_tabs<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.maru_shell().unwatch_tabs().await
}
