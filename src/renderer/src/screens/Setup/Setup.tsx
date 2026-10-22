import { useState } from "react";
import { ArrowRight, ExternalLink, Check } from "../../assets/icons";
import { PROVIDERS, LOCAL_PRESETS, DASHSCOPE_ENDPOINTS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import VerifyWarningBanner from "../../components/VerifyWarningBanner";
import BrandLogo from "../../components/common/BrandLogo";
import { expectedEnvKeyForUrl } from "../../../../shared/url-key-map";
import { buildKodaPersona } from "../../../../shared/koda-persona";

interface SetupProps {
  onComplete: () => void;
  /** Active profile being configured; omitted means the default profile. */
  profile?: string;
  verifyWarning?: boolean;
  onReinstall?: () => void;
  onDismissVerifyWarning?: () => void;
}

function Setup({
  onComplete,
  profile,
  verifyWarning,
  onReinstall,
  onDismissVerifyWarning,
}: SetupProps): React.JSX.Element {
  const { t } = useI18n();
  const [selectedProvider, setSelectedProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [modelName, setModelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showKey, setShowKey] = useState(false);
  // What the assistant is called, and how the user wants it to behave. Both
  // are optional: left blank, the persona the app seeds stays as it is.
  const [agentName, setAgentName] = useState("");
  const [personaNote, setPersonaNote] = useState("");
  // Who the *owner* is. The engine keeps this separate from the persona
  // (`memories/USER.md`), and reads it at the start of every conversation.
  const [aboutYou, setAboutYou] = useState("");

  const provider = PROVIDERS.setup.find((p) => p.id === selectedProvider)!;
  const isLocal = selectedProvider === "local";
  const isDashScope = selectedProvider === "alibaba";

  function applyLocalPreset(presetBaseUrl: string): void {
    setBaseUrl(presetBaseUrl);
  }

  // Setup prefers a LOCAL_PRESETS exact-URL match (so e.g. an LM Studio
  // preset's explicit `envKey` wins over URL pattern matching), then
  // falls back to the shared URL_KEY_MAP for known commercial hosts and
  // finally to `CUSTOM_API_KEY` for unknown URLs.
  function resolveCustomEnvKey(url: string): string {
    const preset = LOCAL_PRESETS.find((p) => p.baseUrl === url);
    if (preset?.envKey) return preset.envKey;
    return expectedEnvKeyForUrl(url);
  }

  async function handleContinue(): Promise<void> {
    if (provider.needsKey && !apiKey.trim()) {
      setError(t("setup.missingApiKey"));
      return;
    }
    if ((isLocal || isDashScope) && !baseUrl.trim()) {
      setError(t("setup.missingServerUrl"));
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (provider.needsKey && provider.envKey) {
        await window.hermesAPI.setEnv(provider.envKey, apiKey.trim(), profile);
      } else if (isLocal && apiKey.trim()) {
        const envKey = resolveCustomEnvKey(baseUrl.trim());
        await window.hermesAPI.setEnv(envKey, apiKey.trim(), profile);
      }

      const configProvider = isLocal ? "custom" : provider.configProvider;
      const configBaseUrl =
        isLocal || isDashScope ? baseUrl.trim() : provider.baseUrl;
      const configModel = modelName.trim() || "";
      await window.hermesAPI.setModelConfig(
        configProvider,
        configModel,
        configBaseUrl,
        profile,
      );

      // The persona is the assistant's own identity. It is written only when
      // the user named it or described it — so running setup again never
      // overwrites a persona the user already wrote.
      if (agentName.trim() || personaNote.trim()) {
        await window.hermesAPI.writeSoul(
          buildKodaPersona(
            agentName.trim() || undefined,
            personaNote.trim() || undefined,
          ),
          profile,
        );
      }

      // The owner's own details live in a different file from the persona
      // (`memories/USER.md`). Same rule as the persona: written only when
      // the user actually typed something, so re-running setup never wipes
      // details the user already saved.
      if (aboutYou.trim()) {
        const result = await window.hermesAPI.writeUserProfile(
          aboutYou.trim(),
          profile,
        );
        if (!result.success) {
          setError(result.error || t("setup.saveFailed"));
          setSaving(false);
          return;
        }
      }

      onComplete();
    } catch {
      setError(t("setup.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="screen setup-screen">
      {verifyWarning && onReinstall && onDismissVerifyWarning && (
        <VerifyWarningBanner
          onReinstall={onReinstall}
          onDismiss={onDismissVerifyWarning}
        />
      )}
      <div className="setup-panel">
        <h1 className="setup-title">{t("setup.title")}</h1>
        <p className="setup-subtitle">{t("setup.subtitle")}</p>

        <div className="setup-provider-grid">
          {PROVIDERS.setup.map((p) => {
            const active = selectedProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                className={`setup-provider-card ${active ? "selected" : ""}`}
                onClick={() => {
                  setSelectedProvider(p.id);
                  if (p.id === "alibaba") {
                    setBaseUrl(p.baseUrl);
                  }
                  setError("");
                }}
              >
                {active && (
                  <span className="setup-provider-check" aria-hidden="true">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <span className="setup-provider-logo">
                  <BrandLogo provider={p.id} size={22} matchTheme={true} />
                </span>
                <span className="setup-provider-name">{t(p.name)}</span>
              </button>
            );
          })}
        </div>

        <div className="setup-form">
          {isLocal ? (
            <>
              <label className="setup-label">
                {t("setup.localGroupLabel")}
              </label>
              <div className="setup-local-presets">
                {LOCAL_PRESETS.filter((p) => p.group === "local").map(
                  (preset) => (
                    <button
                      key={preset.id}
                      className={`setup-local-preset ${baseUrl === preset.baseUrl ? "active" : ""}`}
                      onClick={() => applyLocalPreset(preset.baseUrl)}
                    >
                      <BrandLogo
                        provider={preset.id}
                        size={16}
                        matchTheme={true}
                      />
                      <span>{t(`setup.localPresets.${preset.id}`)}</span>
                    </button>
                  ),
                )}
              </div>

              <label className="setup-label" style={{ marginTop: 12 }}>
                {t("setup.remoteGroupLabel")}
              </label>
              <div className="setup-local-presets">
                {LOCAL_PRESETS.filter((p) => p.group === "remote").map(
                  (preset) => (
                    <button
                      key={preset.id}
                      className={`setup-local-preset ${baseUrl === preset.baseUrl ? "active" : ""}`}
                      onClick={() => applyLocalPreset(preset.baseUrl)}
                    >
                      <BrandLogo
                        provider={preset.id}
                        size={16}
                        matchTheme={true}
                      />
                      <span>{t(`setup.localPresets.${preset.id}`)}</span>
                    </button>
                  ),
                )}
              </div>

              <label className="setup-label" style={{ marginTop: 16 }}>
                {t("setup.serverUrl")}
              </label>
              <input
                className="input"
                type="text"
                placeholder={t("setup.modelBaseUrlPlaceholder")}
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setError("");
                }}
                autoFocus
              />
              <div className="setup-field-hint">
                {t("setup.customServerHint")}
              </div>

              <label className="setup-label" style={{ marginTop: 16 }}>
                {t("setup.customApiKeyLabel")}{" "}
                <span className="setup-label-optional">
                  {t("common.optional")}
                </span>
              </label>
              <div className="setup-input-group">
                <input
                  className="input"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError("");
                  }}
                />
                <button
                  className="setup-toggle-visibility"
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                >
                  {showKey ? t("common.hide") : t("common.show")}
                </button>
              </div>
              <div className="setup-field-hint">
                {t("setup.customApiKeyHint")}
              </div>

              <label className="setup-label" style={{ marginTop: 16 }}>
                {t("setup.modelName")}{" "}
                <span className="setup-label-optional">
                  {t("common.optional")}
                </span>
              </label>
              <input
                className="input"
                type="text"
                placeholder={t("setup.modelNamePlaceholder")}
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
              <div className="setup-field-hint">
                {t("setup.defaultModelHint")}
              </div>
            </>
          ) : provider.needsKey ? (
            <>
              {isDashScope && (
                <>
                  <label className="setup-label">
                    {t("constants.dashscopeEndpoint")}
                  </label>
                  <select
                    className="input"
                    value={baseUrl}
                    onChange={(e) => {
                      setBaseUrl(e.target.value);
                      setError("");
                    }}
                  >
                    {DASHSCOPE_ENDPOINTS.map((endpoint) => (
                      <option key={endpoint.id} value={endpoint.baseUrl}>
                        {t(endpoint.name)}
                      </option>
                    ))}
                  </select>
                  <div className="setup-field-hint">
                    {t("setup.customServerHint")}
                  </div>
                </>
              )}

              <label
                className="setup-label"
                style={isDashScope ? { marginTop: 16 } : undefined}
              >
                {t("setup.apiKeyLabel", { provider: t(provider.name) })}
              </label>
              <div className="setup-input-group">
                <input
                  className="input"
                  type={showKey ? "text" : "password"}
                  placeholder={provider.placeholder}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                  autoFocus
                />
                <button
                  className="setup-toggle-visibility"
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                >
                  {showKey ? t("common.hide") : t("common.show")}
                </button>
              </div>

              <button
                className="setup-link"
                onClick={() => window.hermesAPI.openExternal(provider.url)}
              >
                {t("setup.noKeyHint")}
                <ExternalLink size={12} />
              </button>
            </>
          ) : (
            <>
              <div className="setup-field-hint">
                {t("setup.noApiKeyRequired", { provider: t(provider.name) })}
              </div>

              <label className="setup-label" style={{ marginTop: 16 }}>
                {t("setup.modelName")}{" "}
                <span className="setup-label-optional">
                  {t("common.optional")}
                </span>
              </label>
              <input
                className="input"
                type="text"
                placeholder={t("setup.modelNamePlaceholder")}
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                autoFocus
              />
              <div className="setup-field-hint">
                {t("setup.defaultModelHint")}
              </div>
            </>
          )}

          <div className="setup-persona">
            <div className="setup-persona-title">{t("setup.makeItYours")}</div>

            <label className="setup-label">{t("setup.agentName")}</label>
            <input
              className="input"
              type="text"
              placeholder={t("setup.agentNamePlaceholder")}
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
            <div className="setup-field-hint">{t("setup.agentNameHint")}</div>

            <label className="setup-label" style={{ marginTop: 16 }}>
              {t("setup.personaLabel")}{" "}
              <span className="setup-label-optional">
                {t("common.optional")}
              </span>
            </label>
            <textarea
              className="input setup-persona-textarea"
              placeholder={t("setup.personaPlaceholder")}
              value={personaNote}
              onChange={(e) => setPersonaNote(e.target.value)}
              rows={3}
            />
            <div className="setup-field-hint">{t("setup.personaHint")}</div>

            <label className="setup-label" style={{ marginTop: 16 }}>
              {t("setup.aboutYouLabel")}{" "}
              <span className="setup-label-optional">
                {t("common.optional")}
              </span>
            </label>
            <textarea
              className="input setup-persona-textarea"
              placeholder={t("setup.aboutYouPlaceholder")}
              value={aboutYou}
              onChange={(e) => setAboutYou(e.target.value)}
              rows={3}
            />
            <div className="setup-field-hint">{t("setup.aboutYouHint")}</div>
          </div>

          {error && <div className="setup-error">{error}</div>}

          <button
            className="btn btn-primary setup-continue"
            onClick={handleContinue}
            disabled={
              saving ||
              (provider.needsKey && !apiKey.trim()) ||
              ((isLocal || isDashScope) && !baseUrl.trim())
            }
            style={{ marginTop: isLocal ? 20 : 0 }}
          >
            {saving ? t("setup.saving") : t("setup.continue")}
            {!saving && <ArrowRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Setup;
