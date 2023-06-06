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
      type Images = { original: string; webp: string | string[] }[];
      type MatchGroups = {
        resize?: string;
        preSrc: string;
        src: string;
        postSrc: string;
      };

      const resizeSizes = [1, 1.5, 2, 3, 4];
      const images: Images = [];

      for (const route of routes) {
        if (!route.distURL) {
          continue;
        }

        const htmlPath = nodeUrl.fileURLToPath(route.distURL);
        let html = await fs.readFile(htmlPath, "utf-8");
        const matches = html.matchAll(
          /<img optimize-image (?<resize>resize="true")?(?<preSrc>.+)src="(?<src>[^"]+)"(?<postSrc>.+)>/g
        );

        for (const match of matches) {
          const { resize, preSrc, src, postSrc } = match.groups as MatchGroups;
          const baseName = src.slice(0, src.lastIndexOf("."));
          let webp;

          if (resize) {
            webp = resizeSizes.map((size) => `${baseName}-${size}.webp`);
          } else {
            webp = `${baseName}.webp`;
          }

          images.push({ original: src, webp });

          html = html.replace(
            match[0],
            `
              <source srcset="${
                typeof webp === "string"
                  ? webp
                  : webp.map((fileName, i) => `${fileName} ${resizeSizes[i]}x`)
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
      for (let { original, webp } of images) {
        original = path.join(distDir, original);

        if (typeof webp === "string") {
          webp = [path.join(distDir, webp)];
        } else {
          webp = webp.map((fileName) => path.join(distDir, fileName));
        }

        const format = path.extname(original).slice(1);
        const image = sharp(original, {
          limitInputPixels: false,
          animated: format === "gif"
        });
        const { width, height } = await image.metadata();

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

            if (typeof width === "number" && typeof height === "number") {
              clone.resize(
                width * (resizeSizes[i] as number),
                height * (resizeSizes[i] as number)
              );
            }

            await clone
              .webp({
                effort: 6,
                // For some reason, using lossless compression mode on large
                // GIFs increase their WebP size.
                lossless:
                  format === "gif" &&
                  // Less than 1MB
                  (await fs.stat(original)).size / 1000 < 1000
              })
              .toFile(webp[i] as string);
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
                await image
                  .png({ compressionLevel: 9, palette: true })
                  .toBuffer(),
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
