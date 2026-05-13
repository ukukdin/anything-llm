import React, { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import PreLoader from "@/components/Preloader";
import CTAButton from "@/components/lib/CTAButton";
import System from "@/models/system";
import showToast from "@/utils/toast";

const RERANKER_OPTIONS = [
  {
    value: "native",
    label: "AnythingLLM Native (Xenova MS-MARCO MiniLM)",
    description:
      "Runs locally with the bundled cross-encoder. Zero setup, English-leaning.",
  },
  {
    value: "cohere",
    label: "Cohere Rerank (hosted)",
    description:
      "Calls the Cohere hosted rerank API. Multilingual incl. Korean. Requires an API key.",
  },
];

export default function RerankerPreference() {
  const [settings, setSettings] = useState({});
  const [provider, setProvider] = useState("native");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      const data = await System.keys();
      if (data) {
        setSettings(data);
        setProvider(data?.EmbeddingReranker || "native");
      }
      setLoading(false);
    }
    fetchSettings();
  }, []);

  const handleProviderChange = (e) => {
    setProvider(e.target.value);
    setHasChanges(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.target);
    const updates = {
      EmbeddingReranker: provider,
    };

    if (provider === "cohere") {
      const apiKey = form.get("CohereRerankerApiKey")?.toString().trim();
      const model = form.get("CohereRerankerModel")?.toString().trim();
      if (apiKey) updates.CohereRerankerApiKey = apiKey;
      if (model) updates.CohereRerankerModel = model;

      // Require an API key when switching to Cohere unless one is already saved.
      if (!apiKey && !settings?.CohereRerankerApiKey) {
        showToast(
          "Cohere API key is required to enable the Cohere reranker.",
          "error"
        );
        setSaving(false);
        return;
      }
    }

    const { error } = await System.updateSystem(updates);
    if (error) {
      showToast(`Failed to save reranker settings: ${error}`, "error");
    } else {
      const refreshed = await System.keys();
      if (refreshed) setSettings(refreshed);
      setHasChanges(false);
      showToast("Reranker settings saved.", "success");
    }
    setSaving(false);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      {loading ? (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <div className="w-full h-full flex justify-center items-center">
            <PreLoader />
          </div>
        </div>
      ) : (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <form
            onSubmit={handleSubmit}
            onChange={() => setHasChanges(true)}
            className="flex w-full"
            id="reranker-preference-form"
          >
            <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
              <div className="w-full flex flex-col gap-y-1 pb-4 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
                <div className="flex gap-x-4 items-center">
                  <p className="text-lg leading-6 font-bold text-white">
                    Embedding Reranker
                  </p>
                </div>
                <p className="text-xs leading-[18px] font-base text-white text-opacity-60">
                  Choose which model rescores vector search results before they
                  are sent to the LLM. Used only when a workspace has Vector
                  Search Mode set to Rerank.
                </p>
              </div>

              <div className="w-full justify-end flex">
                {hasChanges && (
                  <CTAButton className="mt-3 mr-0 -mb-14 z-10">
                    {saving ? "Saving..." : "Save"}
                  </CTAButton>
                )}
              </div>

              <div className="flex flex-col gap-y-4 mt-8">
                <div className="flex flex-col max-w-[480px]">
                  <label className="text-white text-sm font-semibold block mb-2">
                    Reranker Provider
                  </label>
                  <select
                    name="EmbeddingReranker"
                    value={provider}
                    onChange={handleProviderChange}
                    className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                  >
                    {RERANKER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-white/60 mt-2">
                    {
                      RERANKER_OPTIONS.find((o) => o.value === provider)
                        ?.description
                    }
                  </p>
                </div>
              </div>

              {provider === "cohere" && (
                <div className="flex flex-col gap-y-4 mt-8">
                  <div className="flex flex-col max-w-[480px]">
                    <label className="text-white text-sm font-semibold block mb-2">
                      Cohere API Key
                    </label>
                    <input
                      type="password"
                      name="CohereRerankerApiKey"
                      autoComplete="off"
                      spellCheck={false}
                      defaultValue={
                        settings?.CohereRerankerApiKey ? "*".repeat(20) : ""
                      }
                      placeholder="Cohere API key"
                      className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                    />
                    <p className="text-xs text-white/40 mt-2">
                      Leave blank to keep the previously saved key. Create one
                      at dashboard.cohere.com.
                    </p>
                  </div>

                  <div className="flex flex-col max-w-[480px]">
                    <label className="text-white text-sm font-semibold block mb-2">
                      Rerank Model
                    </label>
                    <input
                      type="text"
                      name="CohereRerankerModel"
                      autoComplete="off"
                      spellCheck={false}
                      defaultValue={
                        settings?.CohereRerankerModel || "rerank-v3.5"
                      }
                      placeholder="rerank-v3.5"
                      className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                    />
                    <p className="text-xs text-white/40 mt-2">
                      Defaults to <code>rerank-v3.5</code> (multilingual).
                    </p>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
