// Armin Terminal desktop shell (Windows, macOS, Linux).
// Loads the built web app from dist/ and gives it a native window. There is no
// menu bar: F1-F12 belong to the terminal's market sector keys, so window
// commands use Ctrl+Shift shortcuts instead.
const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const windows = new Map();

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

function saveState(id, win) {
  if (win.isDestroyed()) return;
  const all = loadState();
  all[id] = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
  try {
    fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
    fs.writeFileSync(STATE_FILE(), JSON.stringify(all));
  } catch {
    /* not fatal */
  }
}

/** Keeps a saved window on a connected display. */
function visible(bounds) {
  if (!bounds) return undefined;
  const area = screen.getDisplayMatching(bounds).workArea;
  const overlaps = bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
  return overlaps ? bounds : undefined;
}

function nextId() {
  let id = 1;
  while (windows.has(id)) id++;
  return id;
}

function createWindow(id = nextId()) {
  const saved = loadState()[id] ?? {};
  const bounds = visible(saved.bounds);
  const win = new BrowserWindow({
    width: bounds?.width ?? 1600,
    height: bounds?.height ?? 1000,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#000000',
    title: 'Armin Terminal',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  windows.set(id, win);
  win.setMenu(null);
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  const index = path.join(__dirname, '..', 'dist', 'index.html');
  win.loadFile(index, id > 1 ? { query: { w: String(id) } } : undefined);

  // Links to news sources and data providers open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (ctrl && input.shift && key === 'n') {
      e.preventDefault();
      createWindow();
    } else if (ctrl && input.shift && key === 'i') {
      e.preventDefault();
      win.webContents.toggleDevTools();
    } else if (ctrl && input.shift && key === 'f') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    } else if (ctrl && input.shift && key === 'r') {
      e.preventDefault();
      win.webContents.reloadIgnoringCache();
    } else if (ctrl && (key === '=' || key === '+')) {
      e.preventDefault();
      win.webContents.setZoomLevel(Math.min(4, win.webContents.getZoomLevel() + 0.5));
    } else if (ctrl && key === '-') {
      e.preventDefault();
      win.webContents.setZoomLevel(Math.max(-3, win.webContents.getZoomLevel() - 0.5));
    } else if (ctrl && key === '0') {
      e.preventDefault();
      win.webContents.setZoomLevel(0);
    } else if (ctrl && key === 'w') {
      e.preventDefault();
      win.close();
    }
  });

  let saveTimer = null;
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(id, win), 400);
  };
  win.on('resize', queueSave);
  win.on('move', queueSave);
  win.on('close', () => saveState(id, win));
  win.on('closed', () => windows.delete(id));
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Launching the app again opens another terminal window.
  app.on('second-instance', () => createWindow());
  app.whenReady().then(() => {
    // macOS needs a menu for Cmd+Q and the clipboard; other platforms get none.
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
    createWindow(1);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(1);
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
