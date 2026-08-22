# Next Steps — aura-mcp-server

Ultimo aggiornamento: 2026-08-22

## Obiettivo corrente: release v3.6.3 (compattazione più intelligente)

### Modifiche implementate (v3.6.3)

1. **Primo scambio completo nel seed** — `compact(session)` ora include nel nuovo
   chat file anche la risposta dell'assistente al primo messaggio utente
   (`src/tools/compact.ts`, `pickKept`).
2. **Riduzione progressiva della coda** — se la stima supera il 50% del contesto:
   prima si riduce da 2 a 1 exchange e si riverifica; solo restando over budget si
   cade sul fallback "solo riassunto" (prima si scartavano tutti i messaggi subito).
3. **Stima ricalcolata a ogni passo** — il tool response e la riga `Modalità` del
   seed `.md` riflettono ciò che è stato davvero mantenuto.
4. **Documentazione** — `documentation/compaction.md` allineata al nuovo comportamento.

### Da fare

- [x] Bump a 3.6.3 (package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json).
- [x] Commit, push main, tag v3.6.3.
- [ ] CI verde (3 job + release), source archive corretto, pubblica draft come latest.
- [ ] Verifiche con l'agente in LM Studio (dopo installazione):
  - `compact(action=session)` su una chat lunga → il seed contiene primo scambio
    completo + ultime 2 exchanges;
  - stessa chat con `contextLength` basso forzato (`AURA_COMPACT_CONTEXT_LENGTH`) →
    coda ridotta a 1 exchange; con budget ancora minore → solo riassunto;
  - il file originale non viene modificato.

## Contesto precedente

- v3.6.2 (rilasciata): compact robusto con reasoning model, estrazione answer-only.
- v3.6.1 (rilasciata): niente console in --serve, no outputSchema su compact/exec_job,
  batch 2048, ingest in background.
- v3.6.0 (rilasciata): compact(session), RAG per client, wiki→RAG, windowsHide.

## Lezioni chiave

- Mai riscrivere un `.conversation.json` esistente (LM Studio lo cache): scrivere solo file nuovi.
- I file chat LM Studio si chiamano `<createdAt>.conversation.json`; il contesto caricato è in
  `lastUsedModel.instanceLoadTimeConfig` (oggetti `{key, value}`).
- Tool MCP con `outputSchema`: OGNI azione deve restituire `structuredContent`, altrimenti
  un client strict (LM Studio) rifiuta con `-32600`. Preferire niente `outputSchema` sui
  multi-azione.
- llama-server: default `--batch-size` 512 → i chunk oltre quel limite falliscono con HTTP 500.
- Le operazioni lunghe (embedding CPU) superano il timeout del client MCP: eseguirle in
  sottofondo e farle monitorare con polling.
