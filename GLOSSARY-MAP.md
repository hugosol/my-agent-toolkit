# Glossary Map

## Contexts

- [Semantic Extension Framework](./framework/GLOSSARY.md): the shared harness foundation that owns extension behavior contracts and their mappings to supported harnesses.
- [connect-bot](./extensions/connect-bot/GLOSSARY.md): joins an agent session to the herdr-bot panel; `/connect-bot` registers the current session, `/connect-bot off` disconnects it.
- [codeBaseTools](./extensions/codebase-tools/GLOSSARY.md): routes the agent's code exploration toward the codebase-memory-mcp graph and LSP, controlled by `/codebase-tools`.

- [model-cost](./extensions/model-cost/GLOSSARY.md): distinguishes response accounting, Turn usage, Round totals, Session totals, the accounting reset with its consumption archive and boundary balance reading, the storage root/baseline the consumption document lives in, the entry's display preference with its agent tree, season boundary wait and accrued bar, the host's widget drawing form, and the legacy widget's Turn statistic.

- [workflow-chat](./extensions/workflow-chat/GLOSSARY.md): manager-chat and node-chat serve the manager and node-executor roles of a Map Run; Run and handoff completion are distinct from a framework Round or Chat exit.

## Relationships

- **Framework → extensions**: each extension's shared logic crosses the framework's small public interfaces (`defineExtension`, `ompAdapter`) and reads, but does not own, the framework's State and contribution vocabulary.
- **connect-bot → framework**: connect-bot adds the panel-specific terms (Panel session registration, Panel registration attempt, Panel session online status, Panel agent state, Panel Round completion observation); the framework's State, Owner, Marker area and Extension feedback vocabulary apply unchanged.
- **codeBaseTools → framework**: codeBaseTools consumes the framework's Injected prompt, History preservation and Marker area contracts; it has resolved no business term of its own yet.
- **model-cost → framework**: model-cost specializes the framework’s fact and measurement vocabulary (Unknown, No measurement policy, Known zero, Metric completeness, Known subtotal) for consumption accounting; Request, Assistant response, Turn, Round and Agent activity state retain their framework meanings. Glossaries define concepts; model-cost’s architectural tradeoffs are recorded in [its aggregate-accounting ADR](./docs/adr/0004-model-cost-aggregate-accounting.md), not encoded as framework-wide policy.
