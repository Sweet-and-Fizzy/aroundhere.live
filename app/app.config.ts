export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
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
