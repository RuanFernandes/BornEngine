//! File watcher for resources that the native runtime loaded from disk.
//!
//! Handles are registered only after a successful initial load. Changes are
//! delivered on the engine thread after a short quiet period so editors that
//! truncate-and-rewrite or atomically replace a file do not expose a partial
//! save to the decoder.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;
#[cfg(not(feature = "web"))]
use std::time::Instant;
#[cfg(feature = "web")]
use web_time::Instant;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FileAssetKind {
    Texture,
    Sound,
    Music,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FileAssetChange {
    pub kind: FileAssetKind,
    pub handle: f64,
    pub path: PathBuf,
}

#[derive(Clone, Debug)]
struct WatchedAsset {
    kind: FileAssetKind,
    handle: f64,
}

#[derive(Clone, Debug)]
struct FileEvent {
    path: PathBuf,
    changed_at: Instant,
}

#[cfg(all(not(target_arch = "wasm32"), feature = "hot-reload"))]
type FileWatcher = notify::RecommendedWatcher;
#[cfg(any(target_arch = "wasm32", not(feature = "hot-reload")))]
type FileWatcher = ();

const DEBOUNCE_WINDOW: Duration = Duration::from_millis(120);

pub struct FileAssetHotReload {
    by_path: HashMap<PathBuf, Vec<WatchedAsset>>,
    pending: HashMap<PathBuf, Instant>,
    rx: Mutex<Receiver<FileEvent>>,
    #[cfg(test)]
    tx: Sender<FileEvent>,
    _watcher: Option<FileWatcher>,
    #[cfg(all(not(target_arch = "wasm32"), feature = "hot-reload"))]
    watched_dirs: Vec<PathBuf>,
}

impl Default for FileAssetHotReload {
    fn default() -> Self {
        Self::new()
    }
}

impl FileAssetHotReload {
    /// Start native file watching when the crate is built with `hot-reload`.
    /// Set `BLOOM_NO_HOT_RELOAD=1` to disable it for a running process. Web
    /// targets and builds without the feature retain a no-op implementation.
    pub fn new() -> Self {
        let enabled = std::env::var("BLOOM_NO_HOT_RELOAD")
            .map(|value| value != "1")
            .unwrap_or(true);
        Self::with_watcher(enabled)
    }

    fn with_watcher(enabled: bool) -> Self {
        let (tx, rx) = channel::<FileEvent>();
        let watcher = create_watcher(tx.clone(), enabled);
        Self {
            by_path: HashMap::new(),
            pending: HashMap::new(),
            rx: Mutex::new(rx),
            #[cfg(test)]
            tx,
            _watcher: watcher,
            #[cfg(all(not(target_arch = "wasm32"), feature = "hot-reload"))]
            watched_dirs: Vec::new(),
        }
    }

    /// Register a successfully loaded file-backed resource. Multiple handles
    /// may point at the same source file.
    pub fn register(&mut self, kind: FileAssetKind, handle: f64, path: PathBuf) {
        if handle == 0.0 || !handle.is_finite() {
            return;
        }
        let path = normalized_path(path);
        let assets = self.by_path.entry(path.clone()).or_default();
        if !assets
            .iter()
            .any(|entry| entry.kind == kind && entry.handle == handle)
        {
            assets.push(WatchedAsset { kind, handle });
        }
        self.ensure_dir_watched(&path);
    }

    /// Stop tracking a resource as soon as its owner releases the native
    /// handle. A different asset kind may legitimately share that handle.
    pub fn unregister(&mut self, kind: FileAssetKind, handle: f64) {
        self.by_path.retain(|_, assets| {
            assets.retain(|asset| asset.kind != kind || asset.handle != handle);
            !assets.is_empty()
        });
    }

    /// Return changes whose files have been quiet for the debounce window.
    /// Decoding and GPU/audio mutation happen on the engine thread.
    pub fn drain_pending(&mut self) -> Vec<FileAssetChange> {
        self.drain_pending_at(Instant::now())
    }

    fn drain_pending_at(&mut self, now: Instant) -> Vec<FileAssetChange> {
        if let Ok(rx) = self.rx.lock() {
            while let Ok(event) = rx.try_recv() {
                let path = normalized_path(event.path);
                let entry = self.pending.entry(path).or_insert(event.changed_at);
                if event.changed_at > *entry {
                    *entry = event.changed_at;
                }
            }
        }

        let ready_paths: Vec<PathBuf> = self
            .pending
            .iter()
            .filter(|&(_, changed_at)| {
                now.saturating_duration_since(*changed_at) >= DEBOUNCE_WINDOW
            })
            .map(|(path, _)| path.clone())
            .collect();

        let mut changes = Vec::new();
        for path in ready_paths {
            self.pending.remove(&path);
            if let Some(assets) = self.by_path.get(&path) {
                for asset in assets {
                    changes.push(FileAssetChange {
                        kind: asset.kind,
                        handle: asset.handle,
                        path: path.clone(),
                    });
                }
            }
        }
        changes
    }

    fn ensure_dir_watched(&mut self, path: &Path) {
        #[cfg(all(not(target_arch = "wasm32"), feature = "hot-reload"))]
        {
            use notify::{RecursiveMode, Watcher};
            let Some(dir) = path
                .parent()
                .and_then(|value| std::fs::canonicalize(value).ok())
            else {
                return;
            };
            if self.watched_dirs.contains(&dir) {
                return;
            }
            if let Some(watcher) = self._watcher.as_mut() {
                if let Err(error) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
                    eprintln!("[asset_hot_reload] failed to watch {dir:?}: {error:?}");
                    return;
                }
                self.watched_dirs.push(dir);
            }
        }
        #[cfg(any(target_arch = "wasm32", not(feature = "hot-reload")))]
        let _ = path;
    }

    #[cfg(test)]
    fn new_disabled_for_test() -> Self {
        Self::with_watcher(false)
    }

    #[cfg(test)]
    fn test_inject_event_at(&self, path: PathBuf, changed_at: Instant) {
        let _ = self.tx.send(FileEvent { path, changed_at });
    }

    #[cfg(test)]
    fn drain_ready_at(&mut self, now: Instant) -> Vec<FileAssetChange> {
        self.drain_pending_at(now)
    }
}

fn normalized_path(path: PathBuf) -> PathBuf {
    std::fs::canonicalize(&path).unwrap_or(path)
}

#[cfg(all(not(target_arch = "wasm32"), feature = "hot-reload"))]
fn create_watcher(tx: Sender<FileEvent>, enabled: bool) -> Option<FileWatcher> {
    if !enabled {
        return None;
    }
    use notify::{Event, EventKind};
    let callback = move |result: Result<Event, notify::Error>| {
        if let Ok(event) = result {
            if matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            ) {
                let changed_at = Instant::now();
                for path in event.paths {
                    let _ = tx.send(FileEvent { path, changed_at });
                }
            }
        }
    };
    match notify::recommended_watcher(callback) {
        Ok(watcher) => Some(watcher),
        Err(error) => {
            eprintln!("[asset_hot_reload] failed to start file watcher: {error:?}");
            None
        }
    }
}

#[cfg(any(target_arch = "wasm32", not(feature = "hot-reload")))]
fn create_watcher(_tx: Sender<FileEvent>, _enabled: bool) -> Option<FileWatcher> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn changed_file_returns_every_registered_handle_after_a_quiet_window() {
        let now = Instant::now();
        let mut reload = FileAssetHotReload::new_disabled_for_test();
        let path = PathBuf::from("/tmp/bornengine-hot-reload-texture.png");
        reload.register(FileAssetKind::Texture, 3.0, path.clone());
        reload.register(FileAssetKind::Texture, 9.0, path.clone());
        reload.test_inject_event_at(path.clone(), now);

        assert!(reload
            .drain_ready_at(now + Duration::from_millis(119))
            .is_empty());
        let changed = reload.drain_ready_at(now + Duration::from_millis(121));
        assert_eq!(changed.len(), 2);
        assert_eq!(changed[0].path, path);
        assert_eq!(changed[0].kind, FileAssetKind::Texture);
        assert_eq!(changed[0].handle, 3.0);
        assert_eq!(changed[1].handle, 9.0);
    }

    #[test]
    fn later_write_resets_the_debounce_without_losing_the_registered_handle() {
        let now = Instant::now();
        let mut reload = FileAssetHotReload::new_disabled_for_test();
        let path = PathBuf::from("/tmp/bornengine-hot-reload-sound.wav");
        reload.register(FileAssetKind::Sound, 6.0, path.clone());
        reload.test_inject_event_at(path.clone(), now);

        assert!(reload
            .drain_ready_at(now + Duration::from_millis(80))
            .is_empty());
        reload.test_inject_event_at(path.clone(), now + Duration::from_millis(80));
        assert!(reload
            .drain_ready_at(now + Duration::from_millis(150))
            .is_empty());
        let changed = reload.drain_ready_at(now + Duration::from_millis(201));
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].kind, FileAssetKind::Sound);
        assert_eq!(changed[0].handle, 6.0);
    }

    #[test]
    fn unregistered_asset_is_not_returned_for_a_pending_file_event() {
        let now = Instant::now();
        let mut reload = FileAssetHotReload::new_disabled_for_test();
        let path = PathBuf::from("/tmp/bornengine-hot-reload-music.ogg");
        reload.register(FileAssetKind::Music, 4.0, path.clone());
        reload.unregister(FileAssetKind::Music, 4.0);
        reload.test_inject_event_at(path, now);

        assert!(reload
            .drain_ready_at(now + Duration::from_millis(121))
            .is_empty());
    }

    #[cfg(all(not(target_arch = "wasm32"), feature = "hot-reload"))]
    #[test]
    #[ignore = "depends on the host filesystem delivering native notify events"]
    fn real_notify_reports_a_modified_registered_asset() {
        let mut path = std::env::temp_dir();
        path.push(format!("bornengine_asset_watch_{}.png", std::process::id()));
        std::fs::write(&path, b"initial").expect("write watched file");
        let path = std::fs::canonicalize(path).expect("canonicalize watched file");
        let mut reload = FileAssetHotReload::with_watcher(true);
        reload.register(FileAssetKind::Texture, 7.0, path.clone());

        std::thread::sleep(Duration::from_millis(200));
        std::fs::write(&path, b"changed").expect("modify watched file");
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut changes = Vec::new();
        while Instant::now() < deadline {
            changes = reload.drain_pending();
            if !changes.is_empty() {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = std::fs::remove_file(path);
        assert!(changes.iter().any(|asset| asset.handle == 7.0));
    }
}
