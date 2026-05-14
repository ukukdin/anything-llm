# VPay 챗봇 운영 가이드

> 정리일: 2026-05-14
> 라이브 URL: https://vpay-docs.eum714211.workers.dev/
> 코드 베이스: AnythingLLM v1.12.1 fork, branch `vpay/main`

---

## 1. 한눈에 보기

| 항목 | 값 |
|---|---|
| 사용자 진입점 | https://vpay-docs.eum714211.workers.dev/ (우하단 챗봇 버블) |
| 챗봇 백엔드 | 사용자 노트북 `localhost:3001` (AnythingLLM) |
| 외부 노출 | Cloudflare Quick Tunnel → `*.trycloudflare.com` |
| LLM | **Groq llama-3.1-8b-instant** (무료 tier, cloud) |
| 임베딩 | **Ollama bge-m3** (로컬, 1024차원) |
| 벡터 DB | LanceDB (파일 기반) |
| 청크 크기 | 800 자 |
| 워크스페이스 | `VPay` (7개 문서, embed UUID `4249e431-a6e2-49f1-873a-95bd0f8f1718`) |
| Reranker | 코드 통합 완료 (Cohere/native) — 현재 비활성, 데이터 작아서 효과 미미 |
| 평균 응답 속도 | 1초대 (TPM 누적 시 가끔 5-15초) |

---

## 2. 현재 라이브 상태

### 2.1 사용자가 보는 챗봇

```
┌───────────────────────────────┐
│ vpay         [⋮] [✕]          │ ← 헤더 (vpay 워드마크 좌측)
├───────────────────────────────┤
│ [브이페이 고객센터 운영시간]    │ ← greeting (줄바꿈 보존)
│ 월-일 : 09:30 ~ 18:00 KST     │
│ 점심 12:00 ~ 13:00 KST        │
│                                │
│ 안녕하세요 브이페이 한국어     │
│ 지원고객센터 입니다.            │
│ 원하시는 문의 유형 선택 혹은   │
│ 대화로 물어봐주세요.           │
├───────────────────────────────┤
│ [고액 송금 문의 (1천만원 이상)] │ ← 빠른 버튼 5개
│ [송금한도 문의]                 │
│ [회원·계정 문의]                │
│ [인증 문의]                     │
│ [기타 송금 문의]                │
├───────────────────────────────┤
│ [Send a message     ] [→]      │
└───────────────────────────────┘
  Reset Chat
```

페이지 우하단 트리거: 💬 채팅 말풍선 아이콘 (네이비 색상).

### 2.2 백엔드 흐름

```
사용자 브라우저
    ↓ (vpay-docs HTML 로드)
Cloudflare Workers (vpay-docs)
    ↓ (widget script src 로드)
Cloudflare Tunnel (Quick)
    ↓
사용자 노트북 localhost:3001 (AnythingLLM 서버)
    ├─ [임베딩] Ollama bge-m3 (localhost:11434) — 쿼리 1024-d 벡터화 ~0.3s
    ├─ [검색] LanceDB → top-3 청크
    └─ [생성] Groq llama-3.1-8b API 호출 ~0.5-1s
            ↓ (스트리밍)
사용자 브라우저
```

---

## 3. 적용된 변경사항 (vpay 커스텀)

### 3.1 AnythingLLM 코드 (이미 git push됨)

| 파일 | 변경 내용 |
|---|---|
| `server/utils/EmbeddingRerankers/cohere/index.js` | 신규 — Cohere v2 rerank API |
| `server/utils/helpers/index.js` | `getEmbeddingRerankerSelection()` helper |
| `server/utils/vectorDbProviders/lance/index.js` | reranker 호출을 helper로 추상화 |
| `server/utils/agents/aibitat/utils/toolReranker.js` | 동일 |
| `server/utils/helpers/updateENV.js` | reranker env 검증 |
| `server/models/systemSettings.js` | reranker 상태 노출 |
| `server/utils/TextSplitter/index.js` | 한국어 문장 separator 추가 |
| `server/index.js` | dev 모드에서 `/embed/*` 정적 서빙 (tunnel 통과용) |
| `frontend/src/pages/GeneralSettings/RerankerPreference/index.jsx` | 신규 — Reranker admin UI |
| `frontend/src/main.jsx` | `/settings/reranker-preference` 라우트 |
| `frontend/src/utils/paths.js` | path helper |
| `frontend/src/components/SettingsSidebar/index.jsx` | 사이드바 항목 |
| `server/.env.example` | reranker env 문서화 |
| `VPAY_SETUP.md` | 초기 RAG 셋업 가이드 |

### 3.2 워크스페이스 설정 (DB)

```sql
-- VPay 워크스페이스
chatMode = 'query'                      -- RAG only, 외부 지식 차단
openAiTemp = 0.1                        -- 일관성
similarityThreshold = 0.25              -- 약한 매칭도 포함
topN = 3                                -- TPM 절약
openAiHistory = 5                       -- 히스토리 5개만
vectorSearchMode = 'default'            -- reranker off
openAiPrompt = [정중한 상담원 system prompt — 11개 규칙]
```

### 3.3 System Prompt (요약)

11개 규칙:
1. 문서 컨텍스트 기반만 답변 (할루시네이션 금지)
2. 부분 답변 가능하면 하고 나머지만 거절
3. 완전 모르면 고객센터 안내
4. VPay 무관 질문 거절
5. 숫자는 문서 표기 그대로 (단위 환산 금지)
6. 한국어만 (영어/중국어 섞임 금지)
7. 정중한 상담원 톤 (~드립니다)
8. **표는 마크다운 표 문법 직접, 코드 펜스(```) 금지**
9. 절차는 번호 리스트
10. 단순 답은 1-2 문장
11. 머리말("물론입니다") 금지

### 3.4 시스템 설정

```sql
-- system_settings 테이블
text_splitter_chunk_size = 800
text_splitter_chunk_overlap = 100
```

### 3.5 Embed Widget 설정 (DB embed_configs)

```sql
uuid = '4249e431-a6e2-49f1-873a-95bd0f8f1718'
enabled = 1
chat_mode = 'query'
allowlist_domains = '["https://vpay-docs.eum714211.workers.dev"]'
message_limit = 50
max_chats_per_day = 1000
workspace_id = VPay 워크스페이스 id
```

### 3.6 vpay-docs HTML widget snippet

`docs-site/index.html` `</body>` 직전:

```html
<script
  data-embed-id="4249e431-a6e2-49f1-873a-95bd0f8f1718"
  data-base-api-url="https://<tunnel-url>.trycloudflare.com/api/embed"
  data-assistant-name="브이페이 한국어 지원 고객센터"
  data-brand-image-url="/vpay-logo.svg"
  data-assistant-icon="/vpay-mark.svg"
  data-greeting="[브이페이 고객센터 운영시간]
월-일 : 09:30 ~ 18:00 KST
점심 12:00 ~ 13:00 KST

안녕하세요 브이페이 한국어 지원고객센터 입니다.
원하시는 문의 유형 선택 혹은 대화로 물어봐주세요."
  data-default-messages="고액 송금 문의 (1천만원 이상),송금한도 문의,회원·계정 문의,인증 문의,기타 송금 문의"
  data-button-color="#0f172a"
  data-chat-icon="chatBubble"
  data-no-sponsor="true"
  data-position="bottom-right"
  src="https://<tunnel-url>.trycloudflare.com/embed/anythingllm-chat-widget.min.js"
  defer
></script>
```

추가 CSS (greeting 줄바꿈 + 로고 좌측):

```css
.allm-text-sm.allm-py-4.allm-text-center {
  white-space: pre-line;
  text-align: left;
  line-height: 1.55;
  padding-left: 16px;
  padding-right: 16px;
}
img[alt="Brand"] {
  margin-right: auto;
  margin-left: 16px;
  max-width: 120px !important;
  max-height: 40px !important;
}
img[alt="Anything LLM Icon"] {
  border-radius: 6px;
}
```

### 3.7 vpay 문서 (vpay 워크스페이스에 들어간 7개)

| # | 파일 | 내용 |
|---|---|---|
| 01 | `01_overview.md` | VPay 서비스 소개, **베트남 LIVE / 태국·필리핀·인도네시아 COMING** |
| 02 | `02_signup_auth.md` | 회원가입, 본인인증 |
| 03 | `03_remittance_flow.md` | 송금 절차, **건당 USD 3,000 / 연 USD 50,000** |
| 04 | `04_fees_exchange_limits.md` | **수수료 0.5% 이하**, 환율, 한도 |
| 05 | `05_wallet_troubleshoot.md` | 월렛 트러블슈팅 |
| 06 | `06_faq.md` | FAQ |
| 07 | `07_vpayv_landing.md` | vpayv.com 공식 정보 (회사 정보, 라이센스, 고객센터) |

모든 fact가 vpayv.com 기준으로 통일됨 (이전 17개국/구간별 KRW 수수료 모순 정리 완료).

---

## 4. 운영 한계 (현재 알려진 것)

| # | 문제 | 영향 | 해결 방법 |
|---|---|---|---|
| 1 | **Quick tunnel URL 변동** | cloudflared 재시작 시 URL 바뀜 → widget 깨짐 | 도메인 + Named tunnel로 영구 해결 |
| 2 | **노트북 의존** | 노트북 닫으면 챗봇 다운 | 회사 PC / VPS 이전 |
| 3 | **Groq 무료 TPM 6,000/min** | 연속 다발 요청 시 가끔 5-15초로 늘어남 | Groq Dev tier ($10/월, TPM 30K) |
| 4 | **무료 tier 데이터 학습 사용** | Groq 약관상 입력 데이터가 학습에 쓰일 수 있음 | Dev tier 결제하면 제외 |
| 5 | **API 키 노출** | 채팅 transcript에 Groq/Cohere 키가 남음 | 사용 후 revoke + 새 키 발급 권장 |

---

## 5. 다음 단계 — 운영 옵션 비교

| 옵션 | 월 비용 | 24/7 | 한국 latency | 권장 케이스 |
|---|---|---|---|---|
| 현재 노트북 + Quick tunnel | $0 (~$0.10 API) | ❌ | 50ms | 데모, 개인 사용 |
| 회사 PC + Quick tunnel | $0 | 업무시간만 | 50ms | 사내 동료 한정 |
| 회사 PC + Named tunnel + 도메인 | $1 (도메인) | 업무시간만 | 50ms | 사내 베타 |
| **Vultr Seoul 2GB NVMe** | **$12** | ✅ | 50ms | **본격 운영 시작점 — 추천** |
| Vultr Seoul 4GB | $24 | ✅ | 50ms | 사용자 증가 시 |
| AWS Lightsail Seoul 4GB | $24 | ✅ | 50ms | AWS 인프라 친숙할 때 |
| Hetzner CX22 (핀란드) | $4.50 | ✅ | 200ms+ | 비용만 따지면 |
| AnythingLLM Hosted | $50 | ✅ | 변동 | 운영 인력 없을 때 |

### LLM 옵션

| Provider | 가격 | 속도 | 한국어 품질 |
|---|---|---|---|
| **Groq llama-3.1-8b (무료)** | $0 | 0.5-1초 | 좋음 (현재) |
| Groq llama-3.3-70b (무료) | $0 | 5-15초 | 매우 좋음 |
| OpenAI gpt-4o-mini | $0.15 + $0.60/1M tokens | 1-2초 | 최상 |
| Anthropic Claude Haiku | $1.00 + $5.00/1M tokens | 1-2초 | 최상 |

일 50명 사용 기준 API 비용은 모든 옵션에서 $1-3/월 이내.

---

## 6. 멀티 유저 대화 격리

| 단위 | 격리 |
|---|---|
| 다른 PC/스마트폰 | ✅ 완전 분리 (각자 새 sessionId) |
| 같은 PC, 다른 브라우저 | ✅ 분리 (localStorage 다름) |
| 시크릿 모드 | ✅ 매번 새 세션 |
| 같은 PC + 같은 브라우저 | ⚠️ 같은 sessionId, 대화 이어짐 (공용 PC 주의) |

`embed_chats` 테이블에 `(embed_id, session_id)` 키로 저장. LLM 컨텍스트에는 본인 세션 히스토리만 들어감 → 다른 사용자 대화 노출 0.

**민감 정보 입력 시 주의**: Groq 무료 tier는 데이터를 학습에 사용 가능. 카드번호/주민번호 등 직접 입력 막는 시스템 프롬프트 강화 권장.

---

## 7. 자주 쓰는 명령어

### 7.1 dev 환경 (현재 노트북)

```bash
# 서버 시작
cd /Users/eom-inguk/Documents/vpay-chatbot/server && yarn dev

# 프론트 시작 (admin UI 보려면)
cd /Users/eom-inguk/Documents/vpay-chatbot/frontend && yarn dev

# Cloudflare Tunnel 시작 (Quick)
cloudflared tunnel --url http://localhost:3001

# Ollama 상태 확인
ollama list
ollama ps
```

### 7.2 워크스페이스 데이터 조작

```bash
# 워크스페이스/문서 상태 확인
sqlite3 /Users/eom-inguk/Documents/vpay-chatbot/server/storage/anythingllm.db \
  "SELECT name, slug, chatMode, topN, similarityThreshold FROM workspaces;"

# embed 상태 확인
sqlite3 /Users/eom-inguk/Documents/vpay-chatbot/server/storage/anythingllm.db \
  "SELECT uuid, enabled, allowlist_domains FROM embed_configs;"

# 전체 재임베딩 (storage 백업 후)
cd /Users/eom-inguk/Documents/vpay-chatbot/server
mv storage/lancedb storage/lancedb.backup-$(date +%Y%m%d-%H%M%S)
mv storage/vector-cache storage/vector-cache.backup-$(date +%Y%m%d-%H%M%S)
node scripts/reembed-all.js

# 새 문서 추가 + 임베딩 (vpayv.com 정보 패턴)
node scripts/add-vpayv-landing.js
```

### 7.3 vpay-docs 사이트 배포

```bash
cd /Users/eom-inguk/Documents/vpay/vpaybackend/docs-site
pnpm build
cd /Users/eom-inguk/Documents/vpay/vpaybackend
CLOUDFLARE_API_TOKEN=<token> npx wrangler@latest deploy
```

### 7.4 라이브 동작 빠른 검증

```bash
# Tunnel URL 가져오기 (cloudflared 백그라운드 출력에서)
# 예: https://candle-tennessee-seeker-caring.trycloudflare.com

URL=https://<tunnel-url>.trycloudflare.com
UUID=4249e431-a6e2-49f1-873a-95bd0f8f1718
SESSION=$(uuidgen)

curl -s -N -X POST \
  -H "Origin: https://vpay-docs.eum714211.workers.dev" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION\",\"message\":\"수수료가 얼마인가요?\"}" \
  "$URL/api/embed/$UUID/stream-chat"
```

---

## 8. 파일/디렉토리 매핑

```
/Users/eom-inguk/Documents/vpay-chatbot/                  ← 챗봇 백엔드 코드
├── server/
│   ├── storage/                                          ← ⚠️ 옮길 때 통째로
│   │   ├── anythingllm.db                                  워크스페이스 DB
│   │   ├── documents/custom-documents/                     업로드 문서 JSON
│   │   ├── lancedb/                                         벡터 인덱스 (재임베딩 가능)
│   │   ├── vector-cache/                                   임베딩 캐시
│   │   ├── lancedb.backup-*                                백업 (안전하면 삭제)
│   │   └── vector-cache.backup-*                           동일
│   ├── .env.development                                   ← ⚠️ Groq 키 등 (git X)
│   ├── scripts/
│   │   ├── reembed-all.js                                  전체 재임베딩
│   │   └── add-vpayv-landing.js                            새 문서 추가 예시
│   └── utils/...                                           코드 (git에 있음)
├── frontend/...                                           AnythingLLM 어드민 UI
└── VPAY_*.md                                              가이드 문서

/Users/eom-inguk/Documents/vpay/vpaybackend/              ← vpay-docs 사이트
├── docs-site/
│   ├── index.html                                          widget snippet 들어있음
│   ├── public/
│   │   ├── vpay-logo.svg                                   헤더용 워드마크
│   │   └── vpay-mark.svg                                   메시지 옆 V 마크
│   └── dist/                                                빌드 결과 (wrangler 배포 대상)
└── wrangler.jsonc                                          CF Workers 배포 설정
```

---

## 9. 트러블슈팅

### "Server error" 응답 / 응답 없음

1. **AnythingLLM 서버 죽음** → `lsof -iTCP -sTCP:LISTEN -P | grep 3001`로 확인. 없으면 `yarn dev` 재시작.
2. **Ollama 죽음** → `curl http://127.0.0.1:11434/api/version`. 안 되면 `ollama serve` 또는 앱 재실행.
3. **Cloudflared 죽음** → 백그라운드 프로세스 확인, 없으면 재시작 (URL 바뀜).
4. **Groq rate limit** → 로그에 `rate_limit_exceeded` 검색. TPM 6000 초과 시 60초 대기 또는 70b로 변경.

### Widget이 화면에 안 보임

1. **Origin 검증 실패** → embed_configs의 `allowlist_domains`에 현재 사이트 origin 정확히 일치하는지 확인.
2. **Tunnel URL 바뀜** → docs-site의 `data-base-api-url`과 `src` URL 둘 다 새 tunnel URL로 갱신 후 재배포.
3. **CSS 충돌** → 브라우저 devtools에서 위젯 element 확인.

### 답변 품질 떨어짐 / 할루시네이션

1. **문서 모순** → vpay 워크스페이스 문서들 끼리 fact가 일관되는지 확인.
2. **chunkSize 너무 큼** → system_settings의 `text_splitter_chunk_size` 1500 이하로.
3. **topN 너무 많음** → 워크스페이스 `topN` 조정.

### 검색 결과 잘못됨

```bash
# 벡터 검색 결과 직접 확인
cd /Users/eom-inguk/Documents/vpay-chatbot/server
node -e "
require('dotenv').config({ path: '.env.development' });
process.env.STORAGE_DIR = 'storage';
const { getVectorDbClass, getEmbeddingEngineSelection } = require('./utils/helpers');
(async () => {
  const VDB = getVectorDbClass();
  const embedder = getEmbeddingEngineSelection();
  const r = await VDB.performSimilaritySearch({
    namespace: 'vpay',
    input: '여기에 질문',
    LLMConnector: { embedTextInput: (t) => embedder.embedTextInput(t) },
    similarityThreshold: 0.25,
    topN: 4,
  });
  (r.sources || []).forEach((s,i) => console.log(\`[\${i+1}] \${s.title} score=\${s.score?.toFixed(3)}\`));
})();
"
```

---

## 10. 결정 대기 중

다음 결정 후 진행할 수 있는 작업:

- [ ] 운영 환경 선택 (현재 노트북 / 회사 PC / Vultr / AWS)
- [ ] 도메인 구매 여부 (~$10/year, Named tunnel용)
- [ ] Cohere Reranker 활성화 여부 (문서 늘면 효과 있음)
- [ ] vpay 문서 추가 (가이드, 약관, FAQ 확장 등)

결정되면 같이 진행할 수 있도록 준비된 상태입니다.

---

## 11. 핵심 참고 자료

| 외부 사이트 | 용도 |
|---|---|
| https://console.groq.com | Groq API 키 발급/revoke, 사용량 |
| https://dashboard.cohere.com | Cohere reranker 키 (현재 미사용) |
| https://dash.cloudflare.com | Workers/Pages 관리, 도메인 |
| https://docs.anythingllm.com | AnythingLLM 공식 문서 |
| https://github.com/Mintplex-Labs/anything-llm | 업스트림 |
| https://github.com/ukukdin/anything-llm | 사용자 fork (vpay/main 브랜치) |
