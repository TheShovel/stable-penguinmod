/*
 * Hackatime support for PenguinMod.
 *
 * Sends a WakaTime-compatible heartbeat to Hackatime whenever the user saves
 * a project. The API key/URL are shared, while the Hackatime project name,
 * language, and entity are stored per project. Configuration lives in this
 * browser's localStorage under "penguinmod:hackatime" and can be edited from
 * the Hackatime item in the editor's menu bar, next to Settings.
 *
 * This file has no Electron dependency, so it works in both the desktop app
 * and the browser build.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "penguinmod:hackatime";
  var PLUGIN = "penguinmod/1.0.0";
  var DEFAULTS = {
    enabled: false,
    apiUrl: "https://hackatime.hackclub.com/api/hackatime/v1",
    apiKey: "",
    project: "PenguinMod",
    language: "JavaScript",
    entity: "",
    heartbeatRateLimitSeconds: 30,
  };
  // Multiple save hooks can fire for a single save (VM call, file handle,
  // download link). Collapse those into one heartbeat.
  var SAVE_DEDUPE_MS = 1500;
  var SAVE_SIGNAL_WINDOW_MS = 150;

  // ── Configuration ────────────────────────────────────────────────────

  function clampSeconds(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) n = DEFAULTS.heartbeatRateLimitSeconds;
    return Math.min(86400, Math.floor(n));
  }

  function cleanString(value, fallback) {
    var s = typeof value === "string" ? value.trim() : "";
    return s || fallback;
  }

  function normalizeTitle(title) {
    return String(typeof title === "string" ? title : "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Hosted projects get a stable ID. Local/unsaved projects only have a title,
  // so use that as their identity.
  function projectKeyFor(title, id) {
    var projectId = id == null ? "" : String(id);
    if (
      projectId &&
      projectId !== "0" &&
      projectId !== "null" &&
      projectId !== "undefined"
    ) {
      return "id:" + projectId;
    }
    return "title:" + (normalizeTitle(title).toLowerCase() || "project");
  }

  function getProjectContext() {
    var title = "";
    var id = "";

    try {
      if (
        typeof window !== "undefined" &&
        window.ReduxStore &&
        typeof window.ReduxStore.getState === "function"
      ) {
        var state = window.ReduxStore.getState();
        var gui = state && state.scratchGui;
        if (gui && typeof gui.projectTitle === "string") {
          title = gui.projectTitle;
        }
        if (gui && gui.projectState) id = gui.projectState.projectId;
      }
    } catch (e) {
      // Fall back to the title input below.
    }

    // The title input can be ahead of the committed Redux value while the
    // user is editing, so prefer what the input currently shows.
    if (typeof document !== "undefined") {
      var input = document.querySelector(
        'input[class*="project-title-input"]'
      );
      if (input && typeof input.value === "string" && input.value.trim()) {
        title = input.value;
      }
    }

    title = normalizeTitle(title) || "Project";
    id = id == null ? "" : String(id);
    return { key: projectKeyFor(title, id), title: title, id: id };
  }

  function loadStoredConfig() {
    var stored = {};
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") stored = parsed;
      }
    } catch (e) {
      // Corrupt or unavailable storage: fall back to defaults.
    }

    // Accept the snake_case names from a ~/.wakatime.cfg as well.
    if (stored.apiUrl == null && typeof stored.api_url === "string") {
      stored.apiUrl = stored.api_url;
    }
    if (stored.apiKey == null && typeof stored.api_key === "string") {
      stored.apiKey = stored.api_key;
    }
    if (
      stored.heartbeatRateLimitSeconds == null &&
      stored.heartbeat_rate_limit_seconds != null
    ) {
      stored.heartbeatRateLimitSeconds = stored.heartbeat_rate_limit_seconds;
    }

    var projects = {};
    if (
      stored.projects &&
      typeof stored.projects === "object" &&
      !Array.isArray(stored.projects)
    ) {
      Object.keys(stored.projects).forEach(function (key) {
        var value = stored.projects[key];
        if (!value || typeof value !== "object") return;
        projects[key] = {
          project: cleanString(value.project, ""),
          language: cleanString(value.language, ""),
          entity: cleanString(value.entity, ""),
        };
      });
    }

    return {
      enabled:
        typeof stored.enabled === "boolean"
          ? stored.enabled
          : DEFAULTS.enabled,
      apiUrl: cleanString(stored.apiUrl, DEFAULTS.apiUrl).replace(/\/+$/, ""),
      apiKey: cleanString(stored.apiKey, ""),
      heartbeatRateLimitSeconds:
        stored.heartbeatRateLimitSeconds == null
          ? DEFAULTS.heartbeatRateLimitSeconds
          : clampSeconds(stored.heartbeatRateLimitSeconds),
      projects: projects,
    };
  }

  function persistStoredConfig(config) {
    var value = {
      version: 2,
      enabled: !!config.enabled,
      apiUrl: cleanString(config.apiUrl, DEFAULTS.apiUrl).replace(/\/+$/, ""),
      apiKey: cleanString(config.apiKey, ""),
      heartbeatRateLimitSeconds: clampSeconds(
        config.heartbeatRateLimitSeconds
      ),
      projects: {},
    };

    Object.keys(config.projects || {}).forEach(function (key) {
      var record = config.projects[key] || {};
      value.projects[key] = {
        project: cleanString(record.project, ""),
        language: cleanString(record.language, ""),
        entity: cleanString(record.entity, ""),
      };
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (e) {
      // Storage can be unavailable (private mode, disabled cookies, ...).
    }
    return value;
  }

  function defaultProjectSettings(identity) {
    return {
      project: cleanString(identity && identity.title, DEFAULTS.project),
      language: DEFAULTS.language,
      entity: "",
    };
  }

  function projectSettingsFor(stored, identity) {
    var record = stored.projects && stored.projects[identity.key];
    var defaults = defaultProjectSettings(identity);
    if (!record) return defaults;
    return {
      project: cleanString(record.project, defaults.project),
      language: cleanString(record.language, defaults.language),
      entity: cleanString(record.entity, ""),
    };
  }

  // Returns the merged view used by the heartbeat code: shared connection
  // settings plus the current project's name/language/entity.
  function loadConfig() {
    var stored = loadStoredConfig();
    var identity = getProjectContext();
    var project = projectSettingsFor(stored, identity);

    return {
      enabled: stored.enabled,
      apiUrl: stored.apiUrl,
      apiKey: stored.apiKey,
      heartbeatRateLimitSeconds: stored.heartbeatRateLimitSeconds,
      project: project.project,
      language: project.language,
      entity: project.entity,
      projectKey: identity.key,
      projectTitle: identity.title,
    };
  }

  function saveConfig(config) {
    var stored = loadStoredConfig();
    stored.enabled = !!config.enabled;
    stored.apiUrl = cleanString(config.apiUrl, DEFAULTS.apiUrl);
    stored.apiKey = cleanString(config.apiKey, "");
    stored.heartbeatRateLimitSeconds = clampSeconds(
      config.heartbeatRateLimitSeconds
    );

    var identity = getProjectContext();
    var defaults = defaultProjectSettings(identity);
    stored.projects[identity.key] = {
      project: cleanString(config.project, defaults.project),
      language: cleanString(config.language, defaults.language),
      entity: cleanString(config.entity, ""),
    };

    persistStoredConfig(stored);
    return loadConfig();
  }

  function migrateProjectRecord(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    var stored = loadStoredConfig();
    if (!stored.projects[fromKey] || stored.projects[toKey]) return;
    stored.projects[toKey] = stored.projects[fromKey];
    delete stored.projects[fromKey];
    persistStoredConfig(stored);
  }

  // ── Heartbeat payloads ───────────────────────────────────────────────

  function heartbeatsUrl(apiUrl) {
    var base = cleanString(apiUrl, DEFAULTS.apiUrl).replace(/\/+$/, "");
    return base + "/users/current/heartbeats";
  }

  function buildHeartbeat(config, timeMs, filename, isWrite) {
    var entity = cleanString(config.entity, "");
    if (!entity) entity = cleanString(filename, "");
    if (!entity) entity = cleanString(config.project, DEFAULTS.project) + ".sb3";

    return {
      entity: entity,
      type: "file",
      category: "coding",
      project: cleanString(config.project, DEFAULTS.project),
      language: cleanString(config.language, DEFAULTS.language),
      is_write: isWrite !== false,
      time: (typeof timeMs === "number" ? timeMs : Date.now()) / 1000,
      plugin: PLUGIN,
      dependencies: [],
    };
  }

  function postHeartbeats(config, heartbeats) {
    if (!config.apiKey) {
      return Promise.reject(new Error("API key is not set"));
    }

    return fetch(heartbeatsUrl(config.apiUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.apiKey,
      },
      body: JSON.stringify(heartbeats),
    }).then(function (response) {
      if (response.ok) return response;
      return response.text().then(
        function (text) {
          var detail = text ? ": " + text.slice(0, 200) : "";
          throw new Error("HTTP " + response.status + detail);
        },
        function () {
          throw new Error("HTTP " + response.status);
        }
      );
    });
  }

  // ── Heartbeat scheduling ─────────────────────────────────────────────

  var lastHeartbeatAt = 0;
  var pendingHeartbeat = null;
  var pendingTimer = null;
  var lastSignalAt = 0;
  var pendingSignal = null;
  var pendingSignalTimer = null;
  var lastStatus = { kind: "idle", message: "No heartbeats sent yet." };

  function describeError(error) {
    return error && error.message ? error.message : String(error);
  }

  function setStatus(kind, message) {
    lastStatus = { kind: kind, message: message };
    updateStatusViews();
  }

  function sendHeartbeat(config, heartbeat) {
    lastHeartbeatAt = Date.now();
    setStatus("sending", "Sending heartbeat…");

    postHeartbeats(config, [heartbeat]).then(
      function (response) {
        setStatus("ok", "Heartbeat accepted (HTTP " + response.status + ").");
      },
      function (error) {
        setStatus("error", "Heartbeat failed: " + describeError(error));
      }
    );
  }

  function flushPendingHeartbeat() {
    pendingTimer = null;
    if (!pendingHeartbeat) return;

    var heartbeat = pendingHeartbeat;
    pendingHeartbeat = null;

    var config = loadConfig();
    if (!config.enabled) {
      setStatus("idle", "Tracking is disabled.");
      return;
    }
    if (!config.apiKey) {
      setStatus("error", "API key is not set.");
      return;
    }

    var waitMs =
      lastHeartbeatAt + config.heartbeatRateLimitSeconds * 1000 - Date.now();
    if (waitMs > 0) {
      pendingHeartbeat = heartbeat;
      pendingTimer = setTimeout(flushPendingHeartbeat, waitMs);
      return;
    }

    sendHeartbeat(config, heartbeat);
  }

  function processSaveSignal(filename) {
    var config = loadConfig();
    if (!config.enabled) {
      setStatus("idle", "Tracking is disabled.");
      return;
    }
    if (!config.apiKey) {
      setStatus("error", "API key is not set.");
      return;
    }

    var now = Date.now();
    var heartbeat = buildHeartbeat(config, now, filename, true);
    var waitMs =
      lastHeartbeatAt + config.heartbeatRateLimitSeconds * 1000 - now;

    if (waitMs > 0) {
      // Respect the rate limit but keep the most recent save.
      pendingHeartbeat = heartbeat;
      if (!pendingTimer) {
        pendingTimer = setTimeout(flushPendingHeartbeat, waitMs);
      }
      setStatus("pending", "Heartbeat queued to respect the rate limit.");
      return;
    }

    sendHeartbeat(config, heartbeat);
  }

  function notifySave(source, filename) {
    var now = Date.now();
    if (now - lastSignalAt < SAVE_DEDUPE_MS) return;

    if (!pendingSignal) {
      pendingSignal = { filename: filename || "" };
      if (pendingSignalTimer) clearTimeout(pendingSignalTimer);
      pendingSignalTimer = setTimeout(function () {
        var signal = pendingSignal;
        pendingSignal = null;
        pendingSignalTimer = null;
        lastSignalAt = Date.now();
        processSaveSignal(signal ? signal.filename : "");
      }, SAVE_SIGNAL_WINDOW_MS);
    } else if (filename) {
      // A later hook knows the real filename (e.g. "Save as...").
      pendingSignal.filename = filename;
    }
  }

  // ── Save detection ───────────────────────────────────────────────────

  function hookVm(vm) {
    if (!vm || vm.__penguinHackatimeHooked) return;
    try {
      vm.__penguinHackatimeHooked = true;
    } catch (e) {
      return;
    }

    ["saveProjectSb3", "saveProjectSb3Stream"].forEach(function (name) {
      var original = vm[name];
      if (typeof original !== "function") return;

      try {
        vm[name] = function () {
          var result = original.apply(this, arguments);
          try {
            if (result && typeof result.then === "function") {
              result.then(
                function () {
                  notifySave(name);
                },
                function () {}
              );
            } else {
              notifySave(name);
            }
          } catch (e) {
            // Never break saving because of tracking.
          }
          return result;
        };
      } catch (e) {
        // Some builds may expose non-writable methods; the download and
        // file-handle hooks below still cover saves.
      }
    });
  }

  function installSaveHooks() {
    // "Save to your computer" / "Save to separate file..." both download a
    // blob named "<project>.sb3".
    if (
      typeof HTMLAnchorElement !== "undefined" &&
      HTMLAnchorElement.prototype &&
      typeof HTMLAnchorElement.prototype.click === "function"
    ) {
      var originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        try {
          var name = this.download;
          if (name && /\.sb3$/i.test(name)) notifySave("download", name);
        } catch (e) {
          // Ignore.
        }
        return originalClick.apply(this, arguments);
      };
    }

    // "Save to <file>" / "Save as..." use the File System Access API.
    if (
      typeof FileSystemFileHandle !== "undefined" &&
      FileSystemFileHandle.prototype &&
      typeof FileSystemFileHandle.prototype.createWritable === "function"
    ) {
      var originalCreateWritable =
        FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = function () {
        try {
          var name = this.name;
          if (name && /\.sb3$/i.test(name)) notifySave("file", name);
        } catch (e) {
          // Ignore.
        }
        return originalCreateWritable.apply(this, arguments);
      };
    }
  }

  var titleWatcher = { input: null, start: null };

  function ensureTitleWatcher() {
    if (typeof document === "undefined") return;

    var input = document.querySelector(
      'input[class*="project-title-input"]'
    );
    if (!input || input === titleWatcher.input) return;

    titleWatcher.input = input;
    titleWatcher.start = null;

    input.addEventListener("focus", function () {
      var identity = getProjectContext();
      titleWatcher.start = { key: identity.key, id: identity.id };
    });
    input.addEventListener("change", function () {
      finishTitleEdit(input);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        setTimeout(function () {
          finishTitleEdit(input);
        }, 0);
      }
    });
  }

  // If the project is renamed while settings exist, keep its Hackatime
  // settings instead of starting over under the new title.
  function finishTitleEdit(input) {
    var start = titleWatcher.start;
    titleWatcher.start = null;
    if (!start) return;

    setTimeout(function () {
      var identity = getProjectContext();
      var title = normalizeTitle(input.value) || "Project";
      var newKey = projectKeyFor(title, identity.id);
      if (newKey === start.key) return;
      migrateProjectRecord(start.key, newKey);
      updateStatusViews();
    }, 0);
  }

  function watchForVm() {
    function check() {
      if (window.vm) hookVm(window.vm);
      ensureMenuEntry();
      ensureTitleWatcher();
    }
    check();
    setInterval(check, 500);
  }

  // ── Settings UI ──────────────────────────────────────────────────────

  var STATUS_COLORS = {
    idle: "#8a8a8a",
    ok: "#3fb950",
    error: "#f85149",
    pending: "#d29922",
    sending: "#d29922",
  };

  var ui = {
    menuItem: null,
    menuDot: null,
    overlay: null,
    status: null,
    projectTitle: null,
    fields: null,
  };

  function statusText() {
    var config = loadConfig();
    if (!config.enabled) return "Tracking is disabled.";
    if (!config.apiKey) return "Add your Hackatime API key to start tracking.";
    return lastStatus.message;
  }

  function updateStatusViews() {
    if (ui.status) {
      ui.status.textContent = statusText();
      ui.status.setAttribute("data-kind", lastStatus.kind);
    }

    var config = loadConfig();
    var state = "idle";
    if (!config.enabled) {
      state = "idle";
    } else if (!config.apiKey) {
      state = "error";
    } else if (lastStatus.kind === "error") {
      state = "error";
    } else if (
      lastStatus.kind === "ok" ||
      lastStatus.kind === "pending" ||
      lastStatus.kind === "sending"
    ) {
      state = lastStatus.kind;
    }

    if (ui.menuItem) {
      ui.menuItem.setAttribute("data-state", state);
      ui.menuItem.title = "Hackatime: " + statusText();
    }
  }

  var STYLE_TEXT = [
    ".pm-hk-menu-dot{display:inline-block;width:6px;height:6px;",
    "border-radius:50%;background:#8a8a8a;flex:none}",
    '#pm-hackatime-menu-item[data-state="ok"] .pm-hk-menu-dot{background:#3fb950}',
    '#pm-hackatime-menu-item[data-state="error"] .pm-hk-menu-dot{background:#f85149}',
    '#pm-hackatime-menu-item[data-state="pending"] .pm-hk-menu-dot,',
    '#pm-hackatime-menu-item[data-state="sending"] .pm-hk-menu-dot{background:#d29922}',
    "#pm-hackatime-overlay{position:fixed;inset:0;z-index:2147483001;",
    "display:flex;align-items:center;justify-content:center;",
    "background:rgba(0,0,0,.55)}",
    "#pm-hackatime-overlay[hidden]{display:none}",
    ".pm-hk-dialog{width:min(540px,calc(100vw - 32px));max-height:calc(100vh - 32px);",
    "overflow:auto;box-sizing:border-box;padding:20px;border-radius:12px;",
    "background:#282828;color:#eee;border:1px solid #4a4a4a;",
    "box-shadow:0 12px 40px rgba(0,0,0,.5);",
    'font:13px/1.45 "Helvetica Neue",Helvetica,Arial,sans-serif}',
    ".pm-hk-head{display:flex;align-items:center;justify-content:space-between;",
    "margin:0 0 4px}",
    ".pm-hk-head h2{margin:0;font-size:18px;font-weight:600}",
    ".pm-hk-close{border:0;background:transparent;color:#bbb;font-size:22px;",
    "line-height:1;cursor:pointer;padding:0 4px}",
    ".pm-hk-close:hover{color:#fff}",
    ".pm-hk-desc{margin:0 0 14px;color:#aaa}",
    ".pm-hk-field{display:block;margin:10px 0}",
    ".pm-hk-field>span{display:block;margin-bottom:4px;color:#bbb;font-size:12px}",
    ".pm-hk-field small{display:block;margin-top:4px;color:#888;font-size:11px}",
    ".pm-hk-field input{width:100%;box-sizing:border-box;padding:7px 8px;",
    "border-radius:6px;border:1px solid #555;background:#1e1e1e;color:#eee;",
    "font:inherit}",
    ".pm-hk-field input:focus{outline:2px solid #00c3ff;outline-offset:0;border-color:transparent}",
    ".pm-hk-row{display:flex;align-items:center;gap:9px;margin:12px 0}",
    ".pm-hk-row input{width:16px;height:16px;margin:0}",
    ".pm-hk-divider{margin:16px 0 8px;padding-top:14px;border-top:1px solid #444;",
    "font-weight:600;color:#ddd}",
    ".pm-hk-divider small{display:block;font-weight:400;color:#888;",
    "font-size:11px;margin-top:3px}",
    ".pm-hk-status{margin:12px 0 0;padding:8px 10px;border-radius:6px;",
    "background:#1e1e1e;color:#bbb;font-size:12px;min-height:17px}",
    '#pm-hackatime-status[data-kind="ok"]{color:#3fb950}',
    '#pm-hackatime-status[data-kind="error"]{color:#f85149}',
    '#pm-hackatime-status[data-kind="pending"],',
    '#pm-hackatime-status[data-kind="sending"]{color:#d29922}',
    ".pm-hk-foot{display:flex;align-items:center;gap:8px;margin-top:16px;",
    "flex-wrap:wrap}",
    ".pm-hk-spacer{flex:1 1 auto}",
    ".pm-hk-btn{border:1px solid #555;border-radius:6px;padding:7px 12px;",
    "background:#333;color:#eee;font:inherit;cursor:pointer}",
    ".pm-hk-btn:hover{background:#3d3d3d}",
    ".pm-hk-btn[data-primary]{background:#0088cc;border-color:#0088cc}",
    ".pm-hk-btn[data-primary]:hover{background:#0099e6}",
  ].join("");

  function findSettingsMenuItem() {
    if (typeof document === "undefined") return null;

    var groups = document.querySelectorAll('[class*="menu-bar_file-group"]');
    for (var i = 0; i < groups.length; i++) {
      var items = [];
      for (var j = 0; j < groups[i].children.length; j++) {
        var child = groups[i].children[j];
        if (
          child.className &&
          String(child.className).indexOf("menu-bar_menu-bar-item") !== -1
        ) {
          items.push(child);
        }
      }
      if (!items.length) continue;

      for (var k = 0; k < items.length; k++) {
        if (items[k].textContent.trim() === "Settings") return items[k];
      }
      // If the UI is translated, fall back to the last entry before the
      // divider, which is where the Settings menu lives.
      return items[items.length - 1];
    }

    return null;
  }

  function ensureMenuEntry() {
    if (typeof document === "undefined") return;

    var settings = findSettingsMenuItem();
    if (!settings) return;

    if (!ui.menuItem) {
      var item = document.createElement("div");
      item.id = "pm-hackatime-menu-item";
      item.className = settings.className;
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      var inner = document.createElement("div");
      inner.style.display = "flex";
      inner.style.alignItems = "center";
      inner.style.gap = "6px";

      var label = document.createElement("span");
      label.textContent = "Hackatime";

      var dot = document.createElement("span");
      dot.className = "pm-hk-menu-dot";

      inner.appendChild(label);
      inner.appendChild(dot);
      item.appendChild(inner);

      item.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openSettings();
      });
      item.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSettings();
        }
      });

      ui.menuItem = item;
      ui.menuDot = dot;
    }

    if (
      ui.menuItem.previousElementSibling !== settings ||
      ui.menuItem.parentNode !== settings.parentNode
    ) {
      settings.insertAdjacentElement("afterend", ui.menuItem);
    }

    updateStatusViews();
  }

  function createUi() {
    if (typeof document === "undefined" || !document.body) return;
    if (document.getElementById("pm-hackatime-overlay")) return;

    var style = document.createElement("style");
    style.id = "pm-hackatime-style";
    style.textContent = STYLE_TEXT;
    (document.head || document.documentElement).appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = "pm-hackatime-overlay";
    overlay.hidden = true;
    overlay.innerHTML = [
      '<form class="pm-hk-dialog" role="dialog" aria-modal="true"',
      ' aria-labelledby="pm-hackatime-title">',
      '<div class="pm-hk-head">',
      '<h2 id="pm-hackatime-title">Hackatime</h2>',
      '<button type="button" class="pm-hk-close" aria-label="Close">×</button>',
      "</div>",
      '<p class="pm-hk-desc">Sends a WakaTime heartbeat to Hackatime whenever',
      " you save. Connection settings are shared; name, language, and entity",
      " are saved per project in this browser's localStorage.</p>",
      '<label class="pm-hk-row"><input type="checkbox" id="pm-hk-enabled">',
      "<span>Enable save tracking</span></label>",
      '<label class="pm-hk-field"><span>API URL</span>',
      '<input type="text" id="pm-hk-url" spellcheck="false" autocomplete="off">',
      "<small>Heartbeats are posted to &lt;API URL&gt;/users/current/heartbeats.</small>",
      "</label>",
      '<label class="pm-hk-field"><span>API key</span>',
      '<input type="password" id="pm-hk-key" spellcheck="false" autocomplete="off">',
      "</label>",
      '<label class="pm-hk-field"><span>Minimum seconds between heartbeats</span>',
      '<input type="number" id="pm-hk-rate" min="0" max="86400" step="1">',
      "</label>",
      '<div class="pm-hk-divider">This project: ',
      '<span id="pm-hk-project-title"></span>',
      "<small>These fields are stored for this project only.</small></div>",
      '<label class="pm-hk-field"><span>Hackatime project name</span>',
      '<input type="text" id="pm-hk-project" spellcheck="false" autocomplete="off">',
      "</label>",
      '<label class="pm-hk-field"><span>Language</span>',
      '<input type="text" id="pm-hk-language" spellcheck="false" autocomplete="off">',
      "</label>",
      '<label class="pm-hk-field"><span>Entity (optional)</span>',
      '<input type="text" id="pm-hk-entity" spellcheck="false" autocomplete="off"',
      ' placeholder="Defaults to the saved project filename">',
      "</label>",
      '<div class="pm-hk-status" id="pm-hackatime-status" data-kind="idle"></div>',
      '<div class="pm-hk-foot">',
      '<button type="button" class="pm-hk-btn" id="pm-hk-test">Send test heartbeat</button>',
      '<span class="pm-hk-spacer"></span>',
      '<button type="button" class="pm-hk-btn" id="pm-hk-cancel">Cancel</button>',
      '<button type="submit" class="pm-hk-btn" data-primary id="pm-hk-save">Save</button>',
      "</div>",
      "</form>",
    ].join("");
    document.body.appendChild(overlay);

    ui.overlay = overlay;
    ui.status = overlay.querySelector("#pm-hackatime-status");
    ui.projectTitle = overlay.querySelector("#pm-hk-project-title");
    ui.fields = {
      enabled: overlay.querySelector("#pm-hk-enabled"),
      url: overlay.querySelector("#pm-hk-url"),
      key: overlay.querySelector("#pm-hk-key"),
      project: overlay.querySelector("#pm-hk-project"),
      language: overlay.querySelector("#pm-hk-language"),
      entity: overlay.querySelector("#pm-hk-entity"),
      rate: overlay.querySelector("#pm-hk-rate"),
    };

    overlay.querySelector(".pm-hk-close").addEventListener("click", closeSettings);
    overlay.querySelector("#pm-hk-cancel").addEventListener("click", closeSettings);
    overlay.querySelector("#pm-hk-test").addEventListener("click", testHeartbeat);
    overlay
      .querySelector(".pm-hk-dialog")
      .addEventListener("submit", submitSettings);
    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) closeSettings();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !overlay.hidden) closeSettings();
    });

    ensureMenuEntry();
    updateStatusViews();
  }

  function openSettings() {
    if (!ui.overlay) return;
    var config = loadConfig();
    ui.projectTitle.textContent = config.projectTitle;
    ui.fields.enabled.checked = config.enabled;
    ui.fields.url.value = config.apiUrl;
    ui.fields.key.value = config.apiKey;
    ui.fields.project.value = config.project;
    ui.fields.language.value = config.language;
    ui.fields.entity.value = config.entity;
    ui.fields.rate.value = String(config.heartbeatRateLimitSeconds);

    ui.status.textContent = statusText();
    ui.status.setAttribute("data-kind", lastStatus.kind);
    ui.overlay.hidden = false;
    (config.apiKey ? ui.fields.project : ui.fields.key).focus();
  }

  function closeSettings() {
    if (ui.overlay) ui.overlay.hidden = true;
  }

  function readSettingsFromForm() {
    var identity = getProjectContext();
    return {
      enabled: ui.fields.enabled.checked,
      apiUrl: cleanString(ui.fields.url.value, DEFAULTS.apiUrl),
      apiKey: cleanString(ui.fields.key.value, ""),
      project: cleanString(
        ui.fields.project.value,
        identity.title || DEFAULTS.project
      ),
      language: cleanString(ui.fields.language.value, DEFAULTS.language),
      entity: cleanString(ui.fields.entity.value, ""),
      heartbeatRateLimitSeconds: clampSeconds(ui.fields.rate.value),
    };
  }

  function submitSettings(event) {
    if (event) event.preventDefault();
    var config = saveConfig(readSettingsFromForm());
    ui.projectTitle.textContent = config.projectTitle;
    ui.fields.url.value = config.apiUrl;
    ui.fields.key.value = config.apiKey;
    ui.fields.project.value = config.project;
    ui.fields.language.value = config.language;
    ui.fields.entity.value = config.entity;
    ui.fields.rate.value = String(config.heartbeatRateLimitSeconds);
    updateStatusViews();
    closeSettings();
  }

  function testHeartbeat() {
    var config = readSettingsFromForm();
    if (!config.apiKey) {
      setStatus("error", "API key is not set.");
      return;
    }

    setStatus("sending", "Sending test heartbeat…");
    var heartbeat = buildHeartbeat(config, Date.now(), config.entity, false);
    postHeartbeats(config, [heartbeat]).then(
      function (response) {
        setStatus("ok", "Test heartbeat accepted (HTTP " + response.status + ").");
      },
      function (error) {
        setStatus("error", "Test heartbeat failed: " + describeError(error));
      }
    );
  }

  // ── Debug / test API ─────────────────────────────────────────────────

  window.PenguinModHackatime = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_CONFIG: DEFAULTS,
    loadConfig: loadConfig,
    loadStoredConfig: loadStoredConfig,
    saveConfig: saveConfig,
    getProjectContext: getProjectContext,
    projectKeyFor: projectKeyFor,
    heartbeatsUrl: heartbeatsUrl,
    buildHeartbeat: buildHeartbeat,
    postHeartbeats: postHeartbeats,
    notifySave: notifySave,
    hookVm: hookVm,
    status: function () {
      return lastStatus;
    },
  };

  installSaveHooks();
  createUi();
  watchForVm();
})();
