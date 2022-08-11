import legacy from '@vitejs/plugin-legacy';

export default {
  // Our website is just a single page. Use relative base path so that it can work from any folder
  // without configuration.
  base: './',
  plugins: [
    legacy({
      targets: [
        // The limiting factor is support for AbortController
        'chrome >= 66',
        'safari >= 12',
        'firefox >= 57'
      ],
      polyfills: false
    })
  ]
};
