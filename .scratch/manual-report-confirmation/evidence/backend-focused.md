# Backend focused verification

Command (herdr-bot root):
`cargo test --manifest-path backend/Cargo.toml --test workflow_dispatch && cargo build --manifest-path backend/Cargo.toml --example safe_shutdown_shell --bin herdr-fixture`

Observed: workflow_dispatch 165 passed, suite 63.95s. Build of safe_shutdown_shell and herdr-fixture succeeded (dev profile, 4.76s). Overall command exit 0, 121.00s.

Coverage includes new Session-resolved frozen report policy, retained executions after retry, nested dual-role outward policy, malformed/unassociated requests, legacy default, and unchanged reports/host effects after context reads. Context endpoint is read-only and does not enforce approval tokens.
