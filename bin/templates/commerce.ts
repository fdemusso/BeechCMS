/** Product: e-commerce product catalog with prices, inventory and ratings */
export const PRODUCT_SEED: Seed = {
  slug: 'products',
  label: 'Product',
  labelPlural: 'Products',
  displayNameAlias: 'name',
  allowPublicRead: true,
  branches: [
    { alias: 'name',        label: 'Product Name', type: 'text', requiredOnCreate: true },
    { alias: 'description', label: 'Description',  type: 'richtext' },
    { alias: 'price',       label: 'Price',        type: 'number', numberOptions: { format: 'currency', currency: 'EUR', decimals: 2, min: 0, control: 'input', prefix: '€' } },
    { alias: 'inventory',   label: 'Stock level',  type: 'number', numberOptions: { min: 0, step: 1, control: 'stepper' } },
    { alias: 'rating',      label: 'Rating',       type: 'number', numberOptions: { min: 1, max: 5, step: 0.5, control: 'rating' } }
  ],
}

/** Review: product review */
export const REVIEW_SEED: Seed = {
  slug: 'reviews',
  label: 'Review',
  labelPlural: 'Reviews',
  displayNameAlias: 'title',
  allowPublicRead: true,
  branches: [
    { alias: 'title',   label: 'Review Title', type: 'text', requiredOnCreate: true },
    { alias: 'body',    label: 'Body',         type: 'text' },
    { alias: 'score',   label: 'Score',        type: 'number', numberOptions: { min: 1, max: 5, step: 1, control: 'rating' } }
  ],
}
