import { execSync } from "child_process";
import { textResult, formatError } from "../utils/helpers.js";

let notifier: any = null;
try {
  notifier = await import("node-notifier");
} catch {
  notifier = null;
}

interface NotifyArgs {
  title?: string;
  message: string;
  sound?: boolean;
}

function playBeep(): void {
  try {
    if (process.platform === "win32") {
      execSync("powershell -NoProfile -Command \"[console]::beep(800,200)\"", {
        stdio: "ignore",
        timeout: 3000,
      });
    } else {
      process.stdout.write("\x07");
    }
  } catch {
    // ignore
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function sendWinRTToast(title: string, message: string): boolean {
  if (process.platform !== "win32") return false;
  try {
    const safeTitle = escapeXml(title);
    const safeMessage = escapeXml(message);
    const psScript = `$app = 'AnythingLLM'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${safeTitle}</text>
      <text>${safeMessage}</text>
    </binding>
  </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)`;

    const encoded = Buffer.from(psScript, "utf-16le").toString("base64");
    execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      stdio: "ignore",
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function notifyTool(args: NotifyArgs): Promise<any> {
  try {
    const title = args.title || "Aura MCP";
    const message = args.message || "Notifica dal server MCP";
    const withSound = args.sound !== false;

    let notificationSent = false;

    if (notifier?.default) {
      try {
        notifier.default.notify({
          title,
          message,
          sound: withSound,
        });
        notificationSent = true;
      } catch {
        notificationSent = false;
      }
    }

    if (!notificationSent && process.platform === "win32") {
      notificationSent = sendWinRTToast(title, message);
    }

    if (!notificationSent && process.platform === "win32") {
      try {
        execSync(
          `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; ` +
          `$balloon = New-Object System.Windows.Forms.NotifyIcon; ` +
          `$balloon.Icon = [System.Drawing.SystemIcons]::Information; ` +
          `$balloon.BalloonTipTitle = '${title.replace(/'/g, "''")}'; ` +
          `$balloon.BalloonTipText = '${message.replace(/'/g, "''")}'; ` +
          `$balloon.Visible = $true; ` +
          `$balloon.ShowBalloonTip(5000)"`,
          { stdio: "ignore", timeout: 5000 }
        );
        notificationSent = true;
      } catch {
        // fallback
      }
    }

    if (withSound) {
      playBeep();
    }

    return textResult(
      notificationSent
        ? `Notifica inviata: "${title}" — ${message}${withSound ? " (con suono)" : ""}`
        : `Notifica non inviata (interfaccia grafica non disponibile), ma suono emesso: ${message}`
    );
  } catch (error) {
    return formatError(error);
  }
}
