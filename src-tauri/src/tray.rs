//! The icon beside the clock.
//!
//! Closing the app's window no longer closes the app, because the notes on the
//! edge of the screen are supposed to outlive it. Something has to be left to
//! bring the window back and to really quit, and on all three systems that
//! something is the tray.

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
};

use crate::panels;

pub const NEW_NOTE_EVENT: &str = "tray:new-note";

pub fn install(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir o markdown-viewer", true, None::<&str>)?;
    let note = MenuItem::with_id(app, "note", "Nova nota", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &note, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("o ícone do app, para a bandeja".to_string())
        })?)
        .tooltip("markdown-viewer")
        .menu(&menu)
        // On Windows and Linux the menu belongs to the right button and the
        // left one opens the app, which is what every app there does. A Mac
        // has no such convention: the menu answers either button.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(on_menu)
        .on_tray_icon_event(on_click)
        .build(app)?;

    Ok(())
}

fn on_menu(app: &tauri::AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "open" => {
            let _ = panels::show_main(app.clone());
        }
        "note" => {
            // The window has to be there to answer, and it may have been
            // closed to the tray a week ago.
            let _ = panels::show_main(app.clone());
            let _ = app.emit(NEW_NOTE_EVENT, ());
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn on_click(tray: &tauri::tray::TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        if !cfg!(target_os = "macos") {
            let _ = panels::show_main(tray.app_handle().clone());
        }
    }
}
