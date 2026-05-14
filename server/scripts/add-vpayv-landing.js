#!/usr/bin/env node
// vpay one-off: vpayv.com 랜딩 정보를 새 문서로 만들어 VPay 워크스페이스에 추가 + 임베딩.

const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env.development"),
});
process.env.STORAGE_DIR =
  process.env.STORAGE_DIR || path.resolve(__dirname, "..", "storage");

const prisma = require("../utils/prisma");
const { Document } = require("../models/documents");

const PAGE_CONTENT = `---
category: official_info
topic: VPay 공식 사이트(vpayv.com) 기준 서비스 정보
source: https://cigasmork.github.io/vpay-landing/ (vpayv.com 프레임 내)
published: 2026-05-14
---

# VPay 공식 서비스 정보 (vpayv.com 기준)

본 문서는 vpayv.com 공식 사이트에 명시된 정보로, 다른 내부 문서의 한도/수수료
정책과 차이가 있을 경우 본 사이트 정보가 최신 기준입니다.

## 운영사

- 회사명: 주식회사 브이파이낸셜그룹
- 고객센터: +82-1533-5845
- 주소: 서울특별시 강남구 선릉로155길 15, 2층

## 인허가

- 소액해외송금업 (금융위원회) 추진 중
- 선불전자결제업 (금융위원회) 추진 중

## 송금 지원 국가

### LIVE 서비스 (현재 송금 가능)

| 국가 | 통화 | 역할 |
| --- | --- | --- |
| 대한민국 | KRW | 송금 발송 |
| 베트남 | VND | 수취 및 발송 |

### COMING (서비스 준비 중)

| 국가 | 통화 | 역할 |
| --- | --- | --- |
| 태국 | THB | 수취 |
| 필리핀 | PHP | 수취 |
| 인도네시아 | IDR | 수취 |

현재(2026년 5월 기준) 실서비스가 가능한 송금 국가는 **베트남 1개국**입니다.

## 수수료 및 한도 정책 (사이트 명시 기준)

- 수수료: 0.5% 이하
- 건당 한도: 최대 USD 3,000
- 연간 한도: USD 50,000 (법정 기준)
- 환율: 실시간 적용
- 베트남 환전 예시: 1,000,000 KRW = 18,059,995 VND

## 처리 시간

- 일반: 수십 초에서 최대 수 분
- 베트남 사례: 수십 초
- 운영: 24시간 실시간 처리
- 99%의 거래가 수초 내 자동 승인

## 본인인증 및 보안

- AML/KYC: 자금세탁방지 및 본인확인 시스템 완비
- 본인인증 완료 시 30초면 송금 시작 가능

## 지원 채널

- iOS 앱
- Android 앱

## 수취 방법

- 은행 계좌 입금
- 모바일 지갑
- 현금 수령

(국가별 세부 수취 방법은 vpayv.com에 개별 명시되지 않음)
`;

(async function main() {
  const targetSlug = "vpay";
  const workspace = await prisma.workspaces.findFirst({
    where: { slug: targetSlug },
  });
  if (!workspace) {
    console.error(`workspace ${targetSlug} not found`);
    process.exit(1);
  }

  const docId = uuidv4();
  const filename = `07_vpayv_landing.md-${docId}.json`;
  const folder = path.resolve(
    process.env.STORAGE_DIR,
    "documents",
    "custom-documents"
  );
  const fullPath = path.resolve(folder, filename);

  const docJson = {
    id: docId,
    url: `file://${path.resolve(folder, `07_vpayv_landing.md`)}`,
    title: "07_vpayv_landing.md",
    docAuthor: "VPay",
    description: "vpayv.com 공식 사이트 정보 (지원 국가, 수수료, 한도, 처리시간 등)",
    docSource: "vpayv.com landing page scraped 2026-05-14",
    chunkSource: "",
    published: new Date().toLocaleString("en-US"),
    wordCount: PAGE_CONTENT.split(/\s+/).length,
    pageContent: PAGE_CONTENT,
    token_count_estimate: Math.ceil(PAGE_CONTENT.length / 3),
  };

  fs.writeFileSync(fullPath, JSON.stringify(docJson, null, 2));
  console.log(`[add] wrote ${fullPath}`);

  // Check if already in workspace
  const existing = await prisma.workspace_documents.findFirst({
    where: { workspaceId: workspace.id, filename: "07_vpayv_landing.md" },
  });
  if (existing) {
    console.log(`[add] doc already in workspace, removing old entry first`);
    await prisma.workspace_documents.delete({ where: { id: existing.id } });
  }

  // Embed it via Document.addDocuments — relative path from documents/
  const relPath = `custom-documents/${filename}`;
  console.log(`[add] embedding "${relPath}" into "${workspace.name}"...`);
  const result = await Document.addDocuments(workspace, [relPath], null);
  const embedded = result?.embedded?.length ?? 0;
  const failed = result?.failedToEmbed?.length ?? 0;
  console.log(`[add] -> embedded=${embedded} failed=${failed}`);
  if (failed > 0) {
    console.log(`[add] errors: ${JSON.stringify(result.errors)}`);
  }

  await prisma.$disconnect();
})().catch((err) => {
  console.error(`[add] FATAL:`, err);
  process.exit(1);
});
