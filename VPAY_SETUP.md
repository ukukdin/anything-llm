# vpay-chatbot Setup

vpay-specific configuration on top of AnythingLLM v1.12.1. This file lives
on `vpay/main` and is not synced to upstream `master`.

## Recommended Korean RAG Stack

For Korean-language documents and questions, the following stack gives the
best quality with low operational overhead:

| Layer       | Provider                                          | Why                                                                                  |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Embeddings  | **Ollama + `bge-m3`**                             | Strong multilingual model, runs locally, free                                        |
| Reranker    | **Cohere `rerank-v3.5`** (hosted)                 | Multilingual cross-encoder, large quality jump over the bundled MS-MARCO MiniLM      |
| Text split  | Built-in `RecursiveSplitter` (vpay sentence list) | Splits on Korean sentence endings (`다. `, `요. `, `까? ` etc.) and English (`. `)   |
| Vector DB   | LanceDB (default)                                 | No setup, file-based, sufficient for single-instance deployments                     |

## Quick Start

### 1. Embeddings — Ollama + bge-m3

```bash
ollama pull bge-m3
```

Settings → AI Providers → Embedder Preference:

- Embedder Provider: **Ollama**
- Ollama Base URL: `http://host.docker.internal:11434` (docker) or `http://127.0.0.1:11434` (bare metal)
- Embedding Model: `bge-m3`
- Max Embedding Chunk Length: `8192`

Or equivalent env vars:

```bash
EMBEDDING_ENGINE='ollama'
EMBEDDING_BASE_PATH='http://127.0.0.1:11434'
EMBEDDING_MODEL_PREF='bge-m3'
EMBEDDING_MODEL_MAX_CHUNK_LENGTH=8192
```

### 2. Reranker — Cohere (vpay addition)

Get an API key at https://dashboard.cohere.com.

Settings → AI Providers → **Reranker**:

- Reranker Provider: **Cohere Rerank (hosted)**
- Cohere API Key: `<your-key>`
- Rerank Model: `rerank-v3.5` (default)

Or equivalent env vars:

```bash
EMBEDDING_RERANKER='cohere'
COHERE_RERANKER_API_KEY=<your-key>
COHERE_RERANKER_MODEL='rerank-v3.5'
```

The reranker is invoked only when a workspace has Vector Search Mode set to
**Rerank**. Toggle it in Workspace Settings → Vector Database → Search
Preference.

### 3. Chunking

Settings → AI Providers → Text Splitting & Chunking:

- Text Chunk Size: `1000` (or up to `8192` for `bge-m3`)
- Text Chunk Overlap: `100`

Korean/English sentence-aware separators are applied automatically by
`server/utils/TextSplitter/index.js`. No additional config needed.

## What vpay Changed vs. Upstream

| File                                                            | Change                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `server/utils/EmbeddingRerankers/cohere/index.js`               | New — Cohere v2 rerank API client                                                               |
| `server/utils/helpers/index.js`                                 | Added `getEmbeddingRerankerSelection()` helper                                                  |
| `server/utils/vectorDbProviders/lance/index.js`                 | Reranker call goes through the helper instead of hardcoded native                               |
| `server/utils/agents/aibitat/utils/toolReranker.js`             | Reranker call goes through the helper instead of hardcoded native                               |
| `server/utils/helpers/updateENV.js`                             | Added env keys + validator for `EmbeddingReranker`, `CohereRerankerApiKey`, `CohereRerankerModel` |
| `server/models/systemSettings.js`                               | Exposes reranker settings via `currentSettings()`                                                |
| `server/utils/TextSplitter/index.js`                            | Korean + English sentence-aware default separator list                                          |
| `server/.env.example`                                           | Documents new reranker env vars                                                                 |
| `frontend/src/pages/GeneralSettings/RerankerPreference/`        | New admin page for reranker selection                                                           |
| `frontend/src/main.jsx`                                         | Route `/settings/reranker-preference`                                                           |
| `frontend/src/utils/paths.js`                                   | Path helper `paths.settings.embedder.rerankerPreference()`                                       |
| `frontend/src/components/SettingsSidebar/index.jsx`             | Sidebar entry for the reranker page                                                             |

## Verifying the Setup

1. Upload a Korean document to a workspace.
2. Workspace Settings → Vector Database → Search Preference = **Rerank**.
3. Ask a question that requires precise retrieval.
4. Server logs should show `[CohereEmbeddingReranker] Reranked N documents…`
   instead of `[NativeEmbeddingReranker] Reranking N documents…`.
