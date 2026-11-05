const { chromium } = require('C:/Users/Iman/Desktop/current/finals-revision/capstone-1/node_modules/playwright');
(async () => {
  const [svg, png, w, h] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.goto('file:///' + svg.replace(/\\/g, '/'));
  await p.screenshot({ path: png });
  await b.close();
})();
