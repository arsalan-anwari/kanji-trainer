pub mod export;
pub mod packs;
mod reports;

use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Arc;

use tauri::{window::Color, Manager, RunEvent, Theme};

const LIGHT_BACKGROUND: Color = Color(0xf7, 0xf2, 0xe7, 0xff);
const DARK_BACKGROUND: Color = Color(0x16, 0x15, 0x0f, 0xff);

fn export_mode() -> Option<export::Export> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    match export::parse_args(&args).and_then(|mode| match mode {
        export::Mode::App => Ok(None),
        export::Mode::Help => {
            println!("{}", export::USAGE);
            std::process::exit(0);
        }
        export::Mode::Export(data) => export::resolve(&data, &cwd).map(Some),
    }) {
        Ok(export) => export,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let export = export_mode();
    let exporting = export.is_some();
    let mut context = tauri::generate_context!();
    if exporting {
        if let Some(window) = context.config_mut().app.windows.first_mut() {
            window.visible = false;
        }
    }
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_wayland_nvidia_quirk::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(export)
        .setup(|app| {
            if let Some(export) = app.state::<Option<export::Export>>().inner() {
                app.asset_protocol_scope()
                    .allow_directory(&export.packs, true)?;
            }
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
        .invoke_handler(tauri::generate_handler![
            reports::list_reports,
            reports::save_report,
            reports::delete_report,
            reports::write_report_file,
            reports::write_binary_file,
            reports::read_report_file,
            packs::list_packs,
            packs::fetch_catalog,
            packs::install_pack,
            packs::read_description,
            packs::delete_pack,
            export::export_request,
            export::export_write,
            export::export_finish
        ])
        .build(context)
        .expect("failed to start kanji trainer");
    if exporting {
        let code = Arc::new(AtomicI32::new(0));
        let requested = Arc::clone(&code);
        app.run_return(move |_, event| {
            if let RunEvent::ExitRequested {
                code: Some(asked), ..
            } = event
            {
                requested.store(asked, Ordering::Relaxed);
            }
        });
        std::process::exit(code.load(Ordering::Relaxed));
    }
    app.run(|_, _| {});
}
