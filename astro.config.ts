import type { AstroIntegration, AstroUserConfig } from "astro";
import type {
  LegacyAsyncImporter,
  LegacySharedOptions,
  LegacySyncImporter
} from "sass";
import type { PluginOption } from "vite";

import cp from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import nodeUrl from "node:url";
import util from "node:util";

import { addExtension, createFilter, dataToEsm } from "@rollup/pluginutils";
import compress from "astro-compress";
import { walk } from "estree-walker";
import findCacheDirectory from "find-cache-dir";
import gifsicle from "gifsicle";
import { customAlphabet } from "nanoid";
import sharp from "sharp";
sharp.cache(false);

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
      const sharpOptions = { limitInputPixels: false };
      const imageOptions = {
        png: { compressionLevel: 9, quality: 80 },
        webp: { effort: 6 }
      };
      for (let { original, webp, resize } of images) {
        original = path.join(distDir, original);
        webp = webp.map((filePath) => path.join(distDir, filePath));

        const format = path.extname(original).slice(1) as "gif" | "png";
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
                  // smaller GIFs, so it is turned on for GIFs smaller than 1MB.
                  lossless: (await fs.stat(original)).size / 1000 < 1000
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

            case "png": {
              await fs.writeFile(
                original,
                await image.png(imageOptions.png).toBuffer(),
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

    // @ts-expect-error
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
  scopedStyleStrategy: "class",
  experimental: { assets: true },
  integrations: [optimizeImagesIntegration, compress({ img: false })],
  vite: { css: { preprocessorOptions: { scss } }, plugins: [generateIdsPlugin] }
};
