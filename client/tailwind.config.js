import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [path.join(root, "index.html"), path.join(root, "src/**/*.{js,jsx}")],
  theme: {
    extend: {
      colors: {
        ink: "#10291F",
        forest: { DEFAULT: "#0F3D2E", 900: "#0A2C21", 800: "#0F3D2E", 700: "#15513C" },
        moss: { DEFAULT: "#1F6B47", 600: "#1F6B47", 500: "#2A8257" },
        leaf: { DEFAULT: "#3A9D63", 400: "#57B47D" },
        sprout: "#8CCB9E",
        sage: { DEFAULT: "#CFE6D6", 200: "#DDEDE2", 100: "#E9F4EC" },
        mist: "#F2F8F3",
        ochre: { DEFAULT: "#9A6512", soft: "#F6EBD3" },
        clay: { DEFAULT: "#A63D2A", soft: "#F6E0DA" },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Bricolage Grotesque"', '"Noto Sans Devanagari"', '"Noto Sans Gujarati"', "system-ui", "sans-serif"],
        sans: ['"Public Sans"', '"Noto Sans Devanagari"', '"Noto Sans Gujarati"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        lift: "0 1px 0 rgba(15,61,46,0.06), 0 8px 24px -12px rgba(15,61,46,0.25)",
      },
    },
  },
  plugins: [],
};
