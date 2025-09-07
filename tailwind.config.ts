import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#7E36D1", // Purple
          pink: "#FF0085",    // Accent
          blue: "#2D81F7",    // Blue
          gray: "#1F2937"     // Neutral dark gray
        }
      }
    }
  },
  plugins: []
};

export default config;

