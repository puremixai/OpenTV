/** @jest-environment node */
const fs = require('node:fs');
const vm = require('node:vm');
let mockOptions;
jest.mock('next-pwa', () => (options) => {
  mockOptions = options;
  return (config) => config;
});
test('API requests bypass Workbox caches before broader runtime rules', () => {
  require('../next.config')(require('next/constants').PHASE_PRODUCTION_BUILD);
  const rule = mockOptions.runtimeCaching[0];
  expect(rule.handler).toBe('NetworkOnly');
  for (const path of [
    '/api/search?q=test',
    '/api/search/ws?q=test',
    '/api/admin/config',
    '/api/favorites',
  ])
    expect(
      rule.urlPattern({
        url: new URL(path, 'http://localhost'),
        sameOrigin: true,
      })
    ).toBe(true);
  expect(
    rule.urlPattern({
      url: new URL('http://localhost/_next/static/a.js'),
      sameOrigin: true,
    })
  ).toBe(false);
  expect(
    rule.urlPattern({
      url: new URL('http://remote/api/search'),
      sameOrigin: false,
    })
  ).toBe(false);
});
test('service-worker activation deletes old API entries and preserves static/offline assets', async () => {
  const handlers = {};
  const requests = [
    '/api/search?q=test',
    '/api/admin/config',
    '/_next/static/a.js',
    '/__moontv_idb_video__/a/playlist.m3u8',
  ].map((path) => ({ url: 'http://localhost' + path }));
  const cache = {
    keys: async () => requests,
    delete: jest.fn(async () => true),
  };
  const self = {
    addEventListener: (type, handler) => {
      handlers[type] = handler;
    },
    location: { origin: 'http://localhost' },
    clients: { claim: jest.fn(async () => {}) },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve('../public/push-sw.js'), 'utf8'),
    {
      self,
      URL,
      caches: { keys: async () => ['apis'], open: async () => cache },
    }
  );
  let completed;
  handlers.activate({
    waitUntil: (promise) => {
      completed = promise;
    },
  });
  await completed;
  expect(cache.delete.mock.calls.map(([req]) => req.url)).toEqual(
    requests.slice(0, 2).map((req) => req.url)
  );
  expect(self.clients.claim).toHaveBeenCalled();
});
