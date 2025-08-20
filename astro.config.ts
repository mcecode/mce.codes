import type { RehypePlugin } from "@astrojs/markdown-remark";
import type { AstroIntegration, AstroUserConfig } from "astro";
import type { Options as AutolinkHeadingsOptions } from "rehype-autolink-headings";
import type { Options as ClassNamesOptions } from "rehype-class-names";
import type { Options as ExternalLinksOptions } from "rehype-external-links";
import type { FileImporter, Importer, StringOptions } from "sass-embedded";
import type { ShikiTransformer } from "shiki";
import type { PluginOption } from "vite";

import cp from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import nodeURL from "node:url";
import util from "node:util";

import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
// @ts-expect-error - There's no type declaration but it exists.
import remarkA11yEmoji from "@fec/remark-a11y-emoji";
import { addExtension, createFilter, dataToEsm } from "@rollup/pluginutils";
import { transformerNotationDiff } from "@shikijs/transformers";
import compress from "astro-compress";
import { walk as walkJS } from "estree-walker";
import findCacheDirectory from "find-cache-dir";
import gifsicle from "gifsicle";
import { customAlphabet } from "nanoid";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeClassNames from "rehype-class-names";
import rehypeExternalLinks from "rehype-external-links";
import sharp from "sharp";
import {
  ELEMENT_NODE,
  h as createElementNode,
  parse as parseHTML,
  render as renderHTML,
  walk as walkHTML
} from "ultrahtml";
sharp.cache(false);

//==================================================
// Astro - Markdown transformers and plugins
//==================================================

const classNamesTransformer: ShikiTransformer = {
  name: "class-names",
  pre(node) {
    node.properties.class = "block-code-wrapper";
  },
  code(node) {
    node.properties.class = "block-code";
  },
  line(node) {
    node.properties.class = "block-code-line";
  },
  span(node) {
    node.properties.class = "block-code-token";
  }
};
const classNamesPlugin: [RehypePlugin, ClassNamesOptions] = [
  rehypeClassNames,
  { ":not(pre) > code": "inline-code" }
];
const diffNotationTransformer = transformerNotationDiff({
  classActivePre: "",
  classLineAdd: "diff insert",
  classLineRemove: "diff delete"
});

function replaceShikiProperty(
  style: string,
  property:
    | "--shiki-light-bg"
    | "--shiki-dark-bg"
    | "--shiki-light"
    | "--shiki-dark"
) {
  const regex = new RegExp(`${property}:(?<hex>#[0-9a-z]{3,8})`, "i");
  const variableName = property.replace("shiki", "c-code");
  const hex = style.match(regex)!.groups!.hex;
  return style.replace(regex, `${variableName}:${hex}`);
}
/**
 * This does what 'cssVariablePrefix' does when set to `--c-code-` since
 * `shikiConfig` does not support it.
 */
const cssVariablePrefixTransformer: ShikiTransformer = {
  name: "theme",
  pre(node) {
    let style = node.properties.style as string;

    style = replaceShikiProperty(style, "--shiki-light-bg");
    style = replaceShikiProperty(style, "--shiki-dark-bg");
    style = replaceShikiProperty(style, "--shiki-light");
    style = replaceShikiProperty(style, "--shiki-dark");

    node.properties.style = style;
  },
  span(node) {
    let style = node.properties.style as string;

    style = replaceShikiProperty(style, "--shiki-light");
    style = replaceShikiProperty(style, "--shiki-dark");

    node.properties.style = style;
  }
};

const autolinkHeadingsPlugin: [RehypePlugin, AutolinkHeadingsOptions] = [
  rehypeAutolinkHeadings,
  { behavior: "wrap" }
];

/**
 * Hijacks rehype-external-links to add classes to links whose href value
 * matches its text content instead of adding rel and target attributes.
 */
const externalLinksPlugin: [RehypePlugin, ExternalLinksOptions] = [
  rehypeExternalLinks,
  {
    rel: [],
    test: (element) => {
      if (
        element.children[0]?.type === "text" &&
        element.properties.href === element.children[0].value
      ) {
        return true;
      }

      return false;
    },
    properties: { class: "word-break-all" }
  }
];

//==================================================
// Astro - Integrations
//==================================================

const execFile = util.promisify(cp.execFile);
const optimizeMediaIntegration: AstroIntegration = {
  name: "optimize-media",
  hooks: {
    async "astro:build:done"({ dir, pages }) {
      const resizeValues = ["", "up", "down"] as const;
      const resizeSuffixes = ["a", "b", "c", "d", "e"] as const;
      const resizeUpMultipliers = [1, 1.5, 2, 3, 4] as const;
      const resizeDownMultipliers = [0.25, 0.375, 0.5, 0.75, 1] as const;

      const distDir = nodeURL.fileURLToPath(dir);
      const images: {
        original: string;
        webp: string[];
        resize: (typeof resizeValues)[number];
      }[] = [];

      const htmlPaths = pages.map(({ pathname }) =>
        path.join(distDir, pathname, "index.html")
      );
      for (const htmlPath of htmlPaths) {
        const htmlAST = parseHTML(await fs.readFile(htmlPath, "utf-8"));
        await walkHTML(htmlAST, async (node) => {
          if (
            node.type === ELEMENT_NODE &&
            node.name === "picture" &&
            Object.keys(node.attributes).includes("optimize-media")
          ) {
            const img = node.children.find((child) => child.name === "img");
            if (!img || img.type !== ELEMENT_NODE) {
              throw new Error("'picture' must have an 'img' child.");
            }

            const resize = node.attributes[
              "optimize-media-resize"
            ] as (typeof resizeValues)[number];
            if (!resizeValues.includes(resize)) {
              throw new Error("'resize' attribute must be set.");
            }

            const { src } = img.attributes;
            if (typeof src !== "string") {
              throw new Error("'src' attribute must be set.");
            }

            const extensionlessPath = src.slice(0, src.lastIndexOf("."));
            let webp;
            if (resize === "") {
              webp = [`${extensionlessPath}.webp`];
            } else {
              webp = resizeSuffixes.map(
                (suffix) => `${extensionlessPath}${suffix}.webp`
              );
            }

            images.push({ original: src, webp, resize });

            const source = createElementNode("source", {
              type: "image/webp",
              srcset:
                webp.length === 1
                  ? webp[0]
                  : webp.map(
                      (filePath, i) => `${filePath} ${resizeUpMultipliers[i]}x`
                    )
            });

            node.children = [source, img];
            delete node.attributes["optimize-media"];
            delete node.attributes["optimize-media-resize"];
          }
        });
        await fs.writeFile(htmlPath, await renderHTML(htmlAST), "utf-8");
      }

      const cacheDir = findCacheDirectory({
        name: "astro-optimize-media",
        create: true
      }) as string;
      const sharpOptions = { limitInputPixels: false, unlimited: true };
      const imageOptions = {
        png: { compressionLevel: 9, quality: 80 },
        jpg: { mozjpeg: true },
        webp: { effort: 6 }
      };
      for (let { original, webp, resize } of images) {
        original = path.join(distDir, original);
        webp = webp.map((filePath) => path.join(distDir, filePath));

        const format = path.extname(original).slice(1) as "gif" | "jpg" | "png";
        const image = sharp(original, {
          ...sharpOptions,
          animated: format === "gif"
        });

        const { width, height } = await image.metadata();
        const multiply =
          webp.length > 1 &&
          typeof width === "number" &&
          typeof height === "number";
        const multipliers =
          resize === "up" ? resizeUpMultipliers : resizeDownMultipliers;
        for (let i = 0; i < webp.length; i++) {
          const cachedWebp = path.join(
            cacheDir,
            path.basename(webp[i] as string)
          );

          try {
            await fs.access(cachedWebp);

            try {
              await fs.copyFile(cachedWebp, webp[i] as string);
            } catch {}
          } catch {
            const clone = image.clone();

            if (multiply) {
              clone.resize(
                width * (multipliers[i] as number),
                height * (multipliers[i] as number)
              );
            }

            // Compressing images in their original format before converting
            // them to WebP reduces the WebP file size. GIFs are compressed
            // using Gifsicle instead of Sharp, so that step is skipped for GIFs
            // for now.
            if (format !== "gif") {
              await sharp(
                await clone.toFormat(format, imageOptions[format]).toBuffer(),
                sharpOptions
              )
                .webp(imageOptions.webp)
                .toFile(webp[i] as string);
            } else {
              await clone
                .webp({
                  ...imageOptions.webp,
                  // For some reason, using lossless compression mode on large
                  // GIFs increase their WebP size but reduces the size of
                  // smaller GIFs, so it is turned on for GIFs smaller than 2MB.
                  lossless: (await fs.stat(original)).size / 2000 < 2000
                })
                .toFile(webp[i] as string);
            }

            await fs.copyFile(webp[i] as string, cachedWebp);
          }
        }

        const cachedOriginal = path.join(cacheDir, path.basename(original));
        try {
          await fs.access(cachedOriginal);

          try {
            await fs.copyFile(cachedOriginal, original);
          } catch {}
        } catch {
          switch (format) {
            case "gif": {
              await execFile(gifsicle, [
                "--batch",
                "--optimize=3",
                "--lossy=80",
                original
              ]);

              break;
            }

            case "png":
            case "jpg": {
              await fs.writeFile(
                original,
                await image.toFormat(format, imageOptions[format]).toBuffer(),
                "binary"
              );

              break;
            }
          }

          await fs.copyFile(original, cachedOriginal);
        }
      }
    }
  }
};

//==================================================
// Vite - SCSS
//==================================================

const stylesDir = path.join(path.dirname(import.meta.url), "src", "styles");

const partialsImport = '@use "partials:" as *;';
const importScssPartials: FileImporter<"sync"> = {
  findFileUrl(url) {
    if (url !== "partials:") {
      return null;
    }

    return new URL(path.join(stylesDir, "partials", "_index.scss"));
  }
};

const importScssJson: Importer<"async"> = {
  canonicalize(url) {
    if (!url.startsWith("json:")) {
      return null;
    }

    const [, baseName = ""] = addExtension(url, ".json").split(":");
    return new URL(path.join(stylesDir, "data", baseName));
  },
  async load(url) {
    const json = JSON.parse(await fs.readFile(url, "utf-8"));

    let scss = "";
    for (const [key, value] of Object.entries(json)) {
      scss += `$${key}: (\n`;

      for (const [subKey, subValue] of Object.entries(value as {})) {
        scss += `  "${subKey}": "${subValue}",\n`;
      }

      scss += ");\n";
    }

    return {
      syntax: "scss",
      contents: scss
    };
  }
};

/**
 * @see
 * {@link https://vite.dev/config/shared-options.html#css-preprocessoroptions}
 */
type ViteSassOptions = StringOptions<"async"> & {
  /**
   * Sets which Sass API to use.
   */
  api?: "legacy" | "modern" | "modern-compiler";
  /**
   * Injects code at the top of each stylesheet.
   */
  additionalData?: string;
};
const scss: ViteSassOptions = {
  api: "modern-compiler",
  additionalData: partialsImport,
  importers: [importScssPartials, importScssJson]
};

//==================================================
// Vite - Plugins
//==================================================

const filter = createFilter("**/*.ids.(ts|js)");
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const generatedIds = new Map();
const generateIdsPlugin: PluginOption = {
  name: "generate-ids",
  transform(code, id) {
    if (!filter(id)) {
      return;
    }

    const data = {};

    walkJS(this.parse(code), {
      enter(node, parent) {
        if (
          node.type === "VariableDeclaration" &&
          parent?.type === "ExportNamedDeclaration" &&
          node.kind === "const"
        ) {
          this.skip();

          for (const declarator of node.declarations) {
            // @ts-expect-error
            const fullId = `${id}-${declarator.id.name}`;

            if (!generatedIds.has(fullId)) {
              generatedIds.set(fullId, `astro-${nanoid()}`);
            }

            // @ts-expect-error
            data[declarator.id.name] = generatedIds.get(fullId);
          }
        }
      }
    });

    return {
      code: dataToEsm(data, {
        compact: true,
        preferConst: true
      }).replace(/export default(.+);/, "")
    };
  }
};

export default <AstroUserConfig>{
  site: "https://mce.codes",
  devToolbar: { enabled: false },
  compressHTML: false,
  scopedStyleStrategy: "class",
  markdown: {
    smartypants: false,
    shikiConfig: {
      defaultColor: false,
      themes: { light: "slack-ochin", dark: "slack-dark" },
      transformers: [
        classNamesTransformer,
        diffNotationTransformer,
        cssVariablePrefixTransformer
      ]
    },
    remarkPlugins: [remarkA11yEmoji],
    rehypePlugins: [
      classNamesPlugin,
      rehypeHeadingIds,
      autolinkHeadingsPlugin,
      externalLinksPlugin
    ]
  },
  integrations: [mdx(), optimizeMediaIntegration, compress({ Image: false })],
  vite: { css: { preprocessorOptions: { scss } }, plugins: [generateIdsPlugin] }
};
