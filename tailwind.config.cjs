/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './templates/**/*.{html,js}',
    './src/**/*.{ts,js,html}',
    './public/**/*.{html,js}',
  ],
  safelist: [
    // Sidebar Go vars ($item/$child/$active/$label) are defined as Go strings inside {{- $item := "..." -}}
    // so Tailwind's content scanner doesn't see them as class attributes. Safelist ensures they are generated.
    'flex', 'items-center', 'gap-3', 'gap-2.5', 'px-3', 'py-2', 'rounded-lg', 'text-sm', 'text-xs', 'text-gray-400', 'hover:text-white', 'hover:bg-white/5', 'transition-colors',
    'bg-white/10', 'text-white',
    'ml-4', 'ml-6', 'pr-3',
    'px-3', 'pt-4', 'pb-1', 'text-[10px]', 'font-semibold', 'uppercase', 'tracking-wider', 'text-gray-500',
    'bg-gray-900', 'border-white/5', 'w-64', 'lg:w-64', 'lg:w-14', 'translate-x-0', '-translate-x-full', 'lg:translate-x-0',
    'flex-1', 'shrink-0', 'w-4', 'h-4', 'w-5', 'h-5', 'opacity-40', 'rotate-180',
  ],
  theme: {
    extend: {
      colors: {
        // Logo-adapted: #fa7b93 pink — 500 is logo, 800+ for white-text contrast
        brand: {
          50: '#fef7f8',
          100: '#feeff2',
          200: '#fddae0',
          300: '#fcbac6',
          400: '#fb98aa',
          500: '#fa7b93',
          600: '#da657d',
          700: '#b74e64',
          800: '#8e3147',
          900: '#721e33',
          950: '#590e22',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
