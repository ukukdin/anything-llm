class CohereEmbeddingReranker {
  constructor() {
    if (!process.env.COHERE_RERANKER_API_KEY)
      throw new Error("No Cohere reranker API key was set.");

    const { CohereClient } = require("cohere-ai");
    this.client = new CohereClient({
      token: process.env.COHERE_RERANKER_API_KEY,
    });
    this.model = process.env.COHERE_RERANKER_MODEL || "rerank-v3.5";
    this.log("Initialized");
  }

  log(text, ...args) {
    console.log(`\x1b[36m[CohereEmbeddingReranker]\x1b[0m ${text}`, ...args);
  }

  async preload() {
    this.log(`Using hosted Cohere rerank API - no model preload needed.`);
    return;
  }

  async initClient() {
    return;
  }

  /**
   * Reranks a list of documents based on the query via the Cohere v2 rerank API.
   * @param {string} query - The query to rerank the documents against.
   * @param {{text: string}[]} documents - The list of document text snippets to rerank.
   * @param {Object} options - The options for the reranking.
   * @param {number} options.topK - The number of top documents to return.
   * @returns {Promise<any[]>} - The reranked list of documents.
   */
  async rerank(query, documents, options = { topK: 4 }) {
    if (!documents?.length) return [];

    const start = Date.now();
    this.log(`Reranking ${documents.length} documents with ${this.model}...`);

    const topN = Math.min(options.topK, documents.length);
    const response = await this.client.v2.rerank({
      model: this.model,
      query,
      documents: documents.map((doc) => doc.text),
      topN,
    });

    const reranked = (response?.results || [])
      .map((result) => ({
        rerank_corpus_id: result.index,
        rerank_score: result.relevanceScore,
        ...documents[result.index],
      }))
      .sort((a, b) => b.rerank_score - a.rerank_score);

    this.log(
      `Reranked ${documents.length} documents to top ${topN} in ${Date.now() - start}ms`
    );
    return reranked;
  }
}

module.exports = {
  CohereEmbeddingReranker,
};
