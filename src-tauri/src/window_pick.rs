#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GlobalRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[cfg(target_os = "macos")]
mod mac {
    use swift_rs::{swift, SRString};
    swift!(pub(super) fn foreground_window_selection_json(
        monitor_x: i32,
        monitor_y: i32,
        monitor_width: u32,
        monitor_height: u32
    ) -> SRString);
}

impl GlobalRect {
    fn right(self) -> i32 {
        self.x.saturating_add(self.width as i32)
    }

    fn bottom(self) -> i32 {
        self.y.saturating_add(self.height as i32)
    }

    fn intersection(self, other: Self) -> Option<Self> {
        let x1 = self.x.max(other.x);
        let y1 = self.y.max(other.y);
        let x2 = self.right().min(other.right());
        let y2 = self.bottom().min(other.bottom());
        if x2 <= x1 || y2 <= y1 {
            return None;
        }
        Some(Self {
            x: x1,
            y: y1,
            width: (x2 - x1) as u32,
            height: (y2 - y1) as u32,
        })
    }

    fn relative_to(self, origin: Self) -> Self {
        Self {
            x: self.x - origin.x,
            y: self.y - origin.y,
            width: self.width,
            height: self.height,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowSelectionCandidate {
    pub global_rect: GlobalRect,
    pub monitor_relative_rect: GlobalRect,
    pub monitor_relative_activation_rect: GlobalRect,
}

pub fn auto_band_height(window_height: u32) -> u32 {
    ((window_height as f32 * 0.10).round() as u32).clamp(32, 120)
}

pub fn selection_candidate_from_window_rect(
    window_rect: GlobalRect,
    monitor_rect: GlobalRect,
) -> Option<WindowSelectionCandidate> {
    if window_rect.width < 2 || window_rect.height < 2 {
        return None;
    }
    let clipped = window_rect.intersection(monitor_rect)?;
    if clipped.width < 2 || clipped.height < 2 {
        return None;
    }
    let activation = activation_rect(window_rect).intersection(monitor_rect)?;
    if activation.width < 2 || activation.height < 2 {
        return None;
    }
    Some(WindowSelectionCandidate {
        global_rect: window_rect,
        monitor_relative_rect: clipped.relative_to(monitor_rect),
        monitor_relative_activation_rect: activation.relative_to(monitor_rect),
    })
}

fn activation_rect(window_rect: GlobalRect) -> GlobalRect {
    GlobalRect {
        x: window_rect.x,
        y: window_rect.y,
        width: window_rect.width,
        height: auto_band_height(window_rect.height).min(window_rect.height),
    }
}

#[cfg(windows)]
pub fn foreground_window_selection(monitor_rect: GlobalRect) -> Option<WindowSelectionCandidate> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetForegroundWindow, IsIconic, IsWindowVisible, GA_ROOT,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let root = GetAncestor(hwnd, GA_ROOT);
        if root.0.is_null() || !IsWindowVisible(root).as_bool() || IsIconic(root).as_bool() {
            return None;
        }
        let rect = extended_frame_bounds(root).or_else(|| window_rect(root))?;
        selection_candidate_from_window_rect(rect, monitor_rect)
    }
}

#[cfg(not(windows))]
#[cfg(not(target_os = "macos"))]
pub fn foreground_window_selection(_monitor_rect: GlobalRect) -> Option<WindowSelectionCandidate> {
    None
}

#[cfg(target_os = "macos")]
pub fn foreground_window_selection(monitor_rect: GlobalRect) -> Option<WindowSelectionCandidate> {
    let json = unsafe {
        mac::foreground_window_selection_json(
            monitor_rect.x,
            monitor_rect.y,
            monitor_rect.width,
            monitor_rect.height,
        )
    };
    let response: Option<MacWindowSelection> = serde_json::from_str(&json.to_string()).ok()?;
    response.map(|selection| WindowSelectionCandidate {
        global_rect: GlobalRect {
            x: monitor_rect.x + selection.selection.x as i32,
            y: monitor_rect.y + selection.selection.y as i32,
            width: selection.selection.width,
            height: selection.selection.height,
        },
        monitor_relative_rect: selection.selection.into(),
        monitor_relative_activation_rect: selection.activation.into(),
    })
}

#[cfg(target_os = "macos")]
#[derive(serde::Deserialize)]
struct MacWindowSelection {
    selection: MacRect,
    activation: MacRect,
}

#[cfg(target_os = "macos")]
#[derive(Clone, Copy, serde::Deserialize)]
struct MacRect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[cfg(target_os = "macos")]
impl From<MacRect> for GlobalRect {
    fn from(rect: MacRect) -> Self {
        Self {
            x: rect.x as i32,
            y: rect.y as i32,
            width: rect.width,
            height: rect.height,
        }
    }
}

#[cfg(windows)]
unsafe fn extended_frame_bounds(hwnd: windows::Win32::Foundation::HWND) -> Option<GlobalRect> {
    use std::mem::size_of;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};

    let mut rect = RECT::default();
    DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS,
        (&mut rect as *mut RECT).cast(),
        size_of::<RECT>() as u32,
    )
    .ok()?;
    rect_to_global(rect)
}

#[cfg(windows)]
unsafe fn window_rect(hwnd: windows::Win32::Foundation::HWND) -> Option<GlobalRect> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    let mut rect = RECT::default();
    GetWindowRect(hwnd, &mut rect).ok()?;
    rect_to_global(rect)
}

#[cfg(windows)]
fn rect_to_global(rect: windows::Win32::Foundation::RECT) -> Option<GlobalRect> {
    let width = rect.right.checked_sub(rect.left)?;
    let height = rect.bottom.checked_sub(rect.top)?;
    if width <= 1 || height <= 1 {
        return None;
    }
    Some(GlobalRect {
        x: rect.left,
        y: rect.top,
        width: width as u32,
        height: height as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_band_height_is_ten_percent_with_bounds() {
        assert_eq!(auto_band_height(200), 32);
        assert_eq!(auto_band_height(800), 80);
        assert_eq!(auto_band_height(3000), 120);
    }

    #[test]
    fn dynamic_candidate_contains_selection_and_activation_band() {
        let monitor = GlobalRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let window = GlobalRect {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
        };
        let candidate = selection_candidate_from_window_rect(window, monitor).unwrap();
        assert_eq!(
            candidate.monitor_relative_rect,
            GlobalRect {
                x: 100,
                y: 100,
                width: 800,
                height: 600
            }
        );
        assert_eq!(
            candidate.monitor_relative_activation_rect,
            GlobalRect {
                x: 100,
                y: 100,
                width: 800,
                height: 60
            }
        );
    }

    #[test]
    fn clips_partially_offscreen_window_to_monitor() {
        let monitor = GlobalRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let window = GlobalRect {
            x: -50,
            y: 20,
            width: 500,
            height: 300,
        };
        let candidate = selection_candidate_from_window_rect(window, monitor).unwrap();
        assert_eq!(
            candidate.monitor_relative_rect,
            GlobalRect {
                x: 0,
                y: 20,
                width: 450,
                height: 300
            }
        );
        assert_eq!(
            candidate.monitor_relative_activation_rect,
            GlobalRect {
                x: 0,
                y: 20,
                width: 450,
                height: 32
            }
        );
    }

    #[test]
    fn supports_negative_origin_secondary_monitor() {
        let monitor = GlobalRect {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let window = GlobalRect {
            x: -1800,
            y: 50,
            width: 900,
            height: 700,
        };
        let candidate = selection_candidate_from_window_rect(window, monitor).unwrap();
        assert_eq!(
            candidate.monitor_relative_rect,
            GlobalRect {
                x: 120,
                y: 50,
                width: 900,
                height: 700
            }
        );
    }
}
