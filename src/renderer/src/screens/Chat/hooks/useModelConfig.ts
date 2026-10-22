import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, displayBrandFromConfig } from "../../../constants";
import { useDiscoveredModels } from "../../../hooks/useDiscoveredModels";
import { useI18n } from "../../../components/useI18n";
import { isLoopbackModelEndpoint } from "../../../../../shared/model-endpoint";
import type { ModelGroup } from "../types";

const OLLAMA_CLOUD_PROVIDER = "ollama-cloud";
const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1";

/**
 * Named providers (deepseek, groq, anthropic, …) have a hardcoded canonical
 * base_url in hermes-agent's PROVIDER_REGISTRY, so a stored `baseUrl` on those
 * entries can be stale and would misroute the request. Keep the baseUrl only
 * for `custom` and `ollama-cloud` entries, where it is authoritative; clear it
 * otherwise so the backend falls back to the provider's canonical URL. Shared
 * by `selectModel` and the chat-screen session override so they can't drift.
 */
export function effectiveOverrideBaseUrl(
  provider: string,
  baseUrl: string,
): string {
  return provider === "custom" || provider === OLLAMA_CLOUD_PROVIDER
    ? baseUrl
    : "";
}

interface SavedModelForPicker {
  provider: string;
  model: string;
  name: string;
  baseUrl?: string;
}

function mergeLiveOllamaCloudModels(
  savedModels: SavedModelForPicker[],
  liveModels: string[],
  liveStatus: string,
): SavedModelForPicker[] {
  if (liveStatus !== "ok" || liveModels.length === 0) {
    return savedModels;
  }

  const liveEntries = Array.from(new Set(liveModels))
    .sort()
    .map((model) => ({
      provider: OLLAMA_CLOUD_PROVIDER,
      model,
      name: `Ollama Cloud · ${model}`,
      baseUrl: OLLAMA_CLOUD_BASE_URL,
    }));

  return [
    ...savedModels.filter((model) => model.provider !== OLLAMA_CLOUD_PROVIDER),
    ...liveEntries,
  ];
}

/**
 * Merge the models an OpenAI-compatible endpoint advertises right now into
 * the picker.
 *
 * The library is a curated list: it holds the models someone chose to save,
 * not the models the endpoint actually has. A local Unsloth Studio holds
 * every GGUF that was downloaded and advertises all of them on `/v1/models`,
 * but the picker only read the library — so a Studio with six downloaded
 * models offered one, and the other five could not be tried at all.
 *
 * An endpoint on this machine merges its catalogue whatever it is called. The
 * engine registers the local Studio under whatever provider name it was
 * given — `unsloth`, `custom`, anything — so the provider's name cannot
 * identify it; the host can. A named *remote* provider's library stays
 * curated on purpose, and merging a whole remote catalogue into the picker
 * would bury those entries.
 */
function mergeLiveCustomModels(
  savedModels: SavedModelForPicker[],
  liveModels: string[],
  liveStatus: string,
  provider: string,
  baseUrl: string,
): SavedModelForPicker[] {
  const isLocal = isLoopbackModelEndpoint(baseUrl);
  if (!isLocal && provider !== "custom") return savedModels;
  if (liveStatus !== "ok" || liveModels.length === 0) {
    return savedModels;
  }
  if (!baseUrl) return savedModels;

  const known = new Set(
    savedModels
      .filter((m) => m.provider === provider && m.baseUrl === baseUrl)
      .map((m) => m.model),
  );
  const live = Array.from(new Set(liveModels))
    .filter((model) => model && !known.has(model))
    .map((model) => ({
      provider,
      model,
      name: model,
      baseUrl,
    }));
  return [...savedModels, ...live];
}

interface UseModelConfigResult {
  currentModel: string;
  currentProvider: string;
  currentBaseUrl: string;
  modelGroups: ModelGroup[];
  displayModel: string;
  reload: () => Promise<void>;
  selectModel: (
    provider: string,
    model: string,
    baseUrl: string,
    options?: { persist?: boolean },
  ) => Promise<void>;
}

function groupModelsByProvider(models: SavedModelForPicker[]): ModelGroup[] {
  const groupMap = new Map<string, ModelGroup>();
  for (const m of models) {
    // Group by display brand so OpenAI-compatible providers stored as `custom`
    // (Hermes One, Groq, …) show under their own header instead of the generic
    // "OpenAI Compatible / Local" bucket. Each model keeps its raw provider +
    // baseUrl below so selection/routing is unchanged.
    const brand = displayBrandFromConfig(m.provider, m.baseUrl || "");
    if (!groupMap.has(brand)) {
      groupMap.set(brand, {
        provider: brand,
        providerLabel: PROVIDERS.labels[brand] || brand,
        models: [],
      });
    }
    groupMap.get(brand)!.models.push({
      provider: m.provider,
      model: m.model,
      label: m.name,
      baseUrl: m.baseUrl || "",
    });
  }
  return Array.from(groupMap.values());
}

export function useModelConfig(profile?: string): UseModelConfigResult {
  const { t } = useI18n();
  const [currentModel, setCurrentModel] = useState("");
  const [currentProvider, setCurrentProvider] = useState("auto");
  const [currentBaseUrl, setCurrentBaseUrl] = useState("");
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [savedModels, setSavedModels] = useState<SavedModelForPicker[]>([]);
  const loadSeqRef = useRef(0);

  const ollamaCloudDiscovery = useDiscoveredModels({
    provider: OLLAMA_CLOUD_PROVIDER,
    profile,
    enabled: true,
  });

  // The endpoint currently in use. An OpenAI-compatible endpoint (the local
  // Unsloth Studio, LM Studio, a vLLM server) advertises its models on
  // /v1/models, and that live list is what the picker needs — the library
  // only records the models that were saved by hand. The endpoint is
  // identified by its host, not by the provider's name: the engine calls the
  // local Studio `unsloth`, and the picker would never see its catalogue.
  const currentDiscovery = useDiscoveredModels({
    provider: currentProvider,
    baseUrl: currentBaseUrl,
    profile,
    enabled:
      !!currentBaseUrl &&
      (currentProvider === "custom" || isLoopbackModelEndpoint(currentBaseUrl)),
  });

  const modelsForPicker = useMemo(
    () =>
      mergeLiveCustomModels(
        mergeLiveOllamaCloudModels(
          savedModels,
          ollamaCloudDiscovery.models,
          ollamaCloudDiscovery.status,
        ),
        currentDiscovery.models,
        currentDiscovery.status,
        currentProvider,
        currentBaseUrl,
      ),
    [
      savedModels,
      ollamaCloudDiscovery.models,
      ollamaCloudDiscovery.status,
      currentDiscovery.models,
      currentDiscovery.status,
      currentProvider,
      currentBaseUrl,
    ],
  );

  const reload = useCallback(async (): Promise<void> => {
    const seq = ++loadSeqRef.current;
    const [mc, savedModels] = await Promise.all([
      window.hermesAPI.getModelConfig(profile),
      window.hermesAPI.listModels(),
    ]);
    if (seq !== loadSeqRef.current) return;
    setCurrentModel(mc.model);
    setCurrentProvider(mc.provider);
    setCurrentBaseUrl(mc.baseUrl);
    setSavedModels(savedModels);
  }, [profile]);

  // Initial load + reload whenever the profile changes (canonical
  // load-on-mount; setState happens inside `reload` via an awaited IPC call).
  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setModelGroups(groupModelsByProvider(modelsForPicker));
  }, [modelsForPicker]);

  useEffect(() => {
    return window.hermesAPI.onConnectionConfigChanged(() => {
      setModelGroups([]);
      void reload();
    });
  }, [reload]);

  useEffect(() => {
    return window.hermesAPI.onModelLibraryChanged(() => {
      void reload();
    });
  }, [reload]);

  const selectModel = useCallback(
    async (
      provider: string,
      model: string,
      baseUrl: string,
      { persist = true }: { persist?: boolean } = {},
    ): Promise<void> => {
      const effectiveBaseUrl = effectiveOverrideBaseUrl(provider, baseUrl);
      setCurrentModel(model);
      setCurrentProvider(provider);
      setCurrentBaseUrl(effectiveBaseUrl);
      // Session-only selection: update local state only, do not write to
      // config.yaml so the global default model is preserved (issue #688).
      // Advance the sequence counter so any in-flight reload() triggered by
      // onConnectionConfigChanged / onModelLibraryChanged cannot clobber the
      // session-scoped selection with the persisted value.
      if (!persist) {
        ++loadSeqRef.current;
        return;
      }
      const seq = ++loadSeqRef.current;
      try {
        await window.hermesAPI.setModelConfig(
          provider,
          model,
          effectiveBaseUrl,
          profile,
        );
        const mc = await window.hermesAPI.getModelConfig(profile);
        if (seq !== loadSeqRef.current) return;
        setCurrentModel(mc.model);
        setCurrentProvider(mc.provider);
        setCurrentBaseUrl(mc.baseUrl);
      } catch (err) {
        if (seq === loadSeqRef.current) await reload();
        throw err;
      }
    },
    [profile, reload],
  );

  const displayModel = useMemo(
    () =>
      currentModel
        ? currentModel.split("/").pop() || currentModel
        : currentProvider === "auto"
          ? t("chat.auto")
          : t("chat.noModel"),
    [currentModel, currentProvider, t],
  );

  return {
    currentModel,
    currentProvider,
    currentBaseUrl,
    modelGroups,
    displayModel,
    reload,
    selectModel,
  };
}
