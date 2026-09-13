const React = require('react');
const { render, screen, fireEvent, act } = require('@testing-library/react');
const { CURRENT_VERSION } = require('../src/lib/version');
const {
  checkForUpdates,
  compareVersions,
  UpdateStatus,
} = require('../src/lib/version_check');
const { VersionPanel } = require('../src/components/VersionPanel');

const originalFetch = global.fetch;
const changelogUrl =
  'https://raw.githubusercontent.com/puremixai/xtv/main/CHANGELOG';
const release = (version) =>
  `# XTV\n\n## [${version}] - 2026-09-13\n### Changed\n- XTV 界面更新\n`;
const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 404,
  statusText: ok ? 'OK' : 'Not Found',
  text: async () => body,
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('checks the XTV release feed rather than an upstream release with a larger number', async () => {
  global.fetch = jest.fn(async (url) =>
    response(
      String(url).split('?')[0] === changelogUrl
        ? release(CURRENT_VERSION)
        : '999.0.0'
    )
  );
  expect(await checkForUpdates()).toBe(UpdateStatus.NO_UPDATE);
});

test('recognizes a newer release from the XTV changelog', async () => {
  global.fetch = jest.fn(async () => response(release('999.0.0')));
  expect(await checkForUpdates()).toBe(UpdateStatus.HAS_UPDATE);
});

test.each([
  '## [999.0.0] - 2026-09-13\n### Added\n- 上游版本\n',
  '# XTV\n\n尚无发布记录',
  '# XTV\n\n## [1..0] - 2026-09-13\n### Changed\n- 无效版本\n',
])(
  'rejects an unbranded or malformed feed instead of advertising an update: %s',
  async (body) => {
    global.fetch = jest.fn(async () => response(body));
    expect(await checkForUpdates()).toBe(UpdateStatus.FETCH_FAILED);
  }
);

test('reports an unavailable XTV feed as a failed check', async () => {
  global.fetch = jest.fn(async () => response('Not Found', false));
  expect(await checkForUpdates()).toBe(UpdateStatus.FETCH_FAILED);
});

test.each(['<!doctype html>', '1..0', '999.0.0-preview', '999.0.0.1'])(
  'does not treat invalid version data as a new release: %s',
  (version) => expect(compareVersions(version)).toBe(UpdateStatus.FETCH_FAILED)
);

test('the panel shows the installed XTV version and the current repository', async () => {
  global.fetch = jest.fn(async () => response(release(CURRENT_VERSION)));
  render(
    React.createElement(VersionPanel, { isOpen: true, onClose: jest.fn() })
  );
  expect(await screen.findByText('未发现新版本')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'XTV 版本信息' })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '前往 XTV 仓库' })).toHaveAttribute(
    'href',
    'https://github.com/puremixai/xtv'
  );
  expect(
    screen.getByText(`当前安装 XTV v${CURRENT_VERSION}`)
  ).toBeInTheDocument();
});

test('a failed panel check never claims the installed version is latest', async () => {
  global.fetch = jest.fn(async () => response('Not Found', false));
  render(
    React.createElement(VersionPanel, { isOpen: true, onClose: jest.fn() })
  );
  expect(await screen.findByText('暂时无法检查更新')).toBeInTheDocument();
  expect(screen.queryByText('未发现新版本')).not.toBeInTheDocument();
  expect(screen.queryByText('当前为最新版本')).not.toBeInTheDocument();
});

test('the panel distinguishes a pending check from a confirmed result', async () => {
  let finish;
  global.fetch = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render(
    React.createElement(VersionPanel, { isOpen: true, onClose: jest.fn() })
  );
  expect(screen.getByText('正在检查 XTV 更新')).toBeInTheDocument();
  expect(screen.queryByText('当前为最新版本')).not.toBeInTheDocument();
  await act(async () => finish(response(release(CURRENT_VERSION))));
  expect(screen.getByText('未发现新版本')).toBeInTheDocument();
});

test('the panel displays newer XTV release notes and links to the XTV repository', async () => {
  global.fetch = jest.fn(async () => response(release('999.0.0')));
  render(
    React.createElement(VersionPanel, { isOpen: true, onClose: jest.fn() })
  );
  expect(await screen.findByText('发现新版本')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看更新内容' }));
  expect(screen.getByText('XTV 界面更新')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '前往 XTV 仓库' })).toHaveAttribute(
    'href',
    'https://github.com/puremixai/xtv'
  );
});
