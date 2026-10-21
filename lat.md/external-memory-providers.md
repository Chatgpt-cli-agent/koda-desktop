# External memory providers

External memory integrations are optional plugins installed separately from Desktop. Discovery reports code presence, not a working database, socket or dependency installation.

## Discovery boundaries

Local and SSH discovery inspect bundled provider directories and the selected profile's flat plugins directory. They never import plugin code, and a missing bundled install does not hide user plugins.

External `__init__.py` files must mention the Agent's memory-provider contract within their first 8 KiB. Hidden directories and ordinary plugins are ignored. A configured provider without discovered code remains visible with `installed: false`.

Direct Remote discovery stays server-authoritative through the selected profile's configuration schema and active provider. Desktop metadata never invents installed Remote providers; Remote Memory stays read-only as described in [[profile-editors#Profile editors#Remote capabilities]].

Project-local opt-in plugins and Python entry-point enumeration remain outside the Desktop directory scanner. Agent availability checks may execute plugins; Desktop deliberately does not use them for listing.

SSH directory discovery cannot verify a managed launcher's service user or custom runtime home without executing that launcher. An executable managed hook or nondefault SSH `HERMES_HOME` therefore reports discovery unavailable instead of listing guessed home contents.

## Optional Graphnosis MCP

Graphnosis requires its separately installed app and memory plugin. The optional Local action registers a pinned stdio relay in the captured profile without downloading or starting it.

The relay is `@graphnosis/mcp-relay@1.0.3`; its default socket resolves through `os.homedir()` without shell expansion. Node.js and the unlocked Graphnosis app must be available on this machine when Koda starts the server. Registration alone does not verify socket connectivity.

The main process validates [[profile-editors#Profile editors#Captured request target]] before any write and refuses this action for SSH or Remote targets. Existing manual MCP controls remain available. Target changes suppress delayed UI success, errors and refresh callbacks.

Graphnosis download links use fixed HTTPS destinations. Onboarding explains the external plugin prerequisite without installing it or changing `memory.provider`.

## Captured MCP YAML safety

The optional registration validates one YAML mapping before and after insertion, preserves existing server blocks and document marker trailers, and refuses unsupported layouts without changing any file.

[[src/main/yaml-document.ts#splitSingleYamlDocument]] bounds the mapping separately from explicit document markers. The existing production `js-yaml` parser is declared directly for duplicate-key and syntax checks; no parser reserialization changes the original text.

Plain MCP mapping headers are supported, including empty mappings and comments. Flow maps, quoted root keys, anchors on the MCP root, multiple documents and malformed YAML require manual configuration. The legacy manual MCP writer retains its existing behavior.

## Recall provider names

Recall metadata recognizes legacy `recall` and the current external plugin name `recall-memory-hermes`. Both use a fixed link to the upstream plugin repository and require no provider API key.

The current plugin is installed separately with the Agent plugin manager; installing its Python wheel alone does not create the flat plugin directory. Its optional embeddings use a separately configured local endpoint, while database paths are resolved by the plugin under the active profile.

Complete Memory locales translate both provider names through the same Recall description: SQLite tiered retrieval, optional local embeddings and no provider API key. The intentionally partial Persian resource retains English fallback.

Desktop does not install Recall dependencies, create its database or rewrite existing provider selection. Remote provider identities are accepted only when advertised by the selected server's schema or active configuration.

## Discovery errors stay with providers

Unavailable provider discovery does not discard successful memory and configuration reads. Entries, user text and Soul retain their captured target; the Providers tab shows the discovery error and known configured provider.

The failed discovery clears its previous list instead of presenting stale activation controls or claiming no plugins exist. Refresh retries discovery. Memory or configuration read errors still disable positional edits, and every reply retains the existing target and revision checks.

## Optional onboarding stays reachable

Local setup, SSH and Remote actions precede the optional Graphnosis card. Onboarding scrolls vertically within the application content at short supported window heights instead of clipping setup controls.
