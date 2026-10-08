# Glossary Map

## Contexts

- [Semantic Extension Framework](./framework/GLOSSARY.md): the shared runtime foundation that owns extension behavior contracts and their mappings to supported agent runtimes.
- [connect-bot](./extensions/connect-bot/GLOSSARY.md): joins an agent session to the omp-bot panel; `/connect-bot` registers the current session, `/connect-bot off` disconnects it.
- [codeBaseTools](./extensions/codebase-tools/GLOSSARY.md): routes the agent's code exploration toward the codebase-memory-mcp graph and LSP, controlled by `/codebase-tools`.

## Relationships

- **Framework → extensions**: each extension's shared logic crosses the framework's small public interfaces (`defineExtension`, `ompAdapter`) and reads, but does not own, the framework's State and contribution vocabulary.
- **connect-bot → framework**: connect-bot adds the panel-specific terms (Panel session registration, Panel registration attempt, Panel session online status); the framework's State, Owner, Marker area and Extension feedback vocabulary apply unchanged.
- **codeBaseTools → framework**: codeBaseTools consumes the framework's Injected prompt, History preservation and Marker area contracts; it has resolved no business term of its own yet.
