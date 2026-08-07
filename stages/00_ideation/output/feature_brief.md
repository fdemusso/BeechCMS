# 1. Feature Definition and Core Value
The Data Classification & Privacy System replaces the fragmented privacy configuration with a rigorous, 4-tier data classification matrix (Public, Internal, Confidential, Restricted). It enforces Application-Level Encryption (ALE) and secure hashing at the core, guaranteeing "Security by Design" regardless of the underlying database infrastructure. It ensures compliance with strict European privacy regulations (GDPR) by automatically filtering sensitive data from public and authenticated API endpoints based on contextual rules.

# 2. Domain Boundaries and Business Rules
- **PrivacyService:** The sole global authority for data protection. It intercepts payloads before database writes (to encrypt/hash) and intercepts responses before serving to the client (to filter/decrypt).
- **Application-Level Encryption (ALE):** `Confidential` data is encrypted using AES-256-GCM (via `crypto.subtle` for Edge compatibility) before touching the ORM. The database only ever stores ciphertext for these fields.
- **Strict Payload Diffing:** During `PATCH`/`UPDATE` operations, the `PrivacyService` must dynamically analyze the payload and apply encryption ONLY to fields actively being updated, preventing double-encryption of already protected database records.
- **The "Blind Database" Rule:** Due to ALE, the database is mathematically incapable of sorting or performing partial (`LIKE`) searches on `Confidential` fields. Any attempt to sort these fields will result in random ordering of the ciphertext. 

# 3. Primary Requirements (User Stories)
* AS A System Developer I WANT to classify schema fields into one of 4 strict levels (Public, Internal, Confidential, Restricted) SO THAT the system automatically applies the correct storage and serving policies without custom logic.
* AS A User I WANT my passwords to be classified as `Restricted` SO THAT they are securely hashed (Bcrypt) and permanently irrecoverable, even by system administrators.
* AS A User I WANT my highly sensitive data (e.g., third-party API keys, critical PII) to be classified as `Confidential` SO THAT it is symmetrically encrypted at rest (AES-GCM) and safe from database leaks.
* AS An Administrator I WANT to view `Internal` and `Confidential` data within the authenticated CMS interface SO THAT I can manage operations, while knowing this data is automatically scrubbed (`Hidden`) from all public APIs.

# 4. Secondary Requirements and Logical Constraints
- **Key Versioning:** The `PrivacyService` must format encrypted strings with a version identifier (e.g., `v1:<iv>:<ciphertext>`). This is a critical prerequisite to allow future Master Key rotation without breaking existing encrypted data.
- **Edge Compatibility:** The symmetric encryption implementation must rely on `crypto.subtle` (Web Crypto API) to ensure the system can run natively in Edge environments (e.g., Cloudflare Workers).
- **Blind Indexes for Exact Search:** To allow searching on `Confidential` fields (like an exact email match), the system must support generating a static SHA-256 hash (Blind Index) alongside the encrypted column.
- **Context-Aware API Filtering:** The response serialization helper must filter outgoing JSON based on the actor's role. `Internal` and `Confidential` data is `Hidden` on public endpoints but served in full on authenticated detail views (subject to RBAC). `Restricted` data is ALWAYS `Hidden` from all endpoints.

# 5. Out of Scope (Discarded during sparring)
- **Order-Preserving Encryption (OPE) / Sorting Confidential Data:** Explicitly discarded. `Confidential` fields CANNOT be sorted in the Admin UI. Implementing OPE violates Edge compatibility and weakens cryptographic security. 
- **Masking Confidential Data in Admin Lists:** Discarded. `Confidential` data will be served in cleartext to authenticated Admins with read permissions, since masking it prevents usability and we already accepted the no-sorting compromise.
- **Hashing API Keys / OAuth Secrets:** Discarded from the `Restricted` tier. Hashing makes them unusable for external API calls. They must be placed in the `Confidential` tier for symmetric encryption.
- **Role-Based Access Control (RBAC) Enforcement:** Formal RBAC enforcement (IDOR prevention) is deferred to the next sprint, although the Privacy layer will be designed to consume an actor context.
- **Audit Trail Logging:** Deferred to a future sprint. Tracking read access to `Confidential` data will be implemented later via the existing `logContentActivity` system.
