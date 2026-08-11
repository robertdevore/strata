# MEGA PROMPT: Persistent Project Memory System
## For Autonomous Agent — Continuous Implementation Loop

---

> **INSTRUCTIONS FOR THE AGENT:**
> You are an autonomous software engineer. Your goal is to implement the system described in this document **completely**, from start to finish. Work through each phase sequentially. Do not skip phases. Do not move to the next phase until the current phase's "Definition of Done" is met. If you are interrupted and resumed, read `PROGRESS.md` in the project root to determine where you left off, then continue from that point.
>
> **Your loop:**
> 1. Read this document fully.
> 2. Check for `PROGRESS.md` — if it exists, resume from the last incomplete phase.
> 3. If no `PROGRESS.md` exists, begin at Phase 0.
> 4. For each phase: implement → test → verify against Definition of Done → update `PROGRESS.md` → move to next phase.
> 5. When all phases are complete, run the final verification suite (Phase 9) and write a completion summary.
> 6. Stop only when every phase is marked COMPLETE in `PROGRESS.md` and the final verification passes.

---

## 0. PROJECT OVERVIEW

### What You Are Building

A **Persistent Project Memory** system — a local-first service that allows an AI assistant to remember information across conversations. The system captures, stores, retrieves, and manages memories about a user's projects, preferences, decisions, and codebase — so that every new conversation starts with context instead of from zero.

### Design Philosophy

- **Zero-config by default.** SQLite + local embeddings. No external services required to start. Works out of the box.
- **Local-first.** All memory data stored locally. Optional cloud sync is a future concern, not a Phase 1 concern.
- **Transparent.** The user can always see what is remembered, delete anything, and opt out entirely.
- **Non-intrusive.** Memory injection is token-efficient and relevance-scored, not a dump.
- **Phased.** Each phase is independently functional. After Phase 1, you have a working memory store. After Phase 2, you have semantic search. Etc.

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Python 3.11+ | Ecosystem, readability, fast iteration |
| Memory store | SQLite | Zero-config, ubiquitous, reliable |
| Vector store | LanceDB (local) | Local-first, no server, Python-native |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` (local) | Free, offline, fast, good enough for semantic search |
| API | FastAPI | Async, auto-docs, clean |
| CLI | Typer | Ergonomic command-line interface |
| Tests | pytest | Standard, well-supported |
| Package manager | uv or pip | Fast dependency resolution |

### Project Structure

```
persistent-project-memory/
├── PROGRESS.md                  # Agent progress tracking — YOU MAINTAIN THIS
├── README.md                    # User-facing documentation
├── pyproject.toml               # Dependencies and project config
├── src/
│   └── ppm/
│       ├── __init__.py
│       ├── config.py            # Configuration management
│       ├── models.py            # Data models / schemas
│       ├── storage/
│       │   ├── __init__.py
│       │   ├── sqlite_store.py  # SQLite CRUD operations
│       │   └── vector_store.py  # LanceDB vector operations
│       ├── capture/
│       │   ├── __init__.py
│       │   ├── explicit.py      # "Remember this" commands
│       │   ├── inferred.py      # Auto-extract from conversations
│       │   └── codebase.py      # Auto-analyze project structure
│       ├── retrieval/
│       │   ├── __init__.py
│       │   ├── search.py        # Semantic + keyword search
│       │   └── ranking.py       # Relevance scoring and ranking
│       ├── lifecycle/
│       │   ├── __init__.py
│       │   ├── decay.py         # Confidence decay over time
│       │   ├── conflict.py      # Contradiction detection & resolution
│       │   └── dedup.py         # Deduplication
│       ├── injection/
│       │   ├── __init__.py
│       │   └── context_builder.py  # Build context for assistant injection
│       ├── api/
│       │   ├── __init__.py
│       │   └── server.py        # FastAPI REST API
│       ├── cli/
│       │   ├── __init__.py
│       │   └── main.py          # CLI entry point
│       └── utils/
│           ├── __init__.py
│           └── secrets.py       # Secret detection / redaction
├── tests/
│   ├── conftest.py
│   ├── test_storage.py
│   ├── test_capture.py
│   ├── test_retrieval.py
│   ├── test_lifecycle.py
│   ├── test_injection.py
│   ├── test_api.py
│   ├── test_cli.py
│   └── test_e2e.py
└── examples/
    ├── integration_example.py   # How an assistant would integrate
    └── demo_script.sh           # End-to-end demo
```

---

## 1. MEMORY DATA MODEL

### Memory Schema

Every memory is a structured record with the following fields:

```python
@dataclass
class Memory:
    id: str                    # UUID v4
    project_id: str            # Which project this memory belongs to
    content: str               # The actual memory text
    memory_type: MemoryType    # See enum below
    tags: list[str]            # User or system tags (e.g., ["decision", "architecture"])
    confidence: float          # 0.0–1.0, decays over time, boosted on re-access
    source: MemorySource       # How this memory was captured
    created_at: datetime       # UTC timestamp
    updated_at: datetime       # UTC timestamp of last modification
    last_accessed_at: datetime # UTC timestamp of last retrieval
    access_count: int          # How many times this memory has been retrieved
    embedding: list[float]     # Vector embedding of content (384-dim for MiniLM)
    related_ids: list[str]     # IDs of related/superseded memories
    metadata: dict             # Arbitrary structured metadata
```

### Memory Types

```python
class MemoryType(Enum):
    PREFERENCE       = "preference"        # "User prefers tabs over spaces"
    DECISION         = "decision"          # "We chose PostgreSQL over MongoDB"
    FACT             = "fact"              # "The API base URL is /api/v2"
    TODO             = "todo"              # "Need to add export feature"
    ARCHITECTURE     = "architecture"      # "Frontend is React, backend is FastAPI"
    CONVENTION       = "convention"        # "Tests go in /tests, named test_*.py"
    CONTEXT          = "context"           # "User is building a SaaS for dentists"
    ERROR_LOG        = "error_log"         # "Last deploy failed due to port conflict"
    RELATIONSHIP     = "relationship"      # "Function X depends on module Y"
    NOTE             = "note"              # General purpose catch-all
```

### Memory Sources

```python
class MemorySource(Enum):
    EXPLICIT    = "explicit"     # User said "remember this"
    INFERRED    = "inferred"     # Auto-extracted from conversation
    CODEBASE    = "codebase"     # Auto-detected from file analysis
    IMPORTED    = "imported"     # Imported from external file
```

### Project Schema

```python
@dataclass
class Project:
    id: str                     # UUID v4
    name: str                   # Human-readable project name
    root_path: str              # Absolute path to project root
    created_at: datetime        # UTC timestamp
    metadata: dict              # Project-level metadata
    active: bool                # Is this the current project?
```

---

## 2. PHASE-BY-PHASE IMPLEMENTATION

### Phase 0: Project Scaffolding

**Tasks:**
1. Create the full directory structure shown above.
2. Create `pyproject.toml` with all dependencies:
   - `fastapi`, `uvicorn`, `typer`, `pydantic`, `lancedb`, `sentence-transformers`, `numpy`, `python-dateutil`
   - Dev dependencies: `pytest`, `pytest-asyncio`, `httpx` (for API testing)
3. Create `src/ppm/__init__.py` with version string.
4. Create `PROGRESS.md` with the phase checklist (see template below).
5. Create empty `README.md` placeholder.
6. Verify the project installs: `pip install -e .` (or `uv pip install -e .`).

**Definition of Done:**
- [ ] Directory structure matches the spec exactly.
- [ ] `pyproject.toml` is valid and all dependencies resolve.
- [ ] `pip install -e .` succeeds without errors.
- [ ] `python -c "import ppm"` succeeds.
- [ ] `PROGRESS.md` exists with all phases listed and Phase 0 marked COMPLETE.

**PROGRESS.md Template:**
```markdown
# Implementation Progress

## Status
- Started: [timestamp]
- Current Phase: [phase number]
- Overall: [X/10 phases complete]

## Phase Checklist
- [x] Phase 0: Project Scaffolding — COMPLETE
- [ ] Phase 1: Core Storage Layer (SQLite + Models)
- [ ] Phase 2: Vector Embeddings & Semantic Search
- [ ] Phase 3: Memory Capture (Explicit + Inferred)
- [ ] Phase 4: Memory Retrieval & Ranking
- [ ] Phase 5: Memory Lifecycle (Decay, Conflict, Dedup)
- [ ] Phase 6: Codebase Analysis & Auto-Capture
- [ ] Phase 7: Context Injection Builder
- [ ] Phase 8: REST API + CLI
- [ ] Phase 9: Integration, Testing, Polish & Final Verification

## Notes
[Any decisions made, issues encountered, deviations from spec]
```

---

### Phase 1: Core Storage Layer (SQLite + Models)

**Tasks:**

1. **`src/ppm/models.py`** — Implement all dataclasses and enums from Section 1. Use Pydantic `BaseModel` for validation. Include `to_dict()` and `from_dict()` methods on every model. Include `to_db_row()` and `from_db_row()` for SQLite serialization (lists and dicts become JSON strings).

2. **`src/ppm/config.py`** — Configuration management:
   - Default database path: `~/.ppm/memory.db`
   - Default vector store path: `~/.ppm/vectors/`
   - Default embedding model: `all-MiniLM-L6-v2`
   - Config file: `~/.ppm/config.json` (auto-created on first run)
   - All paths overridable via environment variables: `PPM_DB_PATH`, `PPM_VECTOR_PATH`, `PPM_EMBEDDING_MODEL`
   - `get_config()` function that loads/creates config.

3. **`src/ppm/storage/sqlite_store.py`** — Full SQLite CRUD:
   - `init_db(db_path)` — Create tables if not exist. Tables: `memories`, `projects`, `memory_index` (tags).
   - `create_memory(memory: Memory) -> Memory` — Insert, return with generated ID.
   - `get_memory(memory_id: str) -> Memory | None`
   - `update_memory(memory_id: str, updates: dict) -> Memory | None`
   - `delete_memory(memory_id: str) -> bool`
   - `list_memories(project_id: str, filters: dict | None = None) -> list[Memory]` — Support filtering by type, tags, source, date range.
   - `search_memories_keyword(project_id: str, query: str, limit: int = 10) -> list[Memory]` — SQLite FTS or LIKE-based keyword search.
   - `create_project(project: Project) -> Project`
   - `get_project(project_id: str) -> Project | None`
   - `get_project_by_name(name: str) -> Project | None`
   - `list_projects() -> list[Project]`
   - `set_active_project(project_id: str) -> None`
   - `get_active_project() -> Project | None`
   - `delete_project(project_id: str) -> bool` — Also deletes all memories for that project.

4. **SQL Schema** (create in `init_db`):
   ```sql
   CREATE TABLE IF NOT EXISTS projects (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL UNIQUE,
       root_path TEXT NOT NULL,
       created_at TEXT NOT NULL,
       metadata TEXT DEFAULT '{}',
       active INTEGER DEFAULT 0
   );

   CREATE TABLE IF NOT EXISTS memories (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       content TEXT NOT NULL,
       memory_type TEXT NOT NULL,
       tags TEXT DEFAULT '[]',
       confidence REAL DEFAULT 1.0,
       source TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       last_accessed_at TEXT NOT NULL,
       access_count INTEGER DEFAULT 0,
       related_ids TEXT DEFAULT '[]',
       metadata TEXT DEFAULT '{}',
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
   );

   CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
   CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
   ```

5. **Tests** (`tests/test_storage.py`):
   - Test create/get/update/delete memory.
   - Test list with filters.
   - Test keyword search.
   - Test project CRUD and active project switching.
   - Test cascade delete (deleting project deletes memories).
   - Test that DB auto-creates on first access.
   - Use a temp directory for test databases.

**Definition of Done:**
- [ ] All models implemented with serialization methods.
- [ ] Config management works with defaults and env var overrides.
- [ ] All SQLite CRUD operations implemented and tested.
- [ ] `pytest tests/test_storage.py` passes with 100% of tests green.
- [ ] No hardcoded paths — everything uses config.
- [ ] `PROGRESS.md` updated: Phase 1 marked COMPLETE.

---

### Phase 2: Vector Embeddings & Semantic Search

**Tasks:**

1. **`src/ppm/storage/vector_store.py`** — LanceDB vector store:
   - `init_vector_store(vector_path: str, dim: int = 384)` — Create LanceDB table if not exists.
   - `add_embedding(memory_id: str, embedding: list[float], content: str, project_id: str)` — Insert vector.
   - `update_embedding(memory_id: str, embedding: list[float], content: str)` — Update vector.
   - `delete_embedding(memory_id: str)` — Remove vector.
   - `search_similar(query_embedding: list[float], project_id: str, limit: int = 10) -> list[dict]` — Return list of `{memory_id, score, content}` sorted by cosine similarity descending.
   - `get_embedding(memory_id: str) -> list[float] | None`

2. **Embedding generation** — In `vector_store.py` or a separate `embeddings.py`:
   - `get_embedder(model_name: str)` — Lazy-load sentence-transformers model (singleton, don't reload every call).
   - `embed(text: str) -> list[float]` — Generate embedding for a single text.
   - `embed_batch(texts: list[str]) -> list[list[float]]` — Batch embedding for efficiency.
   - Handle model download on first use gracefully (log progress).
   - Model is cached after first load.

3. **Integration with SQLite store** — When a memory is created or updated:
   - Generate embedding from `content`.
   - Store embedding in LanceDB via `add_embedding`.
   - When a memory is deleted, also delete its embedding.
   - Create a `MemoryStore` facade class in `storage/__init__.py` that wraps both SQLite and vector store, so callers don't need to manage two stores:
     ```python
     class MemoryStore:
         def __init__(self, config: Config): ...
         def add_memory(self, content, memory_type, ...) -> Memory: ...
         def search(self, query: str, project_id: str, limit: int = 10) -> list[SearchResult]: ...
         def delete_memory(self, memory_id: str) -> bool: ...
         # etc.
     ```

4. **Tests** (`tests/test_storage.py` or new `tests/test_vector.py`):
   - Test add/search/delete embeddings.
   - Test that semantic search returns relevant results (e.g., "database choice" query finds "We chose PostgreSQL" memory).
   - Test batch embedding.
   - Test MemoryStore facade end-to-end: add memory → search → get relevant result.
   - Use temp directories for test vector stores.

**Definition of Done:**
- [ ] LanceDB vector store implemented with all CRUD operations.
- [ ] Embedding model loads lazily and is cached as singleton.
- [ ] `MemoryStore` facade unifies SQLite + vector operations.
- [ ] Semantic search returns relevant results (verify with at least 3 test cases).
- [ ] `pytest tests/test_vector.py` passes.
- [ ] `PROGRESS.md` updated: Phase 2 marked COMPLETE.

---

### Phase 3: Memory Capture (Explicit + Inferred)

**Tasks:**

1. **`src/ppm/capture/explicit.py`** — Explicit capture (user says "remember this"):
   - `parse_remember_command(text: str) -> MemoryInput | None` — Detect phrases like:
     - "remember that ..."
     - "remember: ..."
     - "note that ..."
     - "don't forget that ..."
     - "keep in mind that ..."
   - Returns a structured `MemoryInput` with extracted content and best-guess `memory_type` (heuristic: if it contains "prefer" → PREFERENCE, if it contains "chose/decided/picked" → DECISION, if it contains "need to/should/TODO" → TODO, etc.).
   - `capture_explicit(text: str, project_id: str, store: MemoryStore) -> Memory` — Full pipeline: parse → classify → create memory in store.

2. **`src/ppm/capture/inferred.py`** — Inferred capture (auto-extract from conversation):
   - `extract_memories_from_conversation(messages: list[dict], project_id: str) -> list[MemoryInput]` — Analyze a conversation and extract candidate memories:
     - **Decisions:** "Let's use X", "We'll go with Y", "I've decided on Z"
     - **Preferences:** "I like X", "I prefer Y", "I always use Z"
     - **Facts:** "The API is at X", "The port is Y", "It's deployed on Z"
     - **TODOs:** "We need to X", "I still have to Y", "Don't forget to Z"
     - **Architecture:** "The frontend is X", "We're using Y for the backend"
   - Use pattern matching + heuristics (regex + keyword detection). Do NOT require an LLM — this must work offline. Keep it rule-based and deterministic.
   - Each extracted memory should have a `confidence` score (0.5–0.8 for inferred, lower than explicit).
   - `capture_inferred(messages: list[dict], project_id: str, store: MemoryStore) -> list[Memory]` — Full pipeline: extract → store all.

3. **`src/ppm/utils/secrets.py`** — Secret detection:
   - `detect_secrets(text: str) -> list[SecretMatch]` — Scan for:
     - API keys (patterns like `sk-...`, `AKIA...`, `ghp_...`, `xoxb-...`)
     - Passwords (`password = "..."`, `passwd: ...`)
     - Private keys (`-----BEGIN ... PRIVATE KEY-----`)
     - Connection strings with credentials (`mongodb://user:pass@...`, `postgres://user:pass@...`)
     - Bearer tokens (`Bearer ...`)
   - `redact_secrets(text: str) -> str` — Replace detected secrets with `[REDACTED]`.
   - `contains_secrets(text: str) -> bool` — Quick check.
   - **CRITICAL:** No memory containing detected secrets should ever be stored. The capture pipeline must call `contains_secrets()` before storing and skip/log a warning if secrets are found.

4. **Tests** (`tests/test_capture.py`):
   - Test `parse_remember_command` with 10+ variations of "remember" phrasing.
   - Test memory type classification heuristics.
   - Test `extract_memories_from_conversation` with sample conversations containing decisions, preferences, facts, TODOs.
   - Test that low-confidence is assigned to inferred memories.
   - Test secret detection with all secret types.
   - Test that secrets are never stored (capture pipeline blocks them).
   - Test redaction replaces secrets with `[REDACTED]`.

**Definition of Done:**
- [ ] Explicit capture parses 10+ "remember" phrasings correctly.
- [ ] Inferred capture extracts memories from sample conversations with >70% precision (no obvious junk).
- [ ] Secret detection catches all listed secret types and blocks storage.
- [ ] `pytest tests/test_capture.py` passes.
- [ ] `PROGRESS.md` updated: Phase 3 marked COMPLETE.

---

### Phase 4: Memory Retrieval & Ranking

**Tasks:**

1. **`src/ppm/retrieval/search.py`** — Unified search:
   - `search(query: str, project_id: str, store: MemoryStore, limit: int = 10) -> list[SearchResult]` — Combines:
     - **Semantic search** (vector similarity) — weight: 0.6
     - **Keyword search** (SQLite FTS/LIKE) — weight: 0.3
     - **Tag matching** (if query contains known tags) — weight: 0.1
   - Returns `SearchResult` objects: `{memory: Memory, score: float, match_type: str}`.
   - Scores are normalized to 0.0–1.0.

2. **`src/ppm/retrieval/ranking.py`** — Relevance ranking:
   - `rank(results: list[SearchResult], context: dict | None = None) -> list[SearchResult]` — Apply ranking boosts/penalties:
     - **Recency boost:** Memories from the last 7 days get +0.1, last 30 days +0.05.
     - **Access frequency boost:** Memories accessed >5 times get +0.05.
     - **Confidence boost:** Higher confidence memories rank higher (already factored in base score, but apply a multiplier: confidence < 0.5 gets -0.1).
     - **Type priority:** If context indicates the user is asking about architecture, boost ARCHITECTURE/CONVENTION types. If asking about tasks, boost TODO types. Heuristic-based.
     - **Decay penalty:** Apply decayed confidence (see Phase 5) as a multiplier.
   - Final score = base_search_score * confidence * recency_multiplier + boosts. Clamp to 0.0–1.0.

3. **`SearchResult` model:**
   ```python
   @dataclass
   class SearchResult:
       memory: Memory
       score: float           # Final ranked score 0.0–1.0
       semantic_score: float  # Raw vector similarity
       keyword_score: float   # Raw keyword match score
       match_type: str        # "semantic", "keyword", "hybrid", "tag"
   ```

4. **Tests** (`tests/test_retrieval.py`):
   - Test semantic search returns relevant results.
   - Test keyword search returns relevant results.
   - Test hybrid search combines both effectively.
   - Test ranking: recency boost, access frequency boost, confidence penalty.
   - Test that results are sorted by final score descending.
   - Test limit is respected.
   - Test empty query returns empty list (not all memories).
   - Test search within a project doesn't leak memories from other projects.

**Definition of Done:**
- [ ] Unified search combines semantic + keyword + tag matching.
- [ ] Ranking applies all specified boosts and penalties.
- [ ] Results are correctly sorted and limited.
- [ ] Project isolation is enforced (no cross-project leakage).
- [ ] `pytest tests/test_retrieval.py` passes.
- [ ] `PROGRESS.md` updated: Phase 4 marked COMPLETE.

---

### Phase 5: Memory Lifecycle (Decay, Conflict, Dedup)

**Tasks:**

1. **`src/ppm/lifecycle/decay.py`** — Confidence decay:
   - `apply_decay(memory: Memory, now: datetime | None = None) -> float` — Calculate decayed confidence:
     - Base confidence starts at the memory's `confidence` value.
     - Decay rate: 1% per week of non-access (compound).
     - Accessing a memory resets decay (boosts confidence back toward original by +0.1 per access, capped at original value).
     - Minimum confidence floor: 0.1 (memories never fully decay to zero — they can be archived but not auto-deleted).
   - `decay_all(project_id: str, store: MemoryStore) -> int` — Apply decay to all memories in a project, return count of updated memories.
   - `archive_low_confidence(project_id: str, store: MemoryStore, threshold: float = 0.15) -> int` — Move memories below threshold to an "archived" state (set `metadata.archived = True`). Return count archived.

2. **`src/ppm/lifecycle/conflict.py`** — Contradiction detection:
   - `detect_contradiction(new_memory: Memory, existing_memories: list[Memory]) -> Memory | None` — Check if a new memory contradicts an existing one:
     - Same `memory_type` + same `tags` + semantically similar content (cosine similarity > 0.75) but meaningfully different → potential contradiction.
     - Use embedding similarity + simple negation detection ("not", "no longer", "switched from X to Y", "replaced", "changed", "updated").
     - If contradiction detected, return the conflicting existing memory.
   - `resolve_contradiction(new_memory: Memory, old_memory: Memory, store: MemoryStore) -> Memory` — Resolution strategy:
     - Mark old memory as superseded: set `metadata.superseded = True`, add `new_memory.id` to `old_memory.related_ids`.
     - New memory gets `related_ids` pointing to old memory.
     - New memory inherits the old memory's access_count (knowledge continuity).
     - Old memory's confidence is set to 0.0 (effectively retired but not deleted — user can review).

3. **`src/ppm/lifecycle/dedup.py`** — Deduplication:
   - `find_duplicates(project_id: str, store: MemoryStore, similarity_threshold: float = 0.92) -> list[tuple[Memory, Memory]]` — Find pairs of memories with cosine similarity above threshold.
   - `merge_duplicates(memory_a: Memory, memory_b: Memory, store: MemoryStore) -> Memory` — Merge strategy:
     - Keep the one with higher confidence (or more recent if equal).
     - Merge tags (union).
     - Merge metadata (merge dicts).
     - Add the other memory's ID to `related_ids`.
     - Delete the lower-confidence duplicate.
     - Sum access counts.

4. **Tests** (`tests/test_lifecycle.py`):
   - Test decay: verify confidence decreases over time without access.
   - Test decay: verify confidence recovers with access.
   - Test decay: verify minimum floor of 0.1.
   - Test archiving: memories below threshold get archived.
   - Test contradiction detection: "We use PostgreSQL" vs "We switched to MongoDB" is detected.
   - Test contradiction resolution: old memory is superseded, new memory links to old.
   - Test dedup: two near-identical memories are found and merged.
   - Test merge: tags unioned, access counts summed, lower-confidence deleted.

**Definition of Done:**
- [ ] Decay function correctly reduces confidence over time and recovers with access.
- [ ] Contradiction detection catches at least the "switched from X to Y" pattern.
- [ ] Dedup finds and merges near-identical memories.
- [ ] `pytest tests/test_lifecycle.py` passes.
- [ ] `PROGRESS.md` updated: Phase 5 marked COMPLETE.

---

### Phase 6: Codebase Analysis & Auto-Capture

**Tasks:**

1. **`src/ppm/capture/codebase.py`** — Analyze a project directory and auto-capture memories:
   - `analyze_codebase(root_path: str, project_id: str, store: MemoryStore) -> list[Memory]` — Scan a project and generate memories:
     - **Language detection:** Check file extensions (`.py` → Python, `.ts`/`.tsx` → TypeScript, `.go` → Go, etc.).
     - **Framework detection:** Check `package.json` for React/Vue/Next, `pyproject.toml`/`requirements.txt` for FastAPI/Django/Flask, `go.mod` for Gin/Echo, `Cargo.toml` for Actix/Axum.
     - **Database detection:** Look for ORM imports, migration files, connection strings (redacted).
     - **Project structure:** Detect `src/` layout, test directory, config files.
     - **Conventions:** Detect indentation (tabs vs spaces), naming conventions from sample files, test naming patterns.
     - **Dependencies:** Extract key dependencies from manifest files.
   - Each finding becomes a memory with `source = CODEBASE` and `memory_type` appropriate (ARCHITECTURE, CONVENTION, FACT).
   - Confidence for codebase memories: 0.9 (high — these are observed facts, not guesses).
   - **Respect `.gitignore`:** Do not scan `node_modules/`, `.git/`, `__pycache__/`, `venv/`, `dist/`, `build/`, or any path in `.gitignore`.
   - **File size limit:** Skip files > 1MB. Skip binary files (detect by null bytes in first 8KB).
   - **Rate limit:** Process at most 500 files to avoid long scans on huge repos.

2. **`detect_project_info(root_path: str) -> dict`** — Return structured info:
   ```python
   {
       "languages": ["Python", "TypeScript"],
       "frameworks": ["FastAPI", "React"],
       "database": "PostgreSQL",
       "structure": {"src": True, "tests": True, "docs": False},
       "conventions": {"indentation": "spaces", "indent_size": 4},
       "key_dependencies": ["fastapi==0.104.1", "react==18.2.0"],
       "test_framework": "pytest"
   }
   ```

3. **Tests** (`tests/test_capture.py` — add to existing or create `tests/test_codebase.py`):
   - Create a mock project directory in a temp folder with known files (a `pyproject.toml`, a `.py` file with spaces, a `package.json` with React).
   - Test that `analyze_codebase` correctly detects language, framework, conventions.
   - Test that `.gitignore` is respected.
   - Test that `node_modules/` and `__pycache__/` are skipped.
   - Test that binary files are skipped.
   - Test that generated memories have correct type and source.

**Definition of Done:**
- [ ] Codebase analysis detects languages, frameworks, databases, structure, conventions.
- [ ] `.gitignore` and common ignore patterns are respected.
- [ ] Binary and large files are skipped.
- [ ] Generated memories are correct type and source.
- [ ] `pytest tests/test_codebase.py` passes.
- [ ] `PROGRESS.md` updated: Phase 6 marked COMPLETE.

---

### Phase 7: Context Injection Builder

**Tasks:**

1. **`src/ppm/injection/context_builder.py`** — Build context to inject into an assistant's prompt:
   - `build_context(query: str, project_id: str, store: MemoryStore, token_budget: int = 1500) -> str` — Full pipeline:
     1. Search for relevant memories (Phase 4 search + ranking).
     2. Apply current decay (Phase 5).
     3. Filter out archived and superseded memories.
     4. Select top memories that fit within `token_budget` (estimate tokens as `len(text) // 4`).
     5. Format into a structured, token-efficient string.
   - Output format:
     ```
     ## Project Memory

     ### Architecture
     - Frontend: React 18 + TypeScript
     - Backend: FastAPI (Python 3.11)
     - Database: PostgreSQL

     ### Decisions
     - Chose PostgreSQL over MongoDB for relational data needs (2024-01-15)

     ### Preferences
     - User prefers tabs over spaces
     - User prefers functional components over class components

     ### Active TODOs
     - Add export feature to dashboard

     ### Relevant Context
     - API base URL is /api/v2
     - Deploy target is AWS ECS
     ```
   - Group memories by `memory_type`. Within each group, sort by relevance score descending.
   - If no relevant memories found, return empty string (not a "no memories" message — save tokens).
   - `estimate_tokens(text: str) -> int` — Simple estimation: `len(text) // 4`.

2. **`get_project_summary(project_id: str, store: MemoryStore) -> str`** — A condensed one-paragraph summary of the project for quick context:
   - Pull ARCHITECTURE and FACT memories.
   - Format as: "Project: X. Stack: Y. Database: Z. Deployed on: W."

3. **Tests** (`tests/test_injection.py`):
   - Test that context is built from relevant memories.
   - Test that memories are grouped by type.
   - Test that token budget is respected (output doesn't exceed budget).
   - Test that archived and superseded memories are excluded.
   - Test that empty memory store returns empty string.
   - Test project summary generation.

**Definition of Done:**
- [ ] Context builder produces well-formatted, grouped, token-budgeted output.
- [ ] Archived and superseded memories are excluded.
- [ ] Token budget is respected.
- [ ] `pytest tests/test_injection.py` passes.
- [ ] `PROGRESS.md` updated: Phase 7 marked COMPLETE.

---

### Phase 8: REST API + CLI

**Tasks:**

1. **`src/ppm/api/server.py`** — FastAPI REST API:
   - **Projects:**
     - `POST /projects` — Create project `{name, root_path}`
     - `GET /projects` — List all projects
     - `GET /projects/{id}` — Get project
     - `DELETE /projects/{id}` — Delete project (cascades to memories)
     - `POST /projects/{id}/activate` — Set as active project
   - **Memories:**
     - `POST /memories` — Create memory `{project_id, content, memory_type, tags}`
     - `GET /memories` — List memories (query params: `project_id`, `memory_type`, `tag`, `limit`)
     - `GET /memories/{id}` — Get specific memory
     - `PUT /memories/{id}` — Update memory
     - `DELETE /memories/{id}` — Delete memory
   - **Search:**
     - `POST /search` — Search memories `{query, project_id, limit}`
     - `POST /context` — Build injection context `{query, project_id, token_budget}`
   - **Capture:**
     - `POST /capture/explicit` — Capture from "remember" command `{text, project_id}`
     - `POST /capture/inferred` — Capture from conversation `{messages, project_id}`
     - `POST /capture/codebase` — Analyze codebase `{root_path, project_id}`
   - **Lifecycle:**
     - `POST /lifecycle/decay` — Apply decay to a project `{project_id}`
     - `POST /lifecycle/dedup` — Find and merge duplicates `{project_id}`
     - `GET /lifecycle/contradictions/{project_id}` — List detected contradictions
   - **Transparency:**
     - `GET /memories/all` — List ALL memories for a project (for user review)
     - `DELETE /memories/purge/{project_id}` — Delete all memories for a project
   - All endpoints return proper HTTP status codes and JSON.
   - Auto-generated OpenAPI docs at `/docs`.
   - CORS enabled for localhost.
   - API key auth via `X-API-Key` header (optional, configurable, disabled by default for local use).

2. **`src/ppm/cli/main.py`** — CLI using Typer:
   - `ppm init` — Initialize PPM in current directory (create config, create project).
   - `ppm project list` — List projects.
   - `ppm project create <name>` — Create a project.
   - `ppm project activate <name>` — Set active project.
   - `ppm remember <text>` — Store an explicit memory.
   - `ppm memories list` — List memories (flags: `--type`, `--tag`, `--limit`).
   - `ppm memories search <query>` — Search memories.
   - `ppm memories delete <id>` — Delete a memory.
   - `ppm memories show <id>` — Show full memory details.
   - `ppm context <query>` — Build and print injection context.
   - `ppm analyze [path]` — Analyze codebase and auto-capture.
   - `ppm decay [project_id]` — Apply confidence decay.
   - `ppm dedup [project_id]` — Find and merge duplicates.
   - `ppm export [project_id] --format json|csv` — Export memories.
   - `ppm import <file>` — Import memories from JSON.
   - `ppm serve [--port 8765]` — Start the REST API server.
   - `ppm status` — Show system status (active project, memory count, DB path, vector store path).
   - Colored output using `rich` (add to dependencies).
   - `--help` on every command.

3. **Tests** (`tests/test_api.py`, `tests/test_cli.py`):
   - API tests: use FastAPI `TestClient`. Test every endpoint. Test error cases (404 for missing memory, 400 for bad input).
   - CLI tests: use `typer.testing.CliRunner`. Test every command. Test output format.

**Definition of Done:**
- [ ] All REST API endpoints implemented and tested.
- [ ] All CLI commands implemented and tested.
- [ ] API docs accessible at `/docs`.
- [ ] `pytest tests/test_api.py tests/test_cli.py` passes.
- [ ] `ppm status` works and shows useful info.
- [ ] `PROGRESS.md` updated: Phase 8 marked COMPLETE.

---

### Phase 9: Integration, Testing, Polish & Final Verification

**Tasks:**

1. **`examples/integration_example.py`** — A complete example showing how an AI assistant would integrate:
   ```python
   from ppm import MemoryStore, build_context, capture_explicit, capture_inferred

   # Initialize
   store = MemoryStore.from_config()
   project = store.get_or_create_project("my-app", "/path/to/project")

   # At conversation start, inject context
   context = build_context("what are we working on?", project.id, store)
   system_prompt += context  # Inject into assistant's system prompt

   # During conversation, capture memories
   capture_explicit("remember that we use Redis for caching", project.id, store)
   capture_inferred(conversation_messages, project.id, store)

   # At conversation end, run lifecycle
   store.apply_decay(project.id)
   store.dedup(project.id)
   ```

2. **`examples/demo_script.sh`** — A bash script that:
   - Initializes PPM.
   - Creates a project.
   - Adds several memories (explicit + codebase analysis).
   - Searches for memories.
   - Builds context.
   - Shows status.
   - Exports memories.
   - Cleans up.

3. **`tests/test_e2e.py`** — End-to-end integration tests:
   - Full lifecycle: create project → add memories → search → build context → apply decay → dedup → export → re-import → verify integrity.
   - Multi-project: create two projects, add memories to each, verify no cross-contamination.
   - Secret safety: attempt to store a memory with an API key, verify it's blocked.
   - Contradiction: store "we use X", then store "we switched to Y", verify contradiction handling.
   - Codebase analysis: create a mock project, analyze it, verify memories, search for them.

4. **`README.md`** — Full user documentation:
   - What PPM is and why it exists.
   - Installation instructions.
   - Quick start guide.
   - CLI reference.
   - API reference (link to `/docs`).
   - Integration guide for AI assistants.
   - Configuration options.
   - Privacy & security notes.
   - Architecture overview.

5. **Final cleanup:**
   - Remove any debug print statements.
   - Ensure all files have appropriate module docstrings.
   - Run `pytest` with no args — ALL tests must pass.
   - Run `pytest --tb=short` and verify no warnings (or only acceptable ones).
   - Verify `pip install -e .` works cleanly.
   - Verify `ppm --help` works.
   - Verify `ppm serve` starts and `/docs` is accessible.

6. **Write completion summary** to `PROGRESS.md`:
   ```markdown
   ## Completion Summary
   - All phases: COMPLETE
   - Total tests: [N]
   - All tests passing: YES
   - Key features delivered:
     - [list]
   - Known limitations:
     - [list]
   - Suggested future enhancements:
     - [list]
   ```

**Definition of Done:**
- [ ] Integration example is complete and runnable.
- [ ] Demo script runs successfully.
- [ ] All end-to-end tests pass.
- [ ] README is comprehensive and accurate.
- [ ] `pytest` (full suite) passes with all tests green.
- [ ] `pip install -e .` works cleanly.
- [ ] `ppm --help` and `ppm serve` work.
- [ ] No debug print statements in source.
- [ ] `PROGRESS.md` shows all phases COMPLETE with completion summary.
- [ ] **THE PROJECT IS FINISHED.**

---

## 3. EDGE CASES TO HANDLE

Handle these throughout implementation — don't wait for Phase 9:

1. **First run with no config** → Auto-create config directory and files. No errors, no prompts.
2. **Empty database** → All operations return empty lists, not errors.
3. **Duplicate project name** → Reject with clear error message.
4. **Memory with empty content** → Reject with validation error.
5. **Secret in memory content** → Block storage, log warning, return error to caller.
6. **Very long memory content** (>10,000 chars) → Truncate to 10,000 chars with a `[truncated]` marker. Still embed and store.
7. **Corrupt SQLite database** → Detect on open, back up the corrupt file, create a fresh database. Log the event.
8. **Embedding model download fails** → Fall back to keyword-only search. Log a warning. Don't crash.
9. **Concurrent access** → SQLite handles this with WAL mode. Enable `PRAGMA journal_mode=WAL` in `init_db`.
10. **Project switching** → Always scope queries by `project_id`. Never return memories from the wrong project. The active project is a convenience, not a security boundary — all operations require explicit `project_id`.

---

## 4. QUALITY BAR

Before marking the project as finished, verify:

| Criterion | Target |
|-----------|--------|
| Test coverage | All modules have tests. >90% of public functions tested. |
| Zero-config | `pip install -e . && ppm init` works with no other setup. |
| Search latency | <500ms for semantic search on <10,000 memories. |
| Context build latency | <500ms including search + formatting. |
| Token efficiency | Context injection stays within budget, uses ~1500 tokens default. |
| Secret safety | No secret is ever stored. Verified by test. |
| Project isolation | No cross-project memory leakage. Verified by test. |
| Graceful degradation | System works (keyword-only) even if embeddings fail. |
| Code quality | No debug prints, clear docstrings, consistent style. |
| Documentation | README covers install, usage, integration, and config. |

---

## 5. AUTONOMOUS AGENT RULES

1. **Always update `PROGRESS.md` after completing each phase.** This is your checkpoint. If you are interrupted and resumed, this is how you know where to pick up.
2. **Run tests after every phase.** Do not accumulate technical debt. If tests fail, fix them before moving on.
3. **Do not skip phases.** Each phase builds on the previous one. Skipping will cause integration failures.
4. **If you encounter a problem not covered in this spec**, make a reasonable decision, document it in `PROGRESS.md` under "Notes", and continue. Do not stop and wait for input.
5. **If a dependency won't install or has a compatibility issue**, find an alternative that works and document the substitution in `PROGRESS.md`.
6. **Write clean code.** Type hints, docstrings, consistent naming. This is a real project, not a prototype.
7. **Prefer composition over inheritance.** Keep modules decoupled. The `MemoryStore` facade is the main integration point.
8. **Handle errors gracefully.** No unhandled exceptions in normal operation. Log errors, return meaningful messages.
9. **When you finish the entire project**, run the full test suite one final time, verify every quality bar criterion, and write the completion summary in `PROGRESS.md`.
10. **You are done when:** All phases are COMPLETE in `PROGRESS.md`, all tests pass, and the completion summary is written. Do not declare done prematurely.

---

## 6. SUMMARY

You are building a **Persistent Project Memory** system that gives an AI assistant long-term memory across conversations. It captures memories (explicit, inferred, and from codebase analysis), stores them locally (SQLite + LanceDB), retrieves them via semantic + keyword search, manages their lifecycle (decay, contradiction resolution, deduplication), and injects relevant context into future conversations — all behind a REST API and CLI, with zero-config defaults and strict secret protection.

Work through Phases 0–9 sequentially. Update `PROGRESS.md` after each phase. Run tests after each phase. Do not stop until everything is complete and verified.

**Begin now.**