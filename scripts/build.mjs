import { build } from "vite";

import electronConfig from "../vite.electron.config.mjs";
import rendererConfig from "../vite.renderer.config.mjs";

await build(rendererConfig);
await build(electronConfig);
