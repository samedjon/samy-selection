import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171412",
        studio: "#f7f3ec",
        gold: "#c89b3c",
        clay: "#a7553d",
        leaf: "#2f6a5f"
      },
      boxShadow: {
        lift: "0 16px 45px rgba(23, 20, 18, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
