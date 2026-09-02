const COMMANDS: &[&str] = &[
  "start",
  "permission_state",
  "request_permission",
  "token",
  "set_badge_count",
  "schedule_local_notification",
  "complete_push",
];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .ios_path("ios")
    .build();
}
