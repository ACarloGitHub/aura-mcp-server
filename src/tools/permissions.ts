import {
  grantPermission,
  revokePermission,
  listPermissions,
  clearSessionPermissions,
  type PermissionScope,
  type PermissionEntry,
} from "../utils/permissions.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";

interface PermissionsArgs {
  action: "grant" | "revoke" | "list" | "clear_session";
  path?: string;
  scope?: PermissionScope;
  tool?: string;
}

export async function permissionsTool(args: PermissionsArgs): Promise<any> {
  const { action, path, scope = "session", tool = "file" } = args;

  switch (action) {
    case "grant": {
      if (!path) {
        return {
          content: [{ type: "text", text: "Error: path is required for grant action." }],
          isError: true,
        };
      }
      grantPermission(path, scope, tool);
      return {
        content: [{
          type: "text",
          text: wrapWithInstruction(
            `Permission granted: ${path} (scope: ${scope}, tool: ${tool})`,
            "Acknowledge the permission grant. The agent can now retry the original tool call."
          ),
        }],
      };
    }

    case "revoke": {
      if (!path) {
        return {
          content: [{ type: "text", text: "Error: path is required for revoke action." }],
          isError: true,
        };
      }
      revokePermission(path);
      return {
        content: [{
          type: "text",
          text: wrapWithInstruction(
            `Permission revoked: ${path}`,
            "Acknowledge the revocation."
          ),
        }],
      };
    }

    case "list": {
      const entries = listPermissions();
      const lines = entries.map((e) => `- ${e.path} [${e.scope}] (${e.tool})`);
      return {
        content: [{
          type: "text",
          text: wrapWithInstruction(
            `Permissions (${entries.length}):\n${lines.join("\n") || "(none)"}`,
            "Briefly list the permissions."
          ),
        }],
        structuredContent: { permissions: entries },
      };
    }

    case "clear_session": {
      clearSessionPermissions();
      return {
        content: [{
          type: "text",
          text: wrapWithInstruction(
            "Session permissions cleared.",
            "Acknowledge the clear."
          ),
        }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Error: unknown permissions action: ${action}` }],
        isError: true,
      };
  }
}