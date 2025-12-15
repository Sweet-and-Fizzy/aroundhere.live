export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
    // Enable all colors used for badges
    safelistColors: ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'gray'],
    input: {
      slots: {
        root: 'text-gray-900',
        base: 'text-gray-900 border-gray-400 placeholder:text-gray-500',
      },
    },
    selectMenu: {
      slots: {
        base: 'text-gray-900 border-gray-400',
        input: 'text-gray-900 placeholder:text-gray-500',
      },
    },
  },
})
