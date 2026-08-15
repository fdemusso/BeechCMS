---
layout: home

hero:
  name: "BeechCMS"
  text: "Edge-Native Headless CMS"
  tagline: "Ultra-fast, schema-driven content engine engineered for Cloudflare Workers, D1, and R2."
  image:
    src: /images/dashboard-overview.png
    alt: BeechCMS Cockpit Dashboard
  actions:
    - theme: brand
      text: Get Started
      link: /guide
    - theme: alt
      text: First Project Tutorial
      link: /first-project

features:
  - title: Edge Native & Sub-Millisecond Speed
    details: Powered by Cloudflare Workers and D1 SQLite. Boots instantly across 300+ edge locations worldwide with zero cold start delays.
    icon: ⚡
  - title: Botanical Schema Compiler
    details: Content models are Seeds, attributes are Branches, records are Fruits. Compiles dynamically into indexed, high-performance physical tables.
    icon: 🌱
  - title: Application-Level Encryption (ALE)
    details: Protects confidential data with AES-256-GCM encryption and blind index HMAC hashing for secure exact-match querying without cleartext exposure.
    icon: 🛡️
  - title: Direct-to-R2 Media Streaming
    details: Zero binary payload flows through the Worker runtime. Uploads stream directly to Cloudflare R2 object storage via presigned URLs.
    icon: 📦
  - title: Dual-Table Mirror Staging
    details: Production tables serve published records at maximum speed, while work-in-progress drafts live in dedicated mirror tables promoting atomically.
    icon: 📑
  - title: Built-in Automations & Webhooks
    details: Non-blocking asynchronous email workflows powered by Resend and outbound webhook triggers dispatched reliably via Upstash QStash.
    icon: ⚙️
---
