; AuraMCP NSIS installer hooks
;
; These hooks run at specific points of the install / uninstall lifecycle.
; The NSIS script that ships with Tauri defines a few macro names; we only
; override the ones we care about. Everything else falls back to Tauri's
; defaults.
;
; References:
;   https://v2.tauri.app/distribute/windows-installer/#extending-the-installer

; Runs at the end of the uninstall, after the launcher binary, the bundled
; resources and the start-menu shortcut have been removed.
;
; We ask the user whether they also want to wipe the per-user data directory
; (workspace, downloaded nomic GGUF model, sqlite-vec index, logs).
; The default answer is "No" — uninstall is "soft" by default and leaves the
; user's data behind, matching the behaviour described in RELEASE_NOTES.md.
!macro NSIS_HOOK_POSTUNINSTALL
  ; Skip on silent uninstall (no UI available)
  ${IfSilent} skip_cleanup

  MessageBox MB_YESNO|MB_ICONQUESTION "AuraMCP uninstall:$\r$\n$\r$\nAlso remove your local data (workspace, embedding model, RAG index)?$\r$\n$\r$\nPath: $APPDATA\com.auramcp.server$\r$\n$\r$\nChoose 'No' to keep the data so a future reinstall can reuse it." IDYES purge_data IDNO skip_cleanup

  purge_data:
    ; /r removes directories and their contents recursively; /SILENT
    ; suppresses per-file prompts; the leading /SD IDYES would use the
    ; default-NO behaviour if /r were used without an explicit prompt.
    RMDir /r "$APPDATA\com.auramcp.server"
    DetailPrint "AuraMCP: removed $APPDATA\com.auramcp.server"
    Goto done

  skip_cleanup:
    DetailPrint "AuraMCP: kept $APPDATA\com.auramcp.server (re-run uninstall with -purge-data or delete manually)"

  done:
!macroend