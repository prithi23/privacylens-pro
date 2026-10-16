// CSP blocks these external references. They remain observable DOM facts.
const container = document.getElementById('references');
for (const [tag, src] of [
  [
    'script',
    'https://www.google-analytics.com/analytics.js?fixture_marker=not-a-secret',
  ],
  ['script', 'https://region1.google-analytics.com/analytics.js'],
  ['img', 'https://doubleclick.net/pixel.gif'],
  ['img', 'https://connect.facebook.net/pixel.gif'],
  ['iframe', 'https://static.hotjar.com/frame'],
  ['img', 'https://cdn.assets.example.net/image.png'],
  ['script', 'https://notgoogle-analytics.com/not-a-tracker.js'],
]) {
  const element = document.createElement(tag);
  element.setAttribute('src', src);
  container.append(element);
}
