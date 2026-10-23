# connect-bot

Joins an agent session to the herdr-bot panel: `/connect-bot` registers the current session, `/connect-bot off` disconnects it. The panel owns its row's online assessment; the extension owns the registration it sends and the local effects that keep it current.

## Language

**Panel（面板）**:
The herdr-bot web surface that owns the session table. The connect-bot extension registers sessions with it; the panel is distinct from the extension and from the harness.
_Avoid_: extension, harness, agent session

**Panel session registration（面板会话登记）**:
The presence of a connect-bot session record in the panel. Unregistering removes that record; an offline session can remain registered.
_Avoid_: online status, heartbeat, local activation

**Panel registration attempt（面板登记尝试）**:
An owner-scoped request to establish or renew a panel session registration, distinct from the registration already present in the panel. An attempt invalidated by an explicit stop or the end of its Owner’s life never becomes valid again, even if that Owner later returns.
_Avoid_: panel session registration, local activation, online status

**Panel session online status（面板会话在线状态）**:
The panel-owned assessment of whether a registered session has been heard from recently enough to count as online. Becoming offline does not itself remove the session registration.
_Avoid_: registration, unregister, client failure count

**Panel agent state（面板代理状态）**:
The panel-facing classification of a registered agent as working, idle before a Round end has been observed since connection, or awaiting input after an observed Round end. It combines the framework’s current activity condition with connection-local completion evidence, and is distinct from online status.
_Avoid_: framework Agent activity state, panel online status, extension activation

**Panel Round completion observation（面板轮次结束观测）**:
Evidence that a Round has ended since the current panel connection began, distinct from the agent merely being idle when it connects. This observation does not assert completion of the user’s overall goal; truncating a round because of recovery or reloading is not such completion evidence.
_Avoid_: current idleness, task success, online status
