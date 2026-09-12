[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SCHEMA\_FINGERPRINT\_VERSION

# Variable: SCHEMA\_FINGERPRINT\_VERSION

> `const` **SCHEMA\_FINGERPRINT\_VERSION**: `1` = `1`

Bumped ONLY when the projection below or the canonical byte format changes — i.e. when
fingerprints computed by two builds are no longer comparable. It is carried in the fingerprint
string itself so a version skew reads as a mismatch instead of as an accidental match.
