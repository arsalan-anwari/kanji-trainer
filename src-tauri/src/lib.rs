use tauri::{window::Color, Manager, Theme};

const LIGHT_BACKGROUND: Color = Color(0xf7, 0xf2, 0xe7, 0xff);
const DARK_BACKGROUND: Color = Color(0x16, 0x15, 0x0f, 0xff);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_wayland_nvidia_quirk::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let dark = matches!(window.theme(), Ok(Theme::Dark));
                let background = if dark {
                    DARK_BACKGROUND
                } else {
                    LIGHT_BACKGROUND
                };
                let _ = window.set_background_color(Some(background));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start kanji trainer");
}
