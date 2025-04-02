import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

export const collections = {
  notes: defineCollection({
    loader: glob({ base: "./src/content/notes", pattern: "**/*.{md,mdx}" }),
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
    loader: glob({ base: "./src/content/writings", pattern: "**/*.{md,mdx}" }),
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
