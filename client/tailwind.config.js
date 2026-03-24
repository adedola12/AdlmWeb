// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Lexend", "sans-serif"],
        display: ["Lexend", "sans-serif"],
      },
      colors: {
        adlm: {
          orange: "#E86A27",
          blue: {
            600: "#239cff",
            700: "#005be3",
          },
          navy: {
            DEFAULT: "#05111f",
            deep: "#040d18",
            mid: "#061528",
            tertiary: "#091e39",
          },
        },
      },
      borderRadius: {
        adlm: "8px",
        "adlm-lg": "12px",
        "adlm-xl": "16px",
      },
    },
  },
  plugins: [],
};
