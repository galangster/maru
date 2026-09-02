const COMMANDS: &[&str] = &["start_auth_session"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .ios_path("ios")
    .build();
}
