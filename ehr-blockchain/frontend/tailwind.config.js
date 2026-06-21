/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
                serif: ['"Fraunces"', 'Georgia', 'serif'],
                mono: ['"IBM Plex Mono"', '"SFMono-Regular"', 'Menlo', 'monospace'],
            },
            colors: {
                // `cyan` is preserved as a class-name across pages; palette is
                // a clinical teal. Shades 200-500 all resolve to the primary
                // accent so every legacy `text-cyan-*` reads as solid teal
                // (no pastel intermediate shades). 50/100 are near-paper so
                // any `bg-cyan-100` pill becomes a near-invisible neutral.
                cyan: {
                    50: '#fafaf7',
                    100: '#f4f5f6',
                    200: '#0b6a7a',
                    300: '#0b6a7a',
                    400: '#0b6a7a',
                    500: '#0b6a7a',
                    600: '#084a57',
                    700: '#063640',
                    800: '#04262d',
                    900: '#021619',
                },
                // `mint` = success green for chips (200-300 solid green) +
                // gradient-button second stop (400/500 pinned to primary teal
                // so gradients flatten). No pastel shades.
                mint: {
                    50: '#fafaf7',
                    100: '#f4f5f6',
                    200: '#2e6948',
                    300: '#2e6948',
                    400: '#0b6a7a',
                    500: '#0b6a7a',
                    600: '#084a57',
                    700: '#063640',
                },
                // FIXED: readable colors for dark mode UI (slate-900 background)
                // Use white/slate for main text - much more readable!
                medical: {
                    50:  '#fafaf7',
                    100: '#f1f5f9',
                    200: '#1e293b',  // dark slate — main readable body
                    300: '#334155',  // readable grey
                    400: '#475569',  // muted but clear
                    500: '#64748b',  // dimmed hint
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#ffffff',
                },
                // Amber / red: pastel 50-200 collapsed to paper so nothing
                // reads as "lemon chiffon" or "blush". Saturated 300+ stays.
                amber: {
                    50:  '#fafaf7',
                    100: '#f4f5f6',
                    200: '#a36a00',
                    300: '#a36a00',
                    400: '#a36a00',
                    500: '#7a4e00',
                    600: '#543500',
                },
                red: {
                    50:  '#fafaf7',
                    100: '#f4f5f6',
                    200: '#a0131d',
                    300: '#a0131d',
                    400: '#a0131d',
                    500: '#7a0e16',
                    600: '#550a0f',
                },
            },
            boxShadow: {
                card: '0 1px 0 rgba(14, 26, 36, 0.04), 0 1px 2px rgba(14, 26, 36, 0.06)',
                glow: 'none',
                'glow-cyan': 'none',
                glass: 'none',
            },
            animation: {
                pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            letterSpacing: {
                caps: '0.14em',
            },
        },
    },
    plugins: [],
}