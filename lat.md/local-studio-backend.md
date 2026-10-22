# Local Studio backend

Koda can serve a local model on its own: the Unsloth Studio backend is started, health-checked, and stopped by the desktop, so the standalone Studio desktop never has to be running.

## A local endpoint is a managed backend

A configured model whose base URL points at loopback is served by a Studio backend that Koda may own. Ownership is decided by who started it, and it decides who may stop it.

[[src/main/local-studio.ts#localStudioTargetFor]] accepts only loopback hosts (`localhost`, `127.0.0.1`, `::1`) and returns the port to manage; any other base URL is a remote endpoint and is never managed. [[src/main/local-studio.ts#getLocalStudioBackendStatus]] probes `GET /api/health` on that port and reports `installed`, `running`, `owned`, `baseUrl`, `port` and `pid`. `owned` is true only for a backend this app process started — a backend that was already answering is reused and left alone, so Koda never hijacks or kills a Studio session it did not create.

## The managed interpreter, not the unsigned stub

On Windows the backend is launched through the interpreter that ships beside it, never through the generated `unsloth.exe` stub, which Windows Application Control refuses to run.

[[src/main/local-studio.ts#resolveStudioLaunch]] picks `<studio>/unsloth_studio/Scripts/python.exe` (then `<studio>/.venv/Scripts/python.exe`) on Windows and the matching `bin/unsloth` executables elsewhere. The Windows child runs `studio --api-only -H 127.0.0.1 -p <port>` through a `-c` entrypoint that strips the working directory from `sys.path` and re-execs the CLI as `unsloth`. The child's environment carries `UNSLOTH_DESKTOP_MANAGED=1` plus the owner handshake (`UNSLOTH_STUDIO_DESKTOP_OWNER_KIND`, `_OWNER_TOKEN`, `_OWNER_PID`), so the backend exits if Koda dies and the other Studio desktop treats it as an external conflict instead of taking it over.

## Start at launch, stop at quit

Koda starts the backend for the configured model as soon as the window is created, and stops the one it owns when it quits. A backend it did not start survives the quit untouched.

[[src/main/app/start.ts#startLocalStudioIfConfigured]] reads the active model's base URL at startup and calls [[src/main/local-studio.ts#ensureLocalStudioBackend]], which is single-flight: a concurrent request joins the in-flight start rather than launching a second backend. [[src/main/app/start.ts#startMainProcess]] calls [[src/main/local-studio.ts#stopLocalStudioBackend]] in the managed-quit path, next to the SSH tunnel teardown. Only an owned backend is stopped.

## A local model is ready before the turn is sent

The chat transport makes sure the backend is up before it switches the session onto a local model, so a local turn never fails because a backend was not running yet.

[[src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts#ensureLocalStudioBackend]] resolves the selected model's base URL and, for a loopback host only, asks the main process to ensure the backend through the `local-studio-ensure` IPC. A non-loopback base URL is a remote provider and is left untouched. If the backend still cannot be reached, the send fails with the reported reason rather than switching the session onto a model that cannot answer.

## The engine's own view of the model

The engine reads the active model from the top-level `model:` block of `config.yaml`, so the desktop and the engine must agree on it.

The agent's `load_picker_context()` resolves `default` as the model, `provider` as the provider and `base_url` as the endpoint. The desktop mirrors the same block through [[src/main/config.ts#getModelConfig]], cached per profile and invalidated when the configuration changes. A local Studio setup therefore writes all three: a `providers:` entry for the endpoint, a `custom_providers:` entry for the model, and the top-level `model:` block that names the provider, model and base URL together.

## The model library comes from the engine

The Studio advertises every model it holds on `/v1/models`, and the desktop offers the user all of them, not only the ones that were saved by hand.

The library itself is a curated list. [[src/main/models.ts#syncAgentConfigModels]] merges the engine's `custom_providers:` entries into it, and [[src/renderer/src/screens/Chat/hooks/useModelConfig.ts#useModelConfig]] reads it back. That covers the models someone chose to save — not the models the endpoint actually has. A Studio holding six downloaded GGUFs served one, and the other five could not be tried at all, which is the whole point of running local models.

### A custom endpoint's key comes from the engine's provider list

A local Studio is a `custom` endpoint on loopback, and no URL rule recognises it, so its `/v1/models` was requested unauthenticated and answered 401.

The engine records which env var holds each provider's key under `providers:` → `key_env:`. [[src/main/model-discovery.ts#discoverProviderModels]] matches the provider by base URL — that is what identifies it — and reads the key from the profile's `.env`, under the engine's `key_env` or the desktop's own `CUSTOM_PROVIDER_<NAME>_KEY` convention. The same resolution applies to [[src/main/model-discovery.ts#getModelContextWindow]], so a live model's context window resolves too.

### A local endpoint is found by its host

An endpoint on this machine is identified by where it is served, not by the name its provider was given.

The engine registers the local Studio under whatever name it was given — `unsloth`, `custom`, anything — and the model library row carries that name too. A rule that looked only for the provider `custom` therefore missed the endpoint the user actually runs: the key was never found, the catalogue was never fetched, and the picker offered the one saved model. [[src/shared/model-endpoint.ts#isLoopbackModelEndpoint]] is the one rule both processes use, and it answers the same question on each side of the IPC boundary. [[src/main/model-discovery.ts#discoverProviderModels]] finds the key from the engine's provider list for any local endpoint, and [[src/renderer/src/screens/Chat/hooks/useModelConfig.ts#useModelConfig]] merges that endpoint's live catalogue into the picker whatever the provider is called.

A named *remote* provider is unchanged: its library stays curated, because merging a whole remote catalogue into the picker would bury those entries.

### The picker offers every model the endpoint advertises

The live catalogue is merged into the picker for `custom` endpoints only; a named provider's library stays curated on purpose.

[[src/renderer/src/screens/Chat/hooks/useModelConfig.ts#mergeLiveCustomModels]] adds each advertised model that the library does not already hold, keeping the library's rows and deduplicating by provider, model and base URL. The model id is the label, so a live row reads the way a saved one does.

## Installed skills are discovered recursively

The desktop lists the same skills the engine finds, at whatever depth they are installed, and counts them the same way.

[[src/main/skills.ts#findSkillCandidates]] walks the skills tree recursively, to a depth of eight. A directory holding a `SKILL.md` is a skill; the directory that holds it is the category, so `skills/mlops/evaluation/evaluating-llms-harness` is an `mlops` skill. The engine's own skill tool derives the category the same way — from the first path segment — and discovers skills at any depth, so a two-level walk hides every skill installed in a nested category.

The status bar's skill count is produced by [[src/main/profiles.ts#countSkills]], and it uses the same discovery. It once had its own two-level walk, so the bar counted fewer skills than the list beside it described — the list was right and the number was not. A count that disagrees with the list is a bug in the count.
