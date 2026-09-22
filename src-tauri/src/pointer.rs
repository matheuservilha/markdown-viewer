//! Watching the pointer from outside the web layer.
//!
//! The tabs on the edge of the screen cannot notice the pointer themselves.
//! On macOS a window only receives mouse-moved events while its application
//! is the active one, and this one is on top of everybody else's work
//! precisely so that it does not have to be active. The moment somebody
//! clicks another app, the tabs stop hearing about the pointer and never hear
//! about it again.
//!
//! So the pointer is watched here instead: a thread asks the system where it
//! is, decides which tab it is over, and says so only when the answer changes.
//! The interface hands over the rectangles, because where the tabs are is its
//! business, not this file's.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tauri::{Emitter, Manager};

use crate::panels;

/// How often the pointer is looked up. Fast enough that arriving at the edge
/// of the screen feels answered, slow enough to be nothing on a CPU.
const EVERY: Duration = Duration::from_millis(45);

/// The event the interface listens for. Its payload is the index of the tab
/// the pointer is over, or -1 for none.
pub const CHIP_EVENT: &str = "pointer:chip";

#[derive(Deserialize, Clone, Copy)]
pub struct ChipRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl ChipRect {
    fn holds(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.width && y >= self.y && y <= self.y + self.height
    }
}

/// Which watch is the current one.
///
/// Every call to `watch_chips` bumps it, and a thread whose number is no
/// longer the current one stops. That is how a watch is replaced without
/// anything having to be told to stop first: the tabs move on every note
/// added, and each move starts a new watch.
#[derive(Default)]
pub struct Watch(Arc<AtomicU64>);

/// Starts watching the pointer against these rectangles, in the same pixels
/// `work_area` reports. An empty list stops the watching altogether.
#[tauri::command]
pub fn watch_chips(app: tauri::AppHandle, rects: Vec<ChipRect>) {
    let Some(watch) = app.try_state::<Watch>() else {
        return;
    };
    let generation = watch.0.clone();
    let mine = generation.fetch_add(1, Ordering::SeqCst) + 1;

    if rects.is_empty() {
        let _ = app.emit(CHIP_EVENT, -1_i64);
        return;
    }

    std::thread::spawn(move || {
        let mut last: i64 = -1;
        loop {
            if generation.load(Ordering::SeqCst) != mine {
                // Somebody else is watching now.
                return;
            }

            let over = panels::cursor_at(app.clone())
                .ok()
                .map(|(x, y)| {
                    rects
                        .iter()
                        .position(|rect| rect.holds(x, y))
                        .map_or(-1, |index| index as i64)
                })
                .unwrap_or(-1);

            if over != last {
                last = over;
                let _ = app.emit(CHIP_EVENT, over);
            }

            std::thread::sleep(EVERY);
        }
    });
}
