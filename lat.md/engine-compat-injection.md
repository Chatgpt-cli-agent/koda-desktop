# Engine compatibility injection

The desktop injects a small compatibility block into the installed engine so the app's own model-library API exists in the engine's dashboard server.

The engine is installed outside the desktop's control, and the desktop needs four extra endpoints on it: `GET`, `POST`, `PATCH` and `DELETE` for `/api/model/library`. Those routes are not upstream's, so the desktop writes them into the installed engine's source at launch, in a way an engine update can undo without losing anything.

## The injected block is self-contained

The block imports everything it uses, so it works in any module of the engine and survives an engine restructure.

The engine moved its dashboard routes into `hermes_cli/web_routers/*.py` and turned `get_hermes_home` into a lazy module attribute in `web_server.py` rather than a module-level import. A block that relied on the surrounding module's imports would break the moment the routes moved. [[src/main/hermes-agent-compat.ts#modelLibraryCompatSource]] therefore emits its own imports — `json`, `secrets`, `time`, `Path`, `fastapi.HTTPException` and `hermes_cli.config.get_hermes_home` — and names the router it attaches to as a parameter, so the same block serves both layouts.

## The injection target follows the engine's layout

The block is written to whichever file actually declares the model routes, and the decorator it binds to matches that file.

[[src/main/hermes-agent-compat.ts#resolveModelLibraryTarget]] looks for `hermes_cli/web_routers/models.py` and falls back to `hermes_cli/web_server.py`, choosing the router name from the decorator it finds there — `@router.post("/api/model/set")` or `@app.post("/api/model/set")`. [[src/main/hermes-agent-compat.ts#patchDashboardModelLibrarySource]] refuses to patch a file that does not already declare that route, so a layout the desktop does not recognise is left untouched rather than half-patched. When the embedded-chat default and the model routes share one file, the model block is applied on top of the already-patched source, so the two patches do not overwrite each other.

## A later engine update is recoverable

Because the desktop re-applies the block at launch, an engine update that removes it costs nothing.

The engine's own updater replaces the installed source, so any injected block is gone after an update. The desktop re-injects it on the next launch, and [[src/main/hermes-agent-compat.ts#ensureLocalDashboardCompatibility]] does the same for an SSH-installed engine through [[src/main/hermes-agent-compat.ts#ensureSshDashboardCompatibility]]. The engine's installed copy is therefore not the source of truth for these routes; the desktop is.
