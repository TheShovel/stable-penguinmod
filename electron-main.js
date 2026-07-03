const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

// ── Single instance lock ────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;

function createWindow() {
  // Remove all menu bars — the app has its own UI
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "PenguinMod",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // No menu bar
    autoHideMenuBar: true,
    backgroundColor: "#333333",
    show: false,
  });

  // ── Load the PenguinMod editor ─────────────────────────────────────
  mainWindow.loadFile(path.join(__dirname, "build", "editor.html"));

  // Show window once ready to avoid flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle popup windows — addons, extension pages, etc.
  mainWindow.webContents.setWindowOpenHandler(
    ({ url, frameName, features }) => {
      // External URLs → open in system browser
      if (url.startsWith("http:") || url.startsWith("https:")) {
        // Extension gallery, docs, etc. open in browser
        if (
          url.includes("extensions.penguinmod.com") ||
          url.includes("docs.turbowarp.org") ||
          url.includes("docs.penguinmod.com") ||
          url.includes("packager")
        ) {
          shell.openExternal(url);
          return { action: "deny" };
        }

        // Other HTTP URLs → allow as new window (e.g. iframe posts, oauth)
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 800,
            height: 700,
            icon: path.join(__dirname, "icon.png"),
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      }

      // Local popup windows (addons, debugger, etc.) — allow them
      // Resolve relative URLs against the current page's directory
      let resolvedUrl = url;
      if (!url || url === "" || url === "about:blank") {
        // Empty popups that JS will populate dynamically (e.g. addon-settings)
        resolvedUrl = "about:blank";
      } else if (!url.includes("://") && !url.startsWith("file://")) {
        // Relative URL — resolve against the editor's location
        const baseUrl = mainWindow.webContents.getURL();
        resolvedUrl = new URL(url, baseUrl).href;
      }

      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 700,
          height: 600,
          icon: path.join(__dirname, "icon.png"),
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    },
  );

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  // Register Ctrl+Shift+I and F12 to open developer tools.
  // These normally live on the application menu, but we removed that menu
  // (Menu.setApplicationMenu(null) above), so we register them manually.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (
      (input.key === "I" && input.control && input.shift) ||
      input.key === "F12"
    ) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // ── Close handling ──────────────────────────────────────────────────
  // The editor sets window.onbeforeunload which would block the close button.
  // Override it so the close button and File → Quit actually work.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
