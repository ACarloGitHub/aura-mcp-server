# Prompt per la nuova sessione

Questo è il prompt da passare a una nuova istanza di opencode che partirà
dalla cartella `W:\SviluppoProgetti\aura-mcp-server`. È scritto in
italiano perché l'utente (Carlo) legge e parla italiano; il codice e la
documentazione del progetto invece sono in inglese (pubblicati su
GitHub).

---

```text
Ciao. Stai per lavorare al progetto aura-mcp-server, un server MCP
(Model Context Protocol) per AnythingLLM e LM Studio. È in versione
2.1.0 e va rifatto in 3.0.0 con un cambio di superficie che rompe la
compatibilità.

La tua cartella di lavoro è W:\SviluppoProgetti\aura-mcp-server. Lavora
solo lì dentro. Sei in modalità build (puoi modificare file, lanciare
comandi, installare).

VINCOLO TASSATIVO

Tutto quello che sta sotto W:\SviluppoProgetti\AuraWrite\ è in sola
lettura. Non scrivere, non cancellare, non spostare, non copiare nulla
lì dentro, neanche in una directory di lavoro. Non modificare il
codice di AuraWrite nemmeno per correggere un errore evidente; se serve
qualcosa di simile, re-implementalo dentro aura-mcp-server. Se hai un
dubbio su questo vincolo, fermati e chiedi a Carlo prima di procedere.

LINGUE

- Conversazione con Carlo e questo prompt: italiano.
- Codice, commenti nei sorgenti, README, TOOLS.md, file in
  W:\SviluppoProgetti\aura-mcp-server\docs\: inglese.
- Lingua di Carlo: italiano. Rispondi in italiano quando parli con lui.

DOCUMENTI DA LEGGERE, IN QUESTO ORDINE

Prima di scrivere qualsiasi cosa, leggi e capisci:

1. W:\SviluppoProgetti\aura-mcp-server\docs\aurawrite-improvements.md
   — Lezioni apprese in AuraWrite (consolidamento, prefisso
   [INSTRUCTION: …], troncamento, schemi). È la base concettuale.

2. W:\SviluppoProgetti\aura-mcp-server\docs\client-requirements.md
   — Vincoli reali dei client ospiti (LM Studio, AnythingLLM) e della
   specifica MCP 2025-06-18. Leggi le sezioni 2 e 3 (LM Studio e
   AnythingLLM) due volte: sono i vincoli inderogabili.

3. W:\SviluppoProgetti\aura-mcp-server\docs\improvement-plan.md
   — È LA TUA GUIDA OPERATIVA. Segui le fasi 0 → 8 nell'ordine in cui
   sono scritte. Ogni fase ha una sezione "Exit criteria" e non devi
   passare alla successiva se non sono soddisfatti.

4. W:\SviluppoProgetti\aura-mcp-server\docs\Old\* — Lo snapshot della
   documentazione v2.1.0 archiviato. Non modificare nulla lì dentro.
   Usalo come contesto storico per capire perché una certa scelta
   era stata fatta prima.

REFERENCE FILES IN SOLA LETTURA (AuraWrite)

Questi sono i file di AuraWrite da cui puoi CITARE testi o prendere
spunto, mai da cui copiarli o modificarli:

- W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\AuraWrite-Wiki\concepts\tools-consolidation.md
  (leggi intero, è la strategia)
- W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\AuraWrite-Wiki\concepts\agent-tools-native.md
  (leggi intero, è il reference implementativo)
- W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\src-tauri\src\web_tools.rs
  (solo le linee 1–50, 87–100, 138–235, 281–322, 416–422: servono per
  il pattern DDG Lite POST + prefisso [INSTRUCTION: …])
- W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\src-tauri\src\planner.rs
  (solo le stringhe format! che contengono "INSTRUCTION": servono per
  i wording del planner)
- W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\src-tauri\src\permissions.rs
  (concettuale: non implementare un permission state machine, prendi
  solo l'idea di allowed-paths come env var)

Quando citi un file di AuraWrite, scrivi tra virgolette solo frammenti
brevi e necessari; non riprodurre interi paragrafi.

REGOLE DI ESECUZIONE

- Lavora nell'ordine indicato dal piano. Fase 0 (baseline) → Fase 8
  (build & version bump).
- Tratta ogni sezione "Exit criteria" come un gate: non passare
  avanti finché non passa.
- Se una fase è bloccata per qualunque motivo (test rosso, scope
  incerto, presupposto errato), FERMATI. Non tentare di attaccare
  la fase successiva per compensare. Scrivi a Carlo cosa è andato
  storto e cosa serve.
- Non introdurre nuove dipendenze in package.json senza la conferma
  esplicita di Carlo. Lo stato attuale (solo @modelcontextprotocol/sdk)
  è sufficiente per tutto il piano v3.0.
- Non aggiungere strumenti che non esistono già in v2.1.0. Esplicito:
  niente editor_edit, chat_search, chat_stats, download_image,
  get_document_images, save_image_base64, wiki_stats, plan_stats,
  rag_stats, *reset_all, *reset_project. Sono specifici di
  AuraWrite.
- Numero finale di strumenti nella `tools/list`: 11, non 13, non 14.
  I nomi sono fissi:
  file, exec, exec_job, web_search, wiki, wiki_ingest, rag, planner,
  compact, anythingllm, notify.
- web_search e notify non hanno il parametro `action`. Gli altri nove
  lo hanno come enum.
- Lingua delle descrizioni dei tool, dei messaggi all'utente, del
  README, del TOOLS.md: inglese.
- Commenti nei sorgenti: se li metti, brevi e in inglese; meglio non
  metterli affatto se il codice si spiega da solo.

CONVENZIONI DI COMMIT (se Carlo ti chiederà di committare)

- Una fase per commit.
- Messaggio in inglese. Formato suggerito:
  `feat(scoped): short summary` per le fasi 3+, `chore(scoped): …` per
  le fasi 1-2, `docs: …` per la fase 7.
- Mai committare senza che Carlo abbia confermato che la fase è ok.
  Conferma con `npm run check` e con un breve smoke test eseguito
  prima di proporre il commit.

SEGNALI DI STOP

Ferma e chiedi a Carlo se:

- Una exit criteria non passa e non sai come farla passare.
- Scopri che serve una nuova dipendenza.
- Vuoi modificare il piano (un punto di vista nuovo, una fase che
  salta, un tool che va aggiunto).
- Vedi un bug in W:\SviluppoProgetti\AuraWrite\ e ti viene l'istinto
  di correggerlo. Non farlo.
- Il client LM Studio o AnythingLLM non collabora: apri un dialog con
  Carlo sul da farsi.

COME PARTIRE

1. cd W:\SviluppoProgetti\aura-mcp-server
2. Leggi i quattro documenti elencati sopra, in ordine.
3. Apri una TODO list (con todowrite) che replica le 8 fasi del piano.
4. Esegui la fase 0 (baseline capture).
5. Procedi fase per fase, fermandoti a ogni exit criteria.

COSA RIPORTARE INDIETRO ALLA FINE

Quando hai completato la fase 8, riporta a Carlo:

- l'esito delle 8 fasi (una riga ciascuna);
- il diff riepilogativo di `tools/list` (prima 36, dopo 11);
- i test smoke eseguiti e il loro risultato;
- i file toccati, con il numero di righe modificate per ciascuno;
- i punti che ti sembrano ancora aperti o che richiedono una decisione
  di Carlo;
- conferma esplicita che W:\SviluppoProgetti\AuraWrite\ è rimasto
  intatto.

Se qualcosa va storto a metà, fermati alla fase in corso e riporta
subito, senza tentare di rattoppare.
```

---

## Note per Carlo

- Il prompt è scritto con seconde persona singolare ("stai per
  lavorare…") perché opencode processa bene input imperativi in
  italiano. Incolla il blocco di codice `text` direttamente nel
  campo di input della nuova sessione.
- Le path `W:\` sono usate alla Windows perché la macchina è
  Windows; se apri una sessione da un altro sistema operativo,
  adattale di conseguenza (ma non è lo scenario previsto).
- Il prompt è intenzionalmente "leggero" sui dettagli tecnici:
  rimanda al piano `improvement-plan.md`. Se incolli il prompt,
  apri anche quel file tu per ricordarti dove stanno le cose.
- Il prompt non menziona `node_modules` o altri file di
  zavorra: la `npm ci` copre tutto.
- Se in futuro riutilizzi questo prompt per una v4.0, riscrivi
  il blocco Reference Files (i path AuraWrite potrebbero cambiare).
