# Maru push plugin

This in-tree Tauri plugin owns the iOS side of Maru's content-free push relay
(`docs/spec/MARU-ACCOUNT.md` §9). It registers for remote notifications,
hands the APNs device token to the web layer, delivers background pushes, and
posts the local notification Maru composes on the phone. It has no desktop
runtime surface.
