/** Gallery item: image or media asset with title, tags and featured flag */
export const GALLERY_SEED: Seed = {
  slug: 'gallery',
  label: 'Item',
  labelPlural: 'Gallery',
  displayNameAlias: 'title',
  allowPublicRead: true,
  branches: [
    { id: 'gal_01', alias: 'title',       label: 'Title',       type: 'text', requiredOnCreate: true },
    { id: 'gal_02', alias: 'description', label: 'Description', type: 'text' },
    { id: 'gal_03', alias: 'image',       label: 'Image',       type: 'file', requiredOnCreate: true, fileOptions: { accept: 'image' } },
    { id: 'gal_04', alias: 'tags',        label: 'Tags',        type: 'json' },
    { id: 'gal_05', alias: 'date',        label: 'Date',        type: 'date' },
    { id: 'gal_06', alias: 'featured',    label: 'Featured',    type: 'boolean' },
  ],
}
