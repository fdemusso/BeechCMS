[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/forms-react](../index.md) / fileToAttachment

# Function: fileToAttachment()

> **fileToAttachment**(`file`): `Promise`&lt;\{ `attachment`: [`FormFileAttachment`](../interfaces/FormFileAttachment.md); `error?`: `string`; \}&gt;

Reads a browser File object, verifies its magic bytes signature, and converts it
to a FormFileAttachment ready for submission to the BeechCMS Public Form API.

## Parameters

### file

`File`

The browser File instance to convert and validate.

## Returns

`Promise`&lt;\{ `attachment`: [`FormFileAttachment`](../interfaces/FormFileAttachment.md); `error?`: `string`; \}&gt;

A promise resolving to the attachment payload and any validation error encountered.
