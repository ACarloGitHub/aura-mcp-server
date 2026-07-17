# Next Steps — aura-mcp-server

Ultimo aggiornamento: 2026-07-16

## Cosa e' stato fatto oggi (2026-07-16)

1. **Root cause trovata**: `stdin(Stdio::null())` in `start_mcp_child`
   uccideva il server MCP immediatamente (EOF su stdin →
   `process.exit(0)`). Fixato con `stdin(Stdio::piped())`.

2. **Dev mode funzionante**: `npm run tauri dev` ora funziona:
   - Rimosso `devUrl` da `tauri.conf.json` (frontend statico, niente dev server)
   - `find_index_js` e `find_llama_server` fanno walk-up dall'eseguibile
     per trovare `dist/index.js` e `vendor/llama.cpp/` nella root del repo
   - stdout/stderr del server MCP visibili nel terminale in debug build
     (`cfg!(debug_assertions)` → `Stdio::inherit()`)

3. **Verificato**: l'utente ha confermato che la dev version funziona
   (Start/Stop/Status OK). L'unica cosa che non funziona e' `get_version`.

4. **Documentazione aggiornata**: RELEASE_PROCESS.md con Step 0 (dev
   testing) e lessons #12-#15.

## Cosa NON e' ancora stato fatto

### A. Fix `plugin:app|get_version` (errore in console)

Il frontend (`src-tauri/dist/app.js:288`) chiama:
```js
invoke("plugin:app|get_version")
```
ma il plugin `tauri-plugin-app` non e' installato.

**Da fare**:
1. `cargo add tauri-plugin-app` in `src-tauri/`
2. Aggiungere `.plugin(tauri_plugin_app::init())` al Builder in `lib.rs:739`
3. Verificare che la versione appaia correttamente nella UI

In alternativa, se non serve il plugin, sostituire la chiamata con un
comando custom esposto via `#[tauri::command]`.

### B. Rilasciare v3.4.1 (o rifare v3.4.0)

L'attuale v3.4.0 draft (id `355162075`) su GitHub e' stato buildata con
il codice VECCHIO (stdin null, devUrl, senza dev-mode fix). Va rifatto.

**Prima di rilasciare**:
1. Fixare il punto A (get_version)
2. `npm run tauri dev` → verificare Start/Stop/Status/version
3. Bump versione se necessario (3.4.1 per indicare il fix)
4. Commit, push, tag, CI
5. Pubblicare la draft come latest
6. Installare e testare la versione installata

### C. Pulizia

- v3.4.0 draft `355162075` su GitHub: cancellare o sovrascrivere
- File temporanei in `C:\Users\carlo\AppData\Local\Temp\opencode\` (MSI
  estratti, log di test)

## Stato file modificati (non committati)

- `src-tauri/src/lib.rs` — find_index_js (walk-up), find_llama_server
  (walk-up), start_mcp_child (stdin piped, stdout/stderr inherit in debug)
- `src-tauri/tauri.conf.json` — rimosso devUrl
- `documentation/RELEASE_PROCESS.md` — Step 0 + lessons #12-#15
- `NEXT_STEPS.md` — questo file

## Lezioni chiave

- **Mai** usare `Stdio::null()` per stdin di un processo che legge stdin
- **Sempre** testare con `npm run tauri dev` prima di rilasciare
- I path `../` nei resources Tauri v2 diventano `_up_/` nel bundle
- `devUrl` e' opzionale: serve solo con framework HMR, non con frontend statico
