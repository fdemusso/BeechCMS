/** Post: blog article with rich text, cover image, tags and SEO */
export const POST_SEED: Seed = {
  slug: 'posts',
  label: 'Post',
  labelPlural: 'Posts',
  displayNameAlias: 'title',
  allowPublicRead: true,
  allowDrafts: true,
  branches: [
    { id: 'pst_01', alias: 'title',           label: 'Title',                type: 'text',     requiredOnCreate: true },
    { id: 'pst_02', alias: 'publishedAt',      label: 'Published at',         type: 'date' },
    { id: 'pst_03', alias: 'coverImage',       label: 'Cover image',          type: 'file', fileOptions: { accept: 'image' } },
    { id: 'pst_04', alias: 'excerpt',          label: 'Excerpt',              type: 'text' },
    { id: 'pst_05', alias: 'tags',             label: 'Tags',                 type: 'json',     options: ['news', 'tutorial', 'release', 'guide', 'opinion'] },
    { id: 'pst_06', alias: 'body',             label: 'Body',                 type: 'richtext' },
    { id: 'pst_07', alias: 'metaTitle',        label: 'Meta title (SEO)',     type: 'text' },
    { id: 'pst_08', alias: 'metaDescription',  label: 'Meta description (SEO)', type: 'text' },
  ],
}

/** Author: content creator profile with photo and social link */
export const AUTHOR_SEED: Seed = {
  slug: 'authors',
  label: 'Author',
  labelPlural: 'Authors',
  displayNameAlias: 'name',
  allowPublicRead: true,
  branches: [
    { id: 'aut_01', alias: 'name',    label: 'Name',        type: 'text', requiredOnCreate: true },
    { id: 'aut_02', alias: 'bio',     label: 'Bio',         type: 'text' },
    { id: 'aut_03', alias: 'photo',   label: 'Photo',       type: 'file', fileOptions: { accept: 'image' } },
    { id: 'aut_04', alias: 'website', label: 'Website URL', type: 'text' },
    { id: 'aut_05', alias: 'active',  label: 'Active',      type: 'boolean' },
  ],
}
