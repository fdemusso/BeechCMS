[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ActivityAction

# Type Alias: ActivityAction

> **ActivityAction** = `"create"` \| `"update"` \| `"delete"` \| `"upload"` \| `"bulk_update"` \| `"security_alert"` \| `"trash"` \| `"restore"` \| `"purge"` \| `"publish"` \| `"discard_draft"` \| `"import"` \| `"revoke"` \| `"accept"` \| `"authorize"` \| `"login"` \| `"login_failed"` \| `"logout"`

What happened. `trash`, `restore` and `purge` keep a recoverable removal apart from an irreversible one, and
`publish` / `discard_draft` apart from an ordinary edit. `login`, `login_failed`, `logout` and `security_alert`
are the sign-in and abuse trail. An action never says *what* changed: `details` does (conventionally `op`).
