#!/usr/bin/env node
// vpay one-off: re-embed every workspace_document with the currently
// configured embedder (intended for switching from native -> bge-m3).
// Snapshots existing docpaths, drops the workspace_documents rows so
// Document.addDocuments doesn't trip the unique constraint, then re-adds.
// Vectors must already have been cleared (lancedb dir removed / backed up).

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env.development"),
});
process.env.STORAGE_DIR =
  process.env.STORAGE_DIR || path.resolve(__dirname, "..", "storage");

const prisma = require("../utils/prisma");
const { Document } = require("../models/documents");

(async function main() {
  console.log(`[reembed] STORAGE_DIR=${process.env.STORAGE_DIR}`);
  console.log(`[reembed] EMBEDDING_ENGINE=${process.env.EMBEDDING_ENGINE}`);
  console.log(`[reembed] EMBEDDING_MODEL_PREF=${process.env.EMBEDDING_MODEL_PREF}`);

  const workspaces = await prisma.workspaces.findMany();
  for (const workspace of workspaces) {
    const docs = await prisma.workspace_documents.findMany({
      where: { workspaceId: workspace.id },
    });
    if (docs.length === 0) {
      console.log(`[reembed] skipping "${workspace.name}" — 0 docs`);
      continue;
    }

    const docpaths = docs.map((d) => d.docpath);
    console.log(
      `[reembed] workspace "${workspace.name}" (slug=${workspace.slug}): ${docpaths.length} docs`
    );
    docpaths.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));

    // Drop the rows first so addDocuments can recreate them cleanly.
    await prisma.workspace_documents.deleteMany({
      where: { workspaceId: workspace.id },
    });

    const result = await Document.addDocuments(workspace, docpaths, null);
    const embedded = result?.embedded?.length ?? 0;
    const failed = result?.failedToEmbed?.length ?? 0;
    console.log(
      `[reembed] -> "${workspace.name}": embedded=${embedded} failed=${failed}`
    );
    if (failed > 0) {
      console.log(`    failures: ${JSON.stringify(result.failedToEmbed)}`);
      console.log(`    errors: ${JSON.stringify(result.errors)}`);
    }
  }

  await prisma.$disconnect();
  console.log(`[reembed] done`);
})().catch((err) => {
  console.error(`[reembed] FATAL:`, err);
  process.exit(1);
});
