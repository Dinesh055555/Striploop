import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [tailwind({ config: path.join(root, "tailwind.config.js") }), autoprefixer()],
};
