//! The windows that are not the app: the dock on the edge of the screen and
//! the note that floats beside it.
//!
//! Both are the same web app under another label. Nothing here knows what a
//! note is; this file only opens windows, puts them where the interface asks,
//! and takes them away again. Where they go is decided in
//! `src/app/dock-layout.ts`, which is arithmetic and can be tested without a
//! screen around it.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

/// The scale of the screen the panels are on, as last reported.
///
/// Asking the system which monitor a window is on is a hop to the main thread,
/// and placing a panel would otherwise pay for it twice: once to work out
/// where to go, and once to convert the answer. The interface asks for the
/// work area whenever it might have changed, and that same answer is kept
/// here for the placements that follow.
#[derive(Default)]
pub struct Scale(Mutex<Option<f64>>);

pub const MAIN: &str = "main";
pub const DOCK: &str = "dock";
pub const PEEK: &str = "peek";

/// The usable part of a screen, in the CSS pixels of that screen.
///
/// The work area is what is left after the system's own furniture: the menu
/// bar and the Dock on a Mac, the taskbar on Windows, the panel on Linux. A
/// panel placed over any of those is a panel nobody can reach.
#[derive(Serialize)]
pub struct WorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
}

/// The screen the app itself is on, so the dock lands on the monitor the
/// person is working on and not always on the first one.
#[tauri::command]
pub fn work_area(app: tauri::AppHandle) -> Result<WorkArea, String> {
    let anchor = app
        .get_webview_window(MAIN)
        .or_else(|| app.get_webview_window(DOCK))
        .ok_or_else(|| "Nenhuma janela para perguntar em qual tela estamos.".to_string())?;

    let monitor = anchor
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| anchor.primary_monitor().ok().flatten())
        .ok_or_else(|| "O sistema não informou nenhuma tela.".to_string())?;

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    if let Some(cached) = app.try_state::<Scale>() {
        if let Ok(mut held) = cached.0.lock() {
            *held = Some(scale);
        }
    }

    Ok(WorkArea {
        x: f64::from(area.position.x) / scale,
        y: f64::from(area.position.y) / scale,
        width: f64::from(area.size.width) / scale,
        height: f64::from(area.size.height) / scale,
        scale,
    })
}

/// Opens a panel if it is not open yet, puts it where it was asked to go, and
/// shows it.
///
/// Position and size arrive in the same pixels `work_area` reported, and are
/// turned back into the screen's own pixels here. Going through the scale in
/// both directions is what keeps a panel exactly on the edge of a screen whose
/// scale is not 1, which is every Mac and most laptops.
#[tauri::command]
pub async fn panel_place(
    app: tauri::AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    focus: bool,
) -> Result<(), String> {
    let scale = app
        .try_state::<Scale>()
        .and_then(|cached| cached.0.lock().ok().and_then(|held| *held))
        .map_or_else(|| work_area(app.clone()).map(|area| area.scale), Ok)?;
    let window = match app.get_webview_window(&label) {
        Some(open) => open,
        None => build(&app, &label)?,
    };

    let size = PhysicalSize::new(
        (width * scale).round().max(1.0) as u32,
        (height * scale).round().max(1.0) as u32,
    );
    let position = PhysicalPosition::new((x * scale).round() as i32, (y * scale).round() as i32);

    // Size first, then position: growing a window that is already against the
    // right edge of the screen is what moves it, and the position we were
    // given already accounts for the new size.
    window.set_size(size).map_err(stringify)?;
    window.set_position(position).map_err(stringify)?;
    window.show().map_err(stringify)?;
    // Being on top is set again on every placement because a window that was
    // hidden and shown again can come back behind whatever took the screen in
    // the meantime.
    window.set_always_on_top(true).map_err(stringify)?;
    if focus {
        window.set_focus().map_err(stringify)?;
    }
    Ok(())
}

/// Where the pointer is, in the same pixels `work_area` reports.
///
/// The panels have to know when the pointer has left them, and they cannot be
/// asked. A window that is always on top but was never clicked is not the
/// active window, and a webview in one does not reliably get told that the
/// pointer went away: on the way from the list to the note the pointer crosses
/// two windows that neither of them owns. So the app's window asks the system
/// directly, which is the one answer that does not depend on who has focus.
#[tauri::command]
pub fn cursor_at(app: tauri::AppHandle) -> Result<(f64, f64), String> {
    let scale = app
        .try_state::<Scale>()
        .and_then(|cached| cached.0.lock().ok().and_then(|held| *held))
        .map_or_else(|| work_area(app.clone()).map(|area| area.scale), Ok)?;
    let at = app.cursor_position().map_err(stringify)?;
    Ok((at.x / scale, at.y / scale))
}

/// Builds a panel without showing it.
///
/// A window that does not exist yet has a whole web app to load before it can
/// draw anything, and the note that floats out on hover has about a fifth of a
/// second to appear. So it is built off screen, in advance, and the first
/// hover only has to move it and show it.
#[tauri::command]
pub async fn panel_prepare(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if app.get_webview_window(&label).is_none() {
        build(&app, &label)?;
    }
    Ok(())
}

/// Takes a panel off the screen without destroying it, so that showing it
/// again costs nothing and the text inside it is still there.
#[tauri::command]
pub fn panel_hide(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.hide().map_err(stringify)?;
    }
    Ok(())
}

/// Whether a panel exists at all, which is not the same as being on screen.
#[tauri::command]
pub fn panel_is_open(app: tauri::AppHandle, label: String) -> bool {
    app.get_webview_window(&label)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

/// Brings the app itself back: out of the tray, out of a minimised state, and
/// in front of whatever was covering it.
#[tauri::command]
pub fn show_main(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN)
        .ok_or_else(|| "A janela do app não existe mais.".to_string())?;
    window.unminimize().map_err(stringify)?;
    window.show().map_err(stringify)?;
    window.set_focus().map_err(stringify)?;
    Ok(())
}

/// Closes the app for good, panels and all. The only way out other than the
/// system's own Quit, and the one the tray offers.
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn build(app: &tauri::AppHandle, label: &str) -> Result<WebviewWindow, String> {
    let peek = label == PEEK;

    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(if peek { "Nota" } else { "Notas fixadas" })
        // No title bar, because a panel the width of a scrollbar has nowhere
        // to put one. The interface draws what little furniture it needs.
        .decorations(false)
        // No background of its own: the squares and the card draw themselves,
        // rounded corners and shadow included, and the desktop shows between
        // them.
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        // It follows the person between desktops instead of staying behind on
        // the one it was opened in.
        .visible_on_all_workspaces(true)
        // A panel is not a window somebody alt-tabs to.
        .skip_taskbar(true)
        .resizable(peek)
        .minimizable(false)
        .maximizable(false)
        // The first click acts on what it landed on instead of being spent
        // bringing the window forward, which is the whole point of a panel
        // you only ever touch in passing.
        .accept_first_mouse(true)
        // Shown by `panel_place`, once it is the right size and in the right
        // place: a panel that appears in the middle of the screen and then
        // jumps to the edge is a flicker nobody asked for.
        .visible(false)
        .focused(false)
        .inner_size(320.0, 420.0)
        .build()
        .map_err(stringify)
}

fn stringify(error: tauri::Error) -> String {
    error.to_string()
}
