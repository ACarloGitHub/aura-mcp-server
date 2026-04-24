╔═══════════════════════════════════════╗
║      AGENT SERVER — HELP SHEET       ║
║  MCP commands for LM Studio          ║
╚═══════════════════════════════════════╝

compact
  memory     Compact MEMORY.md (>300 lines → archive)
  session    Compact session: "Folder/file.conversation.json"
  status     Show memory and session status
  list       List compacted sessions

planner
  create     Create plan: name=Name content="markdown..."
  read       Read plan: name=Name
  list       List all plans
  update     Update plan: name=Name content="..."
  delete     Delete plan: name=Name
  next       Next step: name=Name [answer="reply"]

rag
  search     Search: collection=sessions|entities query="text"
  add        Add: collection id text [metadata]
  list       List: collection=Name [limit=N]
  delete     Delete: collection=Name id=ID
  collections  List all collections
  extract_entities  Extract entities from a collection

wiki
  search     Search pages: query="text"
  read       Read page: path="category/file.md"
  write      Write page: path="..." content="..."
  list       List pages

wiki_ingest
  ingest     Load raw source: source="file.md"
  query      Search wiki: query_text="..."
  lint       Wiki health check
  update_index  Regenerate wiki index
  update_log   Append log: source="description"

web_search
  Search online: query="text" [count=N]

exec
  Run shell command: command="cmd"

read
  Read file: path="file" [offset=N] [limit=N]

write
  Write file: path="file" content="text"
