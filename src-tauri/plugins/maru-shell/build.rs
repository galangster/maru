const COMMANDS: &[&str] = &[
  "select_tab",
  "set_badge",
  "set_tab_bar_hidden",
  "impact",
  "notify",
  "selection",
  "watch_tabs",
];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .ios_path("ios")
    .build();
}
