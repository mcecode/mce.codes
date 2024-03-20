import { defineCollection, z } from "astro:content";

export const collections = {
  notes: defineCollection({
    type: "content",
    schema: z
      .object({
        title: z.string(),
        dateCreated: z.date(),
        dateUpdated: z.date()
      })
      .required()
      .strict()
  }),
  writings: defineCollection({
    type: "content",
    schema: z
      .object({
        title: z.string(),
        dateCreated: z.date(),
        dateUpdated: z.date()
      })
      .required()
      .strict()
  })
};
