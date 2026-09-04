# Features

Deep-dive into the architectural pillars and capabilities powering the BeechCMS Botanical Engine.

## Architectural Pillars

- **Botanical Schema Compiler**: Dynamic compilation of Seeds, Branches, and Fruits into physical D1 tables.
- **Edge Content API**: Sub-millisecond Hono router with RFC 7807 problem details.
- **Application-Level Encryption (ALE)**: AES-256-GCM encryption with HMAC blind indexing for confidential fields.
- **Direct-to-R2 Media**: Presigned direct upload and streaming without Worker runtime memory saturation.
- **Dual-Table Mirror Staging**: Isolated draft staging tables promoted atomically to production.
- **Automations & Webhooks**: Non-blocking asynchronous queues powered by Upstash QStash and Resend.
