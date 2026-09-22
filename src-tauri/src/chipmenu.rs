//! The menu the right button opens on a tab.
//!
//! It is the system's own menu and not one drawn in the window, because the
//! window is thirty pixels wide. Anything the interface draws past its own
//! edge is cut off by the system, so a menu of three lines has nowhere to go.
//! The system draws its menus over everything, including over the edge of the
//! window they were asked for.

use tauri::{
    menu::{ContextMenu, Menu, MenuItem, PredefinedMenuItem},
    Emitter, Manager,
};

use crate::panels;

/// Carries which item was chosen. Which note it was about is the interface's
/// business: it asked for the menu and it remembers what it asked about.
pub const CHOSE_EVENT: &str = "chip:chose";

/// Opens the menu at the pointer, over the column of tabs.
///
/// Saving and closing are only offered when there is an open note to save or
/// close. Taking a note off the edge of the screen is always offered, because
/// the tab itself is too small to hold that anywhere else.
#[tauri::command]
pub async fn chip_menu(app: tauri::AppHandle, open: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(panels::DOCK)
        .ok_or_else(|| "A coluna não está aberta.".to_string())?;

    let save = MenuItem::with_id(&app, "chip:save", "Salvar nota", open, None::<&str>)
        .map_err(stringify)?;
    let close = MenuItem::with_id(&app, "chip:close", "Fechar nota", open, None::<&str>)
        .map_err(stringify)?;
    let unpin = MenuItem::with_id(&app, "chip:unpin", "Desafixar nota", true, None::<&str>)
        .map_err(stringify)?;
    let line = PredefinedMenuItem::separator(&app).map_err(stringify)?;

    let menu = Menu::with_items(&app, &[&save, &close, &line, &unpin]).map_err(stringify)?;
    menu.popup(window.as_ref().window()).map_err(stringify)
}

/// Passes the choice to the interface, which is where the notes are.
pub fn on_chosen(app: &tauri::AppHandle, id: &str) {
    if id.starts_with("chip:") {
        let _ = app.emit(CHOSE_EVENT, id);
    }
}

fn stringify(error: tauri::Error) -> String {
    error.to_string()
}
