# connect-bot

Joins an agent session to the omp-bot panel: `/connect-bot` registers the current session, `/connect-bot off` disconnects it. The panel owns its row's online assessment; the extension owns the registration it sends and the local effects that keep it current.

## Language

**Panel session registration（面板会话登记）**:
The presence of a connect-bot session record in the panel. Unregistering removes that record; an offline session can remain registered.
_Avoid_: online status, heartbeat, local activation

**Panel registration attempt（面板登记尝试）**:
An owner-scoped request to establish or renew a panel session registration, distinct from the registration already present in the panel. An attempt invalidated by an explicit stop or the end of its Owner’s life never becomes valid again, even if that Owner later returns.
_Avoid_: panel session registration, local activation, online status

**Panel session online status（面板会话在线状态）**:
The panel-owned assessment of whether a registered session has been heard from recently enough to count as online. Becoming offline does not itself remove the session registration.
_Avoid_: registration, unregister, client failure count
