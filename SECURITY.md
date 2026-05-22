<img width="1516" height="527" alt="Frame 11" src="https://github.com/user-attachments/assets/bed2d4bc-c807-4a05-9ab3-8a2399fd0875" />


# Security Policy

## Supported Versions

Security fixes are applied only to the latest published version of the `beechcms` npm package. Older versions do not receive backported patches.

| Version | Supported |
|---|---|
| Latest (`master`) | ✅ |
| Older releases | ❌ |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is available puts all users at risk.

Instead, send a private email to:

**[demusso1617@gmail.com](mailto:demusso1617@gmail.com)**

Please include:

- A clear description of the vulnerability and its potential impact
- The affected component (e.g. authentication handler, media upload, rate limiter)
- Step-by-step instructions to reproduce the issue
- Any proof-of-concept code, if available
- The version of the package or the commit SHA where you observed the issue

The more detail you provide, the faster the issue can be assessed and resolved.

---

## What to Expect

1. **Acknowledgement within 48 hours** — you will receive a reply confirming the report was received and is under review.
2. **Assessment within 7 days** — the report will be evaluated for severity and reproducibility. You will be informed whether it is accepted as a valid vulnerability.
3. **Fix and coordinated disclosure** — once a fix is ready, it will be released as a new npm version. You will be notified before public disclosure so you can verify the fix. Credit will be given in the release notes unless you prefer to remain anonymous.

---

## Scope

The following are considered in scope:

- Authentication and JWT handling (`apps/api/src/features/auth/`)
- Content and media access control
- Rate limiter bypass
- SQL injection or unsafe D1 query construction
- Token or credential exposure in logs or responses
- Dependency vulnerabilities with a clear attack vector against BeechCMS users

The following are out of scope:

- Vulnerabilities in Cloudflare's infrastructure
- Issues that require physical access to the deployment environment
- Theoretical vulnerabilities without a practical attack scenario
- Reports about missing security headers in the user's own deployment configuration

---

## Disclosure Policy

This project follows **coordinated disclosure**: vulnerabilities are kept private until a fix is published, at which point a security advisory is issued publicly. The goal is to protect users while giving the community full transparency after the risk is resolved.
