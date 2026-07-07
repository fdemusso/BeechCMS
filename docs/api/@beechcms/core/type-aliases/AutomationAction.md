[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / AutomationAction

# Type Alias: AutomationAction

> **AutomationAction** = \{ `body_template?`: `string`; `headers?`: `Record`&lt;`string`, `string`&gt;; `method?`: `"POST"` \| `"GET"` \| `"PUT"`; `type`: `"webhook"`; `url`: `string`; \} \| \{ `body_template`: `string`; `subject_template`: `string`; `to`: `string`; `type`: `"send_mail"`; \} \| \{ `field`: `string`; `type`: `"edit_field"`; `value`: `unknown`; \} \| \{ `field_map`: `Record`&lt;`string`, `string`&gt;; `seed_slug`: `string`; `type`: `"create_entry"`; \} \| [`SetVariableAction`](../interfaces/SetVariableAction.md)
