mod panels;
mod pointer;
mod tray;

use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_fs::FsExt;

/// Files the system asked this app to open, waiting for the window to be ready
/// to take them.
///
/// A double click in the file manager can reach the app before the interface
/// has finished loading, so the paths are held here until it comes asking.
#[derive(Default)]
struct Opened(Mutex<Vec<String>>);

/// Hands over the paths waiting to be opened, and empties the queue.
#[tauri::command]
fn take_opened_paths(state: tauri::State<'_, Opened>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut held| std::mem::take(&mut *held))
        .unwrap_or_default()
}

/// Queues paths and tells the interface, which may or may not be listening yet.
fn queue_opened(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<Opened>() {
        if let Ok(mut held) = state.0.lock() {
            held.extend(paths.iter().cloned());
        }
    }
    let _ = app.emit("files-opened", paths);
}

/// The paths in the command line, which is how Windows and Linux pass a file
/// that was double clicked. A flag, or a name that is not a file, is not one.
fn paths_from_arguments() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|argument| !argument.starts_with('-'))
        .filter(|argument| std::path::Path::new(argument).is_file())
        .collect()
}

/// Opens the scope of the filesystem plugin to a folder the person just picked
/// in the system dialog. Nothing outside a folder they chose is reachable.
#[tauri::command]
fn allow_base(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())
}

/// Sends a path to the system trash. Nothing in this app deletes for good.
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|error| error.to_string())
}

/// Opens the system file manager with the entry selected.
///
/// Each system has its own way of saying "show me this one", and none of them
/// is just opening the folder: the point is that the file comes back selected.
#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-R").arg(&path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(format!("/select,{}", path));
        command
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|folder| folder.to_path_buf())
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        let mut command = Command::new("xdg-open");
        command.arg(parent);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Hands a file to whatever the system opens that kind of file with.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let program = "xdg-open";

    Command::new(program)
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Closing the app's own window puts it away instead of ending the app.
///
/// The notes on the edge of the screen are the point: they are supposed to
/// still be there after the editor is out of the way, the same way a sticky
/// note on a monitor does not depend on the drawer being open. The tray is
/// what brings the window back, and the tray is also the only thing that
/// really quits, along with the system's own Quit.
fn hide_instead_of_closing(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window(panels::MAIN) else {
        return;
    };
    let hidden = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hidden.hide();
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(Opened::default())
        .manage(panels::Scale::default())
        .manage(pointer::Watch::default())
        .invoke_handler(tauri::generate_handler![
            allow_base,
            move_to_trash,
            reveal_in_file_manager,
            open_path,
            take_opened_paths,
            panels::work_area,
            panels::panel_place,
            panels::panel_prepare,
            panels::cursor_at,
            pointer::watch_chips,
            panels::panel_hide,
            panels::panel_is_open,
            panels::show_main,
            panels::quit_app
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // The updater only exists on the desktop, and the interface is
            // what decides when to look: see `src/app/updates.ts`.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            tray::install(app.handle())?;
            hide_instead_of_closing(app.handle());
            queue_opened(app.handle(), paths_from_arguments());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_handle, _event| {
        // macOS does not pass the file on the command line: it sends it to the
        // running app, which is also how a second double click reaches the
        // window that is already open.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { ref urls } = _event {
            let paths = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            queue_opened(_handle, paths);
        }

        // Clicking the icon in the Dock on a Mac, which is where somebody who
        // put the window away with the red button goes looking for it first.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            let _ = panels::show_main(_handle.clone());
        }
    });
}
