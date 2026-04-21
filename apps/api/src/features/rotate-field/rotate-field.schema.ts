import { z } from 'zod'

export const rotateFieldBodySchema = z.object({
  field: z.string().min(1, "field is required"),
  current: z.string().min(1, "current is required"),
  next: z.string().min(1, "next is required"),
})

export type RotateFieldBody = z.infer<typeof rotateFieldBodySchema>
