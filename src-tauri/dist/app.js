const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);

const els = {
  version: $("version"),
  installDir: $("install-dir"),
  mcpDot: $("mcp-dot"),
  mcpLabel: $("mcp-label"),
  btnStart: $("btn-start"),
  btnStop: $("btn-stop"),
  nomicDot: $("nomic-dot"),
  nomicPath: $("nomic-path"),
  btnDownload: $("btn-download"),
  llamaDot: $("llama-dot"),
  llamaUrl: $("llama-url"),
  lmstudioPath: $("lmstudio-path"),
  lmstudioJson: $("lmstudio-json"),
  anythingllmPath: $("anythingllm-path"),
  anythingllmJson: $("anythingllm-json"),
  anythingllmNoAutoStartJson: $("anythingllm-noautostart-json"),
  chkQuitOnClose: $("chk-quit-on-close"),
  btnBrowse: $("btn-browse"),
  btnUninstall: $("btn-uninstall"),
  downloadOverlay: $("download-overlay"),
  progressBar: $("progress-bar"),
  progressLabel: $("progress-label"),
  progressError: $("progress-error"),
  btnDismissOverlay: $("btn-dismiss-overlay"),
};

function setDot(el, state) {
  el.classList.remove("green", "yellow", "red");
  if (state === "ok") el.classList.add("green");
  else if (state === "warn") el.classList.add("yellow");
  else if (state === "down") el.classList.add("red");
}

function fmtBytes(n) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function hostConfigPath(host) {
  if (host === "lmstudio") {
    return navigator.userAgent.includes("Windows")
      ? "%USERPROFILE%\\.lmstudio\\mcp.json"
      : "~/.lmstudio/mcp.json";
  }
  return "<storage>/plugins/anythingllm_mcp_servers.json";
}

function escapeForJson(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildHostJson({ installPath, distIndexPath, workspaceDir, noAutoStart }) {
  const env = {
    AGENT_WORKSPACE: escapeForJson(workspaceDir),
  };
  const serverEntry = {
    command: "node",
    args: [escapeForJson(distIndexPath)],
    env,
  };
  if (noAutoStart) {
    serverEntry.anythingllm = { autoStart: false };
  }
  return JSON.stringify(
    {
      mcpServers: {
        "auramcp-server": serverEntry,
      },
    },
    null,
    2,
  );
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

function flashCopied(span) {
  span.classList.remove("hidden");
  setTimeout(() => span.classList.add("hidden"), 1500);
}

let lastStatus = null;
let wizardAutoTriggered = false;

async function refreshStatus() {
  debug("refreshStatus: invoking get_status");
  try {
    const s = await Promise.race([
      invoke("get_status"),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timeout 8s")), 8000),
      ),
    ]);
    console.log("[AuraMCP] refreshStatus OK:", s);
    debug("refreshStatus: OK");
    lastStatus = s;

    setDot(els.mcpDot, s.mcpRunning ? "ok" : "down");
    els.mcpLabel.textContent = s.mcpRunning ? "Running" : "Stopped";
    els.btnStart.disabled = !!s.mcpRunning;
    els.btnStop.disabled = !s.mcpRunning;

    setDot(els.nomicDot, s.rag.nomicPresent ? "ok" : "down");
    els.nomicPath.textContent = s.rag.nomicPath;
    els.btnDownload.classList.toggle("hidden", !!s.rag.nomicPresent);

    setDot(els.llamaDot, s.rag.llamaReachable ? "ok" : "warn");
    els.llamaUrl.textContent = s.rag.llamaUrl;

    els.chkQuitOnClose.checked = !!s.quitOnClose;

    els.installDir.textContent = `Installed at ${s.installDir}`;

    if (!s.rag.nomicPresent && !wizardAutoTriggered) {
      wizardAutoTriggered = true;
      startNomicDownload();
    }
  } catch (e) {
    console.error("[AuraMCP] refreshStatus failed:", e);
    debug("refreshStatus FAIL: " + e);
    els.mcpLabel.textContent = "Status error: " + String(e).slice(0, 80);
    showToast("Status error: " + String(e), "error");
  }
}

function debug(s) {
  try {
    document.title = "AuraMCP: " + s;
  } catch {}
  console.log("[DEBUG]", s);
}

function showToast(msg, kind = "info") {
  let bar = document.getElementById("toast-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "toast-bar";
    bar.style.cssText =
      "position:fixed;bottom:14px;right:14px;display:flex;flex-direction:column;gap:8px;z-index:200;max-width:420px;";
    document.body.appendChild(bar);
  }
  const t = document.createElement("div");
  t.style.cssText =
    "padding:10px 14px;border-radius:6px;font-size:13px;border:1px solid var(--border);background:var(--bg-card);color:var(--fg);box-shadow:0 4px 12px rgba(0,0,0,0.4);white-space:pre-wrap;word-break:break-word;";
  if (kind === "error") t.style.borderColor = "var(--red)";
  if (kind === "ok") t.style.borderColor = "var(--green)";
  t.textContent = msg;
  bar.appendChild(t);
  setTimeout(() => t.remove(), 8000);
}

async function refreshHostJson() {
  try {
    const p = await invoke("get_install_paths");
    const workspace = p.workspace_default;
    els.lmstudioJson.textContent = buildHostJson({
      installPath: p.install_dir,
      distIndexPath: p.dist_index_path,
      workspaceDir: workspace,
    });
    els.anythingllmJson.textContent = buildHostJson({
      installPath: p.install_dir,
      distIndexPath: p.dist_index_path,
      workspaceDir: workspace,
    });
    els.anythingllmNoAutoStartJson.textContent = buildHostJson({
      installPath: p.install_dir,
      distIndexPath: p.dist_index_path,
      workspaceDir: workspace,
      noAutoStart: true,
    });
    els.lmstudioPath.textContent = hostConfigPath("lmstudio");
    els.anythingllmPath.textContent = hostConfigPath("anythingllm");
  } catch (e) {
    console.error("refreshHostJson failed:", e);
  }
}

function showDownloadOverlay() {
  els.downloadOverlay.classList.remove("hidden");
  els.progressBar.style.width = "0%";
  els.progressLabel.textContent = "Starting…";
  els.progressError.classList.add("hidden");
  els.progressError.textContent = "";
  if (els.mainPanel) els.mainPanel.style.opacity = "0.4";
}

function hideDownloadOverlay() {
  els.downloadOverlay.classList.add("hidden");
  if (els.mainPanel) els.mainPanel.style.opacity = "1";
}

function onProgress(p) {
  const pct = Math.max(0, Math.min(100, p.percent || 0));
  els.progressBar.style.width = `${pct}%`;
  const dl = fmtBytes(p.downloaded);
  const tt = p.total > 0 ? fmtBytes(p.total) : "?";
  els.progressLabel.textContent = `${dl} / ${tt} (${pct}%)`;
}

function onFinished(f) {
  if (f.ok) {
    setTimeout(() => {
      hideDownloadOverlay();
      refreshStatus();
    }, 600);
  } else {
    els.progressError.textContent = f.error || "Download failed";
    els.progressError.classList.remove("hidden");
  }
}

async function startNomicDownload() {
  showDownloadOverlay();
  try {
    await invoke("download_nomic");
  } catch (e) {
    console.error("download_nomic failed:", e);
    els.progressError.textContent = String(e);
    els.progressError.classList.remove("hidden");
  }
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const target = t.dataset.tab;
      document
        .querySelectorAll(".tab")
        .forEach((x) => x.classList.toggle("active", x === t));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) =>
          p.classList.toggle("active", p.dataset.tab === target),
        );
    });
  });
}

function setupCopyButtons() {
  document.querySelectorAll("button[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = document.getElementById(btn.dataset.copy);
      const span = btn.nextElementSibling;
      const ok = await copyToClipboard(target?.textContent || "");
      if (ok && span && span.id && span.id.endsWith("-copied")) {
        flashCopied(span);
      }
    });
  });
}

function setupButtons() {
  els.btnStart.addEventListener("click", async () => {
    els.btnStart.disabled = true;
    try {
      await invoke("start_server");
    } catch (e) {
      alert(`Could not start server: ${e}`);
    }
    await refreshStatus();
  });

  els.btnStop.addEventListener("click", async () => {
    els.btnStop.disabled = true;
    try {
      await invoke("stop_server");
    } catch (e) {
      alert(`Could not stop server: ${e}`);
    }
    await refreshStatus();
  });

  els.btnDownload.addEventListener("click", () => {
    startNomicDownload();
  });

  els.btnBrowse.addEventListener("click", async () => {
    try {
      await invoke("open_server_folder");
    } catch (e) {
      alert(`Could not open folder: ${e}`);
    }
  });

  els.chkQuitOnClose.addEventListener("change", async () => {
    try {
      await invoke("set_quit_on_close", {
        quit: els.chkQuitOnClose.checked,
      });
    } catch (e) {
      console.error("set_quit_on_close failed:", e);
    }
  });

  els.btnUninstall.addEventListener("click", async () => {
    if (
      !confirm(
        "Uninstall AuraMCP?\n\nOn Windows the bundled uninstaller will start.\n\nOn macOS / Linux this will open an alert with the manual steps.",
      )
    ) {
      return;
    }
    els.btnUninstall.disabled = true;
    try {
      await invoke("uninstall_app");
    } catch (e) {
      alert(
        `Self-uninstall is not available on this platform.\n\n${e}\n\nSee the "Uninstall" section of documentation/setup.md.`,
      );
      els.btnUninstall.disabled = false;
    }
  });

  els.btnDismissOverlay.addEventListener("click", () => {
    hideDownloadOverlay();
  });
}

async function setupEvents() {
  await listen("nomic-progress", (ev) => onProgress(ev.payload));
  await listen("nomic-finished", (ev) => onFinished(ev.payload));
  await listen("server-status", (ev) => {
    if (ev.payload && typeof ev.payload.running === "boolean") {
      refreshStatus();
    }
  });
}

(async () => {
  function debug(s) {
    try {
      document.title = "AuraMCP: " + s;
    } catch {}
    console.log("[DEBUG]", s);
    try {
      const w = window.__TAURI__?.window?.getCurrentWindow?.();
      if (w) w.setTitle("AuraMCP: " + s);
    } catch {}
  }
  debug("boot");
  try {
    if (!window.__TAURI__) {
      debug("FATAL: window.__TAURI__ undefined");
      throw new Error("Tauri API not available — window.__TAURI__ is undefined");
    }
    if (!window.__TAURI__.core) {
      debug("FATAL: window.__TAURI__.core undefined");
      throw new Error("window.__TAURI__.core is undefined");
    }
    debug("tauri API OK");

    // Diagnostic: try built-in command first to validate the channel works
    try {
      const v = await Promise.race([
        invoke("plugin:app|get_version"),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("app.get_version timeout 5s")), 5000),
        ),
      ]);
      debug("app.get_version OK: " + v);
      els.version.textContent = "v" + v;
    } catch (e1) {
      debug("app.get_version FAIL: " + e1);
      try {
        const v2 = await Promise.race([
          window.__TAURI__.app.getVersion(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error("alt getVersion timeout 5s")), 5000),
          ),
        ]);
        debug("app.getVersion() OK: " + v2);
        els.version.textContent = "v" + v2;
      } catch (e2) {
        debug("alt getVersion FAIL: " + e2);
      }
    }

    setupTabs();
    setupCopyButtons();
    setupButtons();
    debug("buttons set up");
    await setupEvents();
    debug("events set up");
    await refreshHostJson();
    debug("host json refreshed");
    await refreshStatus();
    debug("first status done");
    setInterval(refreshStatus, 5000);
  } catch (e) {
    debug("INIT FAIL: " + e);
    console.error("init failed:", e);
    document.body.innerHTML =
      '<pre style="color:#e25959;padding:20px;font-size:12px;">Init error: ' +
      String(e) +
      "</pre>";
  }
})();