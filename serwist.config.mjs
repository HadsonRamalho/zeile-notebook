export default {
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  globDirectory: ".",
  globPatterns: [
    "public/**/*.{js,css,html,png,jpg,jpeg,svg,webp,woff2}",
    ".next/static/chunks/**/*.js",
    ".next/static/css/**/*.css",
    ".next/static/media/**/*.woff2",
  ],
  modifyURLPrefix: {
    "public/": "/",
    ".next/": "/_next/",
  },
};
