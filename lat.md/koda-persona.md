# Koda identity

The assistant's name and persona belong to Koda. The engine seeds both, so the desktop seeds and repairs the persona file and rewrites the engine's own identity constants.

## The persona is the assistant's identity

`SOUL.md` in the engine's home is identity slot #1: the engine loads it for every session that reads its context files. It is also the file the engine writes for itself on first run.

[[src/shared/koda-persona.ts#buildKodaPersona]] builds the persona from the user's choices — the name the assistant answers with, and the user's own sentence about how it should behave. Both are optional, and the behaviour spec is carried verbatim so rebranding the identity never changes how the assistant behaves.

### The persona names Koda

The shipped persona names Koda and points at Koda Desktop. It is one text, shared by the desktop, the engine patch and the "reset" button, so the three can never drift apart.

### A missing persona is seeded

A persona file that does not exist is written, so a fresh install answers as Koda instead of waiting for the engine to seed its own.

[[src/main/koda-persona.ts#ensureKodaPersona]] writes the persona and records its hash in `desktop-compat/soul-seed.json`, which is what lets a later launch tell "the desktop wrote this" from "the user wrote this".

### A persona the engine seeded is replaced

The engine's own seeded text carries no user intent, so it is replaced with Koda's persona the first time the app runs against it.

## A persona the user wrote is never overwritten

The rule is narrow on purpose: only text the engine seeded may be replaced. Anything a person wrote is their work, and it is left exactly as it is.

### Only auto-seeded text is stock

[[src/shared/koda-persona.ts#isStockPersona]] recognises two shapes of auto-seeded text — the engine's seeded default and its comment-only scaffold — and nothing else. A persona that opens with "You are" and names a vendor is auto-seeded; every other persona is the user's.

### A persona the user wrote is preserved

A persona that is neither auto-seeded nor still exactly the persona the desktop wrote is never touched — in the default home and in every named profile alike.

## The engine's own identity is rewritten

The persona file is only half of the identity. The engine also holds a fallback identity for sessions that load no persona, plus two help-guidance blocks injected into every prompt, and it seeds those with the old product's name too.

### A constant is found by its assignment

The engine's constants are found by their assignment, not by their text: the scan is string- and comment-aware, so a constant named in a docstring or a comment is never mistaken for the assignment itself.

[[src/main/koda-persona.ts#findPythonAssignment]] locates `NAME = (...)` and returns the span of the whole assignment, so the value can be replaced without the desktop ever naming the text it replaces.

### The engine's identity constants are replaced

`DEFAULT_AGENT_IDENTITY` and both help-guidance blocks are rewritten in the installed engine, and the patch is re-applied at every launch — the engine is replaced by its own updater, so a patch in it is gone after an update.

[[src/main/koda-persona.ts#ensureLocalPersonaCompatibility]] writes the patched source the same way the model-library endpoints are injected, and an engine whose layout the desktop does not recognise is left alone rather than half-patched.

### The engine's own default persona is rewritten

The engine's seeded default persona and its persona scaffold are rewritten too, so a fresh install or a new profile starts as Koda without the desktop having to touch it.

## First use offers the persona

Making the assistant yours is a first-use step, not something to be hunted for later. The setup screen offers it, and the chat offers it until the persona is the user's own.

### The setup screen writes the persona

The setup screen asks for a name and a description and writes them as the persona. It writes only when the user filled something in, so running setup again never overwrites a persona the user already wrote.

[[src/renderer/src/screens/Setup/Setup.tsx#Setup]] builds the persona with [[src/shared/koda-persona.ts#buildKodaPersona]] and hands it to the persona editor's own write path.

### The chat offers the persona

A banner appears at the top of the chat while the persona is still the stock one, and opens the agent's persona editor directly. It disappears once the persona is written, and a dismissal is remembered so it never nags.

[[src/renderer/src/components/PersonaPromptBanner.tsx#PersonaPromptBanner]] reads the persona through the same read path the editor uses and compares it with [[src/shared/koda-persona.ts#isDefaultPersona]].

## Details about the owner

`memories/USER.md` holds who the *owner* is; `SOUL.md` holds who the assistant is. The engine injects the first into every prompt, but it was only reachable deep inside the agent's memory tab.

The desktop gives it a first-class home — an "About you" section in the agent's profile modal, and an optional first-use field on the setup screen. Both write through the same `write-user-profile` IPC, and both write only what the owner actually typed, so re-running setup never wipes details already saved.

### The about-you section opens from the agent's profile

The agent's profile modal carries an "About you" section next to Persona. It loads `memories/USER.md` and saves edits back, so the owner's details need no hunt through the memory tab.

[[src/renderer/src/components/profile/AboutYouPane.tsx#AboutYouPane]] is the pane; [[src/renderer/src/components/profile/ProfileModal.tsx#ProfileModal]] hosts it as the `aboutYou` section.

### The about-you pane writes USER.md

The pane shows the saved details, writes an edit back with the profile and editor target it belongs to, and reports a refused save instead of claiming it worked.

### A refused about-you save keeps the details

A write the engine refuses — a file over its limit, an unreachable server — leaves the text in the box and shows the engine's reason. The pane never reports a save that did not happen.

### Setup writes USER.md when the user types something

The setup screen asks "Who are you?" next to the assistant's name and description, and writes the answer to `memories/USER.md` — a different file from the persona, so the two never overwrite each other.

[[src/renderer/src/screens/Setup/Setup.tsx#Setup]] writes it through the same `write-user-profile` IPC the pane uses.

### Setup leaves USER.md alone when the user types nothing

The field is optional and is written only when it is filled in, so a setup run that says nothing about the owner leaves details the owner already saved exactly as they were.
