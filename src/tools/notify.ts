import { execSync } from "child_process";
import { formatError } from "../utils/helpers.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";

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
        windowsHide: true,
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
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function notifyTool(args: NotifyArgs): Promise<any> {
  try {
    const title = args.title || "AuraMCP";
    const message = args.message || "Notification from MCP server";
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
          { stdio: "ignore", timeout: 5000, windowsHide: true }
        );
        notificationSent = true;
      } catch {
        // fallback
      }
    }

    if (withSound) {
      playBeep();
    }

    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          notificationSent
            ? `Notification sent: "${title}" — ${message}${withSound ? " (with sound)" : ""}`
            : `Notification not sent (GUI not available), but sound emitted: ${message}`,
          "Confirm the notification was sent, or that only a beep played."
        ),
      }],
    };
  } catch (error) {
    return formatError(error);
  }
}
