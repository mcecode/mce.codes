import type { RehypePlugin } from "@astrojs/markdown-remark";
import type { AstroIntegration, AstroUserConfig } from "astro";
import type { Options as AutolinkHeadingsOptions } from "rehype-autolink-headings";
import type { Options as ClassNamesOptions } from "rehype-class-names";
import type {
  LegacyAsyncImporter,
  LegacySharedOptions,
  LegacySyncImporter
} from "sass";
import type { ShikiTransformer } from "shiki";
import type { PluginOption } from "vite";

import cp from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import nodeUrl from "node:url";
import util from "node:util";

import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
// @ts-expect-error - There's no type declaration but it exists.
import remarkA11yEmoji from "@fec/remark-a11y-emoji";
import { addExtension, createFilter, dataToEsm } from "@rollup/pluginutils";
import compress from "astro-compress";
import { walk } from "estree-walker";
import findCacheDirectory from "find-cache-dir";
import gifsicle from "gifsicle";
import { customAlphabet } from "nanoid";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeClassNames from "rehype-class-names";
import sharp from "sharp";
sharp.cache(false);

//==================================================
// Astro - Markdown transformers and plugins
//==================================================

const classNamesTransformer: ShikiTransformer = {
  name: "class-names",
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

// Workaround since 'shikiConfig' does not support 'defaultColor' and
// 'cssVariablePrefix' options yet. This manually does what happens when
// 'defaultColor' is set to 'false' and 'cssVariablePrefix' is set to
// '--c-code-'.
// https://github.com/withastro/astro/issues/11238#issuecomment-2165715631
function replaceShikiProperty(
  style: string,
  property: "background-color" | "--shiki-dark-bg" | "color" | "--shiki-dark"
) {
  const regex = new RegExp(`${property}:(?<hex>#[0-9a-z]{3,8})`, "i");

  let variableName: string;
  switch (property) {
    case "background-color": {
      variableName = "--c-code-light-bg";
      break;
    }
    case "--shiki-dark-bg": {
      variableName = "--c-code-dark-bg";
      break;
    }
    case "color": {
      variableName = "--c-code-light";
      break;
    }
    case "--shiki-dark": {
      variableName = "--c-code-dark";
      break;
    }
  }

  const hex = style.match(regex)!.groups!.hex;

  return style.replace(regex, `${variableName}:${hex}`);
}
const themeTransformer: ShikiTransformer = {
  name: "theme",
  pre(node) {
    let style = node.properties.style as string;

    style = replaceShikiProperty(style, "background-color");
    style = replaceShikiProperty(style, "--shiki-dark-bg");
    style = replaceShikiProperty(style, "color");
    style = replaceShikiProperty(style, "--shiki-dark");

    node.properties.style = style;
  },
  span(node) {
    let style = node.properties.style as string;

    style = replaceShikiProperty(style, "color");
    style = replaceShikiProperty(style, "--shiki-dark");

    node.properties.style = style;
  }
};

const autolinkHeadingsPlugin: [RehypePlugin, AutolinkHeadingsOptions] = [
  rehypeAutolinkHeadings,
  { behavior: "wrap" }
];

//==================================================
// Astro - Integrations
//==================================================

const execFile = util.promisify(cp.execFile);
const optimizeImagesIntegration: AstroIntegration = {
  name: "optimize-images",
  hooks: {
    async "astro:build:done"({ dir, routes }) {
      type Resize = "" | "up" | "down";
      type Images = { original: string; webp: string[]; resize: Resize }[];
      type MatchGroups = {
        resize: Resize;
        preSrc: string;
        src: string;
        postSrc: string;
      };

      const resizeSuffixes = ["a", "b", "c", "d", "e"];
      const resizeUpMultipliers = [1, 1.5, 2, 3, 4];
      const resizeDownMultipliers = [0.25, 0.375, 0.5, 0.75, 1];
      const images: Images = [];

      for (const route of routes) {
        if (!route.distURL) {
          continue;
        }

        const htmlPath = nodeUrl.fileURLToPath(route.distURL);
        let html = await fs.readFile(htmlPath, "utf-8");
        const matches = html.matchAll(
          /<img optimize-image resize="(?<resize>[a-z-]*)"(?<preSrc>.+)src="(?<src>[^"]+)"(?<postSrc>.+)>/g
        );

        for (const match of matches) {
          const { resize, preSrc, src, postSrc } = match.groups as MatchGroups;
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

          html = html.replace(
            match[0],
            `
              <source srcset="${
                webp.length === 1
                  ? webp[0]
                  : webp.map(
                      (filePath, i) => `${filePath} ${resizeUpMultipliers[i]}x`
                    )
              }" type="image/webp">
              <img ${preSrc} src="${src}" ${postSrc}>
            `
          );
        }

        await fs.writeFile(htmlPath, html, "utf-8");
      }

      const distDir = nodeUrl.fileURLToPath(dir);
      const cacheDir = findCacheDirectory({
        name: "astro-optimize-images",
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

const stylesDir = nodeUrl.fileURLToPath(
  path.join(path.dirname(import.meta.url), "src", "styles")
);

const partialsImport = '@use "partials:" as *;';
const importScssPartials: LegacySyncImporter = (url) => {
  if (!url.startsWith("partials:")) {
    return null;
  }

  return { file: path.join(stylesDir, "partials", "_index.scss") };
};

const importScssJson: LegacyAsyncImporter = (url, _, done) => {
  (async () => {
    if (!url.startsWith("json:")) {
      done(null);
    }

    const [, baseName = ""] = addExtension(url, ".json").split(":");
    const json = JSON.parse(
      await fs.readFile(path.join(stylesDir, "data", baseName), "utf-8")
    );

    let scss = "";
    for (const [key, value] of Object.entries(json)) {
      scss += `$${key}: (\n`;

      for (const [subKey, subValue] of Object.entries(value as {})) {
        scss += `  "${subKey}": "${subValue}",\n`;
      }

      scss += ");\n";
    }

    done({ contents: scss });
  })();
};

type ViteSassOptions = LegacySharedOptions<"sync" | "async"> & {
  /**
   * Injects code at the top of each stylesheet.
   */
  additionalData?: string;
};
const scss: ViteSassOptions = {
  additionalData: partialsImport,
  importer: [importScssPartials, importScssJson]
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

    walk(this.parse(code), {
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
  server: { host: true, port: 6001 },
  compressHTML: false,
  scopedStyleStrategy: "class",
  markdown: {
    smartypants: false,
    shikiConfig: {
      themes: { light: "slack-ochin", dark: "slack-dark" },
      transformers: [classNamesTransformer, themeTransformer]
    },
    remarkPlugins: [remarkA11yEmoji],
    rehypePlugins: [classNamesPlugin, rehypeHeadingIds, autolinkHeadingsPlugin]
  },
  integrations: [mdx(), optimizeImagesIntegration, compress({ Image: false })],
  vite: { css: { preprocessorOptions: { scss } }, plugins: [generateIdsPlugin] }
};
