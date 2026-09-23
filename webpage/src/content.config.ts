import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const docs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.string(),
    order: z.number(),
    editPath: z.string().optional(),
    previous: z.string().optional(),
    next: z.string().optional(),
  }),
});

export const collections = { docs };
