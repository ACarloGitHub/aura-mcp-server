; AuraMCP NSIS installer hooks
;
; Runs at the end of the uninstall, after the launcher binary, the bundled
; resources and the start-menu shortcut have been removed. We ask the
; user whether they also want to wipe the per-user data directory
; (workspace, downloaded nomic GGUF model, sqlite-vec index, logs).
;
; Reference:
;   https://v2.tauri.app/distribute/windows-installer/#extending-the-installer

!macro NSIS_HOOK_POSTUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "AuraMCP uninstall:$\r$\nalso remove local data (workspace, embedding model, RAG index)?$\r$\n$\r$\nChoose NO to keep the data for a future reinstall." IDYES purge_data IDNO skip_cleanup

  purge_data:
    RMDir /r "$APPDATA\com.auramcp.server"
    DetailPrint "AuraMCP: removed $APPDATA\com.auramcp.server"
    Goto cleanup_done

  skip_cleanup:
    DetailPrint "AuraMCP: kept $APPDATA\com.auramcp.server"

  cleanup_done:
!macroend