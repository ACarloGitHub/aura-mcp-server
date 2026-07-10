; AuraMCP NSIS installer hooks
;
; Runs at the end of the uninstall, after the launcher binary, the bundled
; resources and the start-menu shortcut have been removed. We ask the
; user whether they also want to wipe the per-user data directory
; (workspace, downloaded nomic GGUF model, sqlite-vec index, logs).
;
; References:
;   https://v2.tauri.app/distribute/windows-installer/#extending-the-installer
;   https://nsis.sourceforge.io/Docs/Chapter4.html#flags

!macro NSIS_HOOK_POSTUNINSTALL
  ; IfSilent jumps to the given label when the installer runs in silent mode
  ; (e.g. `uninstall.exe /S`). Skip the dialog in that case.
  IfSilent skip_cleanup

  MessageBox MB_YESNO|MB_ICONQUESTION "AuraMCP uninstall: also remove local data (workspace, embedding model, RAG index)?$\r$\n$\r$\nChoose NO to keep the data for a future reinstall." IDYES purge_data IDNO skip_cleanup

  purge_data:
    RMDir /r "$APPDATA\com.auramcp.server"
    DetailPrint "AuraMCP: removed $APPDATA\com.auramcp.server"
    Goto done

  skip_cleanup:
    DetailPrint 'AuraMCP: kept $APPDATA\com.auramcp.server'

  done:
!macroend