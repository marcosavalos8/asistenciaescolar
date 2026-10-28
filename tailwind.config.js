/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff", 100: "#d9eaff", 500: "#2f6fed", 600: "#1f57d6", 700: "#1a46ad", 900: "#14285c",
        },
      },
    },
  },
  plugins: [],
};
