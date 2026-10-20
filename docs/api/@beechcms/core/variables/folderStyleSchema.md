[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / folderStyleSchema

# Variable: folderStyleSchema

> `const` **folderStyleSchema**: `ZodObject`&lt;\{ `color`: `ZodOptional`&lt;`ZodEnum`&lt;\{ `amber`: `"amber"`; `blue`: `"blue"`; `green`: `"green"`; `orange`: `"orange"`; `pink`: `"pink"`; `red`: `"red"`; `slate`: `"slate"`; `teal`: `"teal"`; `violet`: `"violet"`; \}&gt;&gt;; `description`: `ZodOptional`&lt;`ZodString`&gt;; `icon`: `ZodOptional`&lt;`ZodEnum`&lt;\{ `Book`: `"Book"`; `Bookmark`: `"Bookmark"`; `Briefcase`: `"Briefcase"`; `Calendar`: `"Calendar"`; `Camera`: `"Camera"`; `Crown`: `"Crown"`; `Flag`: `"Flag"`; `Folder`: `"Folder"`; `Gift`: `"Gift"`; `Heart`: `"Heart"`; `Home`: `"Home"`; `Image`: `"Image"`; `Music`: `"Music"`; `Star`: `"Star"`; `Sun`: `"Sun"`; `Tag`: `"Tag"`; `Users`: `"Users"`; `Video`: `"Video"`; \}&gt;&gt;; `label`: `ZodOptional`&lt;`ZodString`&gt;; \}, `$strip`&gt;

Cosmetic override of one gallery folder. `label` and `description` are display-only: the folder's group value is untouched.
