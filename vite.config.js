import legacy from '@vitejs/plugin-legacy';

export default {
  // Our website is just a single page. Use relative base path so that it can work from any folder
  // without configuration.
  base: './',
  plugins: [
    legacy({
      targets: [
        'chrome >= 70',
        'chromeandroid >= 70',
        'ios >= 12',
        'safari >= 12',
        'edge >= 18',
        'firefox >= 68'
      ]
    })
  ]
};
