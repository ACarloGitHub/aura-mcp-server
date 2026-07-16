# Release Process — aura-mcp-server

Procedura operativa per pubblicare una nuova release su GitHub.
Adattata da AuraWrite (`W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\documentation\RELEASE_PROCESS.md`)
e validata con v3.1.0 (2026-07-10).

## Prerequisiti

- Repository `main` allineato con la versione che si vuole rilasciare.
- Versione bumpata in **tre** posti prima del tag, mai dopo:
  - `package.json` → `"version": "X.Y.Z"`
  - `src-tauri/Cargo.toml` → `version = "X.Y.Z"`
  - `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
- Token GitHub con scope `repo` (per la CLI `gh`).
- `gh` autenticato (`gh auth status` deve mostrare l'account giusto).

## Step 1 — Verifica pre-flight (PRIMA del tag)

Controlla queste cose **prima** di pushare il tag, perché dopo è più
scomodo tornare indietro:

```bash
# 1. Tutti i file icona sono PNG validi (non ICO rinominati)
#    Il bug di v3.1.0 era proprio questo: 32x32.png era un ICO
Get-ChildItem src-tauri/icons/*.png | ForEach-Object {
  $b = [System.IO.File]::ReadAllBytes($_.FullName)[0..3]
  # PNG valido inizia con 89 50 4E 47
  if (-join ($b | ForEach-Object { $_.ToString("x2") }) -ne "89504e47") {
    Write-Warning "$($_.Name) NON è un PNG valido!"
  }
}

# 2. Versione coerente nei 3 posti
$pkg = (Get-Content package.json | ConvertFrom-Json).version
$cargo = (Select-String -Path src-tauri/Cargo.toml -Pattern '^version\s*=').Matches[0].Value -replace '.*"([^"]+)".*','$1'
$conf = (Get-Content src-tauri/tauri.conf.json | ConvertFrom-Json).version
Write-Output "package=$pkg  cargo=$cargo  tauri.conf=$conf"
# devono essere uguali

# 3. package.json script "tauri" DEVE essere "tauri" (NON "tauri build")
(Get-Content package.json | ConvertFrom-Json).scripts.tauri
# atteso: "tauri"

# 4. tauri.conf.json beforeBuildCommand DEVE essere "npm run build"
(Get-Content src-tauri/tauri.conf.json | ConvertFrom-Json).build.beforeBuildCommand
# atteso: "npm run build"

# 5. .github/workflows/release.yml usa tauri-action@v0 (non @v1)
Select-String -Path .github/workflows/release.yml -Pattern 'tauri-action'
# atteso: tauri-apps/tauri-action@v0

# 6. Node LTS 22+ in CI e npm ci SENZA --ignore-scripts.
#    better-sqlite3 12.x NON ha prebuilt per Node 20 (EOL): con Node 20
#    prebuild-install cade su node-gyp che NON riconosce VS2026 (v. Lesson #10).
#    Con Node 22 il prebuilt esiste e npm ci non compila nulla.
Select-String -Path .github/workflows/release.yml -Pattern 'node-version'
# atteso: "22" (o LTS corrente)
Select-String -Path .github/workflows/release.yml -Pattern 'npm ci'
# atteso: npm ci   (NO --ignore-scripts: i node_modules vanno bundlati)
(Get-Content package.json | ConvertFrom-Json).engines.node
# atteso: ">=22.0.0"

# 7. cargo clean -p <crate-name> presente (forza re-embed frontend)
#    crate name è in src-tauri/Cargo.toml [package] name = "..."
Select-String -Path .github/workflows/release.yml -Pattern 'cargo clean'
# atteso: cargo clean -p auramcp-server

# 8. bundle.targets include i formati giusti
(Get-Content src-tauri/tauri.conf.json | ConvertFrom-Json).bundle.targets
# atteso: msi, nsis, dmg, deb, rpm, app (NO appimage, vedi "Lessons learned")
```

Se uno di questi controlli fallisce, **sistema prima** di pushare il tag.

## Step 2 — Commit e push di main

```bash
git add -A
git commit -m "..."  # messaggio conventional (feat/fix/refactor/...)
git push origin main
```

## Step 3 — Crea e pusha il tag

```bash
git tag -a vX.Y.Z -m "vX.Y.Z: descrizione breve delle modifiche"
git push origin vX.Y.Z
```

Il push del tag innesca automaticamente `.github/workflows/release.yml`.

## Step 4 — Monitora la CI

```bash
gh run list --repo ACarloGitHub/aura-mcp-server --limit 1
gh run watch <run-id>
```

Attendi che tutti e 3 i job (`windows-latest`, `macos-latest`,
`ubuntu-latest`) siano verdi e che anche il job `release` finisca.

Se un job fallisce:

1. **NON** ricreare subito il tag. Prima leggi i log per capire la causa.
2. Sistema il problema (di solito: file icona invalido, versione non bumpata, script npm sbagliato).
3. Cancella il tag, committa il fix, ricrea il tag, pusha di nuovo.

```bash
# Per cancellare e ricreare il tag:
git push origin --delete vX.Y.Z
git tag -d vX.Y.Z
git tag -a vX.Y.Z -m "..."
git push origin vX.Y.Z
```

## Step 5 — Pubblica la draft come latest (MANUALE)

La CI crea la release in stato **draft**. Va pubblicata a mano.

⚠️ **IMPORTANTE**: `make_latest` deve essere la stringa `"true"`, non il
booleano `true`. Se passi un booleano, l'API restituisce 422.

```powershell
# Scrivi il body JSON in UTF-8 senza BOM (altrimenti GitHub rifiuta con HTTP 400)
[System.IO.File]::WriteAllText(
  "release_update.json",
  '{"draft": false, "make_latest": "true"}',
  [System.Text.UTF8Encoding]::new($false)
)

# Esegui il PATCH (sostituisci <release-id> con l'id della draft)
gh api -X PATCH repos/ACarloGitHub/aura-mcp-server/releases/<release-id> `
  --input release_update.json

# Verifica
gh release list --repo ACarloGitHub/aura-mcp-server
# deve mostrare vX.Y.Z con "Latest"

# Cleanup
Remove-Item release_update.json
```

### Come trovare il release-id della draft

```powershell
gh api repos/ACarloGitHub/aura-mcp-server/releases `
  | ConvertFrom-Json `
  | Where-Object { $_.draft -and $_.tag_name -eq "vX.Y.Z" } `
  | Select-Object -ExpandProperty id
```

## Step 6 — Verifica finale

1. Vai su https://github.com/ACarloGitHub/aura-mcp-server/releases
2. Conferma che `vX.Y.Z` sia marcata come **Latest**
3. Scarica un asset per ogni piattaforma e prova a installarlo (sanity check)
4. Verifica che la descrizione della release abbia il changelog generato
   correttamente (sezioni "What's new" / "Improvements" / "Breaking")

## Lessons learned (da v3.1.0)

Problemi reali incontrati e risolti. Da controllare OGNI volta prima di
rilasciare.

### 1. `npm run tauri build` produceva `tauri build build`

Lo script npm `tauri` era `"tauri build"`. tauri-action esegue
`npm run tauri build` → `tauri build build` → errore "unexpected argument".

**Fix**: in `package.json`:
```json
"scripts": { "tauri": "tauri" }
```

### 2. `bundle.resources` rifiutato da Tauri v2

La forma `{src, target}` per piattaforma non è valida in Tauri v2.
`BundleResources` accetta solo array di globs.

**Fix**: in `src-tauri/tauri.conf.json`:
```json
"resources": [
  "../vendor/llama.cpp/windows/*",
  "../vendor/llama.cpp/macos/*",
  "../vendor/llama.cpp/linux/*"
]
```
(si bundla tutto su tutte le piattaforme; spreca ~40 MB ma funziona)

### 3. `npm ci` falliva su Windows con errore Visual Studio

`better-sqlite3` prova a compilare da sorgente via node-gyp su Windows
se manca il prebuilt. La CI Windows non ha Visual Studio.

**Fix**: `npm ci --ignore-scripts` salta la compilazione nativa.
I moduli nativi (better-sqlite3, sqlite-vec) non servono durante la build
della CI: servono solo a runtime dell'app installata, e l'utente finale
li compilerà localmente col proprio Node.js.

### 4. Windows MSI/NSIS richiedono icona `.ico`

Il `bundle.icon` di default era solo `icons/icon.png`. Windows cerca un
`.ico` per gli installer e panicca in `tauri::generate_context!()`.

**Fix**: rigenera il set di icone con `npx tauri icon icons/icon.png`.
Aggiunge automaticamente `.ico`, `.icns`, e tutte le risoluzioni PNG.

### 5. Linux AppImage falliva con `linuxdeploy`

`linuxdeploy` (per AppImage) non gestiva bene i resource pesanti
(`vendor/llama.cpp/`). Probabilmente un problema noto con .so bundling.

**Fix temporaneo**: rimosso `"appimage"` da `bundle.targets`. Restano
`deb` e `rpm` per Linux.

### 6. Icon file `32x32.png` era un ICO rinominato

Causa principale del fallimento Linux in v3.1.0: il file aveva bytes
ICO (`00 00 01 00`) salvati con estensione `.png`. Tauri legge la firma
PNG e panica con "Invalid PNG signature".

**Fix**: `npx tauri icon` rigenera TUTTE le icone (PNG, ICO, ICNS, iOS,
Android, Appx) partendo da un PNG sorgente valido.

### 7. Source archive allegato era v3.0.0 invece di v3.1.0

Il job `release` di tauri-action non genera automaticamente il source
archive corretto. Nella draft è rimasto un allegato v3.0.0.

**Fix**: dopo che la CI finisce, prima di pubblicare:
```powershell
# Genera source corretto
git archive --format=tar.gz --output=auramcp-server-vX.Y.Z-source.tar.gz vX.Y.Z

# Upload sulla draft
gh release upload vX.Y.Z auramcp-server-vX.Y.Z-source.tar.gz `
  --repo ACarloGitHub/aura-mcp-server

# Cancella il vecchio allegato sbagliato (se presente)
$oldId = gh api repos/ACarloGitHub/aura-mcp-server/releases `
  | ConvertFrom-Json `
  | Where-Object { $_.tag_name -eq "vX.Y.Z" } `
  | Select-Object -ExpandProperty assets `
  | Where-Object { $_.name -match "v[0-9]+\.[0-9]+\.[0-9]+-source" -and $_.name -notmatch "vX.Y.Z" } `
  | Select-Object -ExpandProperty id

if ($oldId) {
  gh api -X DELETE "repos/ACarloGitHub/aura-mcp-server/releases/assets/$oldId"
}

# Cleanup locale
Remove-Item auramcp-server-vX.Y.Z-source.tar.gz
```

### 8. `make_latest` booleano → 422

L'API GitHub vuole la stringa `"true"` per `make_latest`, non il booleano.
Vedi Step 5 sopra.

### 9. JSON con BOM → 400

PowerShell `Out-File` aggiunge BOM UTF-8 di default. GitHub rifiuta con
"Problems parsing JSON". Usare `[System.IO.File]::WriteAllText` con
`UTF8Encoding($false)`.

### 9. `frontendDist` path

`tauri.conf.json`'s `frontendDist` is resolved **relative to `src-tauri/`**.
For aura-mcp-server the launcher frontend lives at `src-tauri/dist/`
(`index.html` + `style.css` + `app.js`), NOT at the project root's `dist/`
(which is the Node MCP server's compiled output and contains no
`index.html`).

The correct value is `"./dist"`, not `"../dist"`. Using `"../dist"`
makes the webview show `asset not found: index.html` (this exact bug
shipped in v3.2.0 and was patched in v3.2.1).

### 10. `better-sqlite3` non ha prebuilt per Node 20 → node-gyp non vede VS2026

Sintomo (CI Windows):

```
npm error prebuild-install warn install No prebuilt binaries found (target=20.x...)
npm error gyp ERR! find VS unknown version "undefined" found at ".../Visual Studio/18/Enterprise"
npm error gyp ERR! find VS could not find a version of Visual Studio 2017 or newer to use
```

Causa: Node 20 è **EOL** (aprile 2026). `better-sqlite3@12.x` pubblica
prebuilt solo per Node 22+ (ABI 127), 24 (137), 25 (141), 26 (147) — **non**
per Node 20 (ABI 115). Senza prebuilt, `prebuild-install` cade su
`node-gyp rebuild`; il node-gyp in dotto a npm 10 (10.1.0) **non riconosce
Visual Studio 2026** (v18) → build fallita.

Tentativi sbagliati (non fateli):

- `ilammy/msvc-dev-tools@v1`: il **repo non esiste più** (HTTP 404,
  "Unable to resolve action `ilammy/msvc-dev-tools`, repository not found").
- `npm_config_node_gyp` / `npm config set node_gyp`: **ignorati** da npm 10
  per gli script di lifecycle (continua a usare il node-gyp bundled 10.1.0).

**Fix**: `actions/setup-node` con `node-version: "22"` (LTS corrente).
better-sqlite3 ha il prebuilt per ABI 127, `npm ci` scarica il binario e
non compila nulla → niente problema MSVC. Aggiornare anche
`package.json` → `engines.node` a `>=22.0.0`.

### 11. Tauri v2 mappa i resource path con `../` sotto `_up_/`

Sintomo (runtime, dopo l'installazione):

```
Could not start server: dist/index.js not found beside the launcher
```

e il pannello mostra "MCP server code (dist/index.js) **Missing!**" anche
se l'installer è chiaramente più grande (i file CI sono nel bundle).

Causa: in Tauri v2 le `bundle.resources` con path `../` (fuori da
`src-tauri/`) vengono collocate in una cartella **`_up_/`** (un `_up_`
per ogni `..`). Quindi `../dist/**/*` finisce in `<resource_dir>/_up_/dist/`
— su Windows MSI/NSIS `<install_dir>/_up_/dist/index.js`, su macOS
`Contents/Resources/_up_/dist/index.js` — **non** in `<resource_dir>/dist/`.

Verificato estraendo l'MSI con `msiexec /a AuraMCP_x64_en-US.msi /qn TARGETDIR=...`:

```
AuraMCP/_up_/dist/index.js
AuraMCP/_up_/node_modules/...
```

**Fix**: il lookup runtime (`find_index_js` in `src-tauri/src/lib.rs`) deve
cercare anche `<install>/_up_/dist/index.js` e
`<resource_dir>/_up_/dist/index.js`. È la **stessa** convenzione `_up_`
già usata per `../vendor/llama.cpp` in `find_llama_server` (motivo per cui
llama-server veniva trovato ma dist/index.js no: il bundle di dist è nuovo
in v3.3.0, quello di llama.cpp esiste da prima).

> **Caveat ABI**: il binario nativo di `better-sqlite3` è pinzato all'ABI
> del node di build (Node 22 = ABI 127). L'app richiede **Node 22+**
> installato sulla macchina utente (il launcher esegue il `node` nel PATH).

## Procedura riassunta (TL;DR)

```bash
# Pre-flight: controlla icone, versioni, script (vedi Step 1)
git add -A && git commit -m "..." && git push origin main
git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z

# Monitora CI
gh run watch <run-id>

# Quando CI passa: genera e allega source corretto
git archive --format=tar.gz --output=auramcp-server-vX.Y.Z-source.tar.gz vX.Y.Z
gh release upload vX.Y.Z auramcp-server-vX.Y.Z-source.tar.gz --repo ACarloGitHub/aura-mcp-server
Remove-Item auramcp-server-vX.Y.Z-source.tar.gz

# Pubblica come latest (stringa "true", non booleano)
[System.IO.File]::WriteAllText("r.json", '{"draft":false,"make_latest":"true"}', [System.Text.UTF8Encoding]::new($false))
$id = (gh api repos/ACarloGitHub/aura-mcp-server/releases | ConvertFrom-Json | Where-Object {$_.tag_name -eq "vX.Y.Z"}).id
gh api -X PATCH repos/ACarloGitHub/aura-mcp-server/releases/$id --input r.json
Remove-Item r.json

# Verifica
gh release list --repo ACarloGitHub/aura-mcp-server
```

## Differenze rispetto ad AuraWrite

AuraWrite (vedi `AuraWrite-Wiki/procedures/github-release.md`):

- Pura Rust, niente Node.js → niente problemi di moduli nativi
- llama.cpp scaricato a runtime, non bundlato → niente problemi di
  resources pesanti con linuxdeploy
- Niente `npm ci --ignore-scripts` necessario
- Niente regen icone (le icone sono gestite diversamente)

Queste differenze sono il motivo per cui alcune sezioni di questo
documento (es. rimozione appimage, regen icone, source archive manuale)
**non** servono ad AuraWrite. Le abbiamo aggiunte perché servono a noi.