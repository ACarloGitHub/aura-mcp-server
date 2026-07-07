import { checkCommandSafety } from "./exec-safety.js";

const assertEq = (actual: unknown, expected: unknown, label: string): void => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    process.exit(1);
  }
  console.log(`ok   ${label}`);
};

assertEq(checkCommandSafety("ls -la").ok, true, "ls is safe");
assertEq(checkCommandSafety("echo hello world").ok, true, "echo is safe");
assertEq(checkCommandSafety("rm -rf /").ok, false, "rm -rf / blocked");
assertEq(checkCommandSafety("rm -rf /").ok, false, "rm -rf / blocked (trim)");
assertEq(checkCommandSafety("sudo rm -rf /").ok, false, "rm -rf / with sudo blocked");
assertEq(checkCommandSafety("format C:").ok, false, "format C: blocked");
assertEq(checkCommandSafety("FORMAT D:").ok, false, "FORMAT D: blocked (case-insensitive)");
assertEq(checkCommandSafety('del /f /s /q C:\\Windows').ok, false, "del recursive C:\\ blocked");
assertEq(checkCommandSafety("mkfs.ext4 /dev/sda1").ok, false, "mkfs on /dev blocked");
assertEq(checkCommandSafety("dd if=/dev/zero of=/dev/sda").ok, false, "dd to /dev blocked");

// Safe variants must NOT trigger
assertEq(checkCommandSafety("rm -f ./tmp.log").ok, true, "rm -f on a file is safe");
assertEq(checkCommandSafety("format as a phrase").ok, true, "format in plain text is safe (no drive after)");
assertEq(checkCommandSafety("ls ddfile.txt").ok, true, "dd not followed by of=/dev is safe");
assertEq(checkCommandSafety("ddsomething is a long command").ok, true, "ddsomething is not dd-of-device");

console.log("exec-safety.test.ts: all assertions passed");
