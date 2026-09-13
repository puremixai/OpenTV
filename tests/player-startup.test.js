const React = require('react');
const { act, renderHook } = require('@testing-library/react');

let mockHlsLoads = 0;
let mockPlayers = [];
jest.mock('artplayer', () => ({
  __esModule: true,
  default: class {
    constructor(option) {
      this.option = option;
      this.video = document.createElement('video');
      option.container.appendChild(this.video);
      this.paused = true;
      this.layers = { add: () => {} };
      this.on = () => {};
      mockPlayers.push(this);
    }
  },
}));
jest.mock('hls.js', () => ({
  __esModule: true,
  get default() {
    mockHlsLoads++;
    return class {
      static DefaultConfig = { loader: class {} };
      static Events = {
        MEDIA_ATTACHED: 'attached',
        MANIFEST_PARSED: 'parsed',
        ERROR: 'error',
      };
      constructor() {
        this.on = () => {};
      }
      loadSource(url) {
        this.url = url;
      }
      attachMedia(video) {
        this.video = video;
      }
      destroy() {
        this.destroyed = true;
      }
    };
  },
}));
jest.mock('../src/components/player/load-player-plugins', () => ({
  loadPlayerPlugins: async () => ({
    danmaku: undefined,
    thumbnails: undefined,
  }),
}));
const { usePlayerEngine } = require('../src/components/player/usePlayerEngine');

function context(overrides = {}) {
  const detail = { source: 'test', episodes: ['https://test/video.mp4'] };
  return {
    videoUrl: 'https://test/video.mp4',
    loading: false,
    currentEpisodeIndex: 0,
    currentSource: 'test',
    detail,
    totalEpisodes: 1,
    videoQualities: [],
    artRef: { current: document.createElement('div') },
    artPlayerRef: { current: null },
    videoMediaTypeRef: { current: 'file' },
    currentSourceRef: { current: 'test' },
    detailRef: { current: detail },
    currentSubtitleLabelRef: { current: '' },
    activeHarmonyHlsPlaybackModeRef: { current: null },
    activeNativeHlsAdBlockRef: { current: null },
    activeNetdiskHlsPlaybackModeRef: { current: null },
    blockAdEnabledRef: { current: false },
    isInitialLoadRef: { current: true },
    mediaCorsFallbackRef: { current: false },
    danmakuHeatmapDisabledRef: { current: true },
    quickForwardSecondsRef: { current: 10 },
    skipConfigRef: { current: { enable: false, intro_time: 0, outro_time: 0 } },
    playSync: { isInRoom: false, isOwner: false, shouldDisableControls: false },
    harmonyHlsPlaybackMode: 'hlsjs',
    netdiskHlsPlaybackMode: 'hlsjs',
    isHarmonyOS: false,
    supportsNativeHls: false,
    isNetdiskNativeHlsActive: () => false,
    isAdvancedSourceSubtitle: () => false,
    needsPrivateSourceCrossOrigin: () => false,
    isPlaybackThumbnailDisabled: () => true,
    buildNativeHlsPlaybackUrl: (url) =>
      `/native?url=${encodeURIComponent(url)}`,
    ensureVideoSource: (video, url) => {
      video.dataset.playUrl = url;
    },
    createCustomHlsLoader: (Hls) => Hls.DefaultConfig.loader,
    formatQuickForwardDuration: (seconds) => `${seconds}s`,
    setError: jest.fn(),
    setVideoError: jest.fn(),
    cleanupPlayer: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockHlsLoads = 0;
  mockPlayers = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('first playback creates the player without a fixed cleanup delay', async () => {
  const props = context();
  await act(async () => renderHook(() => usePlayerEngine(props)));
  expect(props.setError).not.toHaveBeenCalled();
  expect(props.artPlayerRef.current?.option.url).toBe('https://test/video.mp4');
});

test.each(['file', 'netdisk', 'harmony'])(
  '%s playback starts without loading HLS.js',
  async (mode) => {
    const props = context(
      mode === 'file'
        ? {}
        : {
            videoUrl: 'https://test/video.m3u8',
            videoMediaTypeRef: { current: 'hls' },
            isNetdiskNativeHlsActive: () => mode === 'netdisk',
            isHarmonyOS: mode === 'harmony',
            harmonyHlsPlaybackMode: 'native',
          }
    );
    await act(async () => renderHook(() => usePlayerEngine(props)));
    await act(async () => jest.advanceTimersByTime(100));
    expect(props.setError).not.toHaveBeenCalled();
    expect(props.artPlayerRef.current?.option.url).toBe(props.videoUrl);
    if (mode !== 'file') {
      const player = props.artPlayerRef.current;
      await act(async () =>
        player.option.customType.m3u8(player.video, props.videoUrl)
      );
      expect(player.video.src).toBe(
        mode === 'netdisk'
          ? 'https://test/video.m3u8'
          : 'http://localhost/native?url=https%3A%2F%2Ftest%2Fvideo.m3u8'
      );
    }
    expect(mockHlsLoads).toBe(0);
  }
);

test.each([
  'https://test/video.m3u8',
  '/api/proxy-m3u8?url=video',
  '/api/proxy/vod/m3u8?url=video',
])('HLS playback still attaches a loader for %s', async (url) => {
  const props = context({
    videoUrl: url,
    videoMediaTypeRef: { current: 'hls' },
  });
  await act(async () => renderHook(() => usePlayerEngine(props)));
  const player = props.artPlayerRef.current;
  await act(async () => player.option.customType.m3u8(player.video, url));
  expect(player.video.hls.url).toBe(url);
  expect(player.video.hls.video).toBe(player.video);
  expect(props.setError).not.toHaveBeenCalled();
});

test('a player first opened for MP4 can subsequently start HLS', async () => {
  const props = context();
  await act(async () => renderHook(() => usePlayerEngine(props)));
  const player = props.artPlayerRef.current;
  expect(mockHlsLoads).toBe(0);
  await act(async () =>
    player.option.customType.m3u8(player.video, 'https://test/next.m3u8')
  );
  expect(player.video.hls.url).toBe('https://test/next.m3u8');
});

test('StrictMode does not create a stale duplicate player after async imports', async () => {
  const props = context();
  await act(async () =>
    renderHook(() => usePlayerEngine(props), {
      wrapper: ({ children }) =>
        React.createElement(React.StrictMode, null, children),
    })
  );
  expect(mockPlayers).toHaveLength(1);
  expect(props.artRef.current.querySelectorAll('video')).toHaveLength(1);
});

test('a pending HLS import cannot attach to the video after the hook unmounts', async () => {
  const props = context();
  let view;
  await act(async () => {
    view = renderHook(() => usePlayerEngine(props));
  });
  const player = props.artPlayerRef.current;
  let pending;
  act(() => {
    pending = player.option.customType.m3u8(
      player.video,
      'https://test/stale.m3u8'
    );
    view.unmount();
  });
  await act(async () => pending);
  expect(player.video.hls).toBeUndefined();
});

test('rebuilding still awaits old player cleanup before replacing the container', async () => {
  const props = context({
    isHarmonyOS: true,
    harmonyHlsPlaybackMode: 'native',
  });
  props.artPlayerRef.current = { old: true };
  let release;
  props.cleanupPlayer = () =>
    new Promise((resolve) => {
      release = () => {
        props.artPlayerRef.current = null;
        resolve();
      };
    });
  await act(async () => renderHook(() => usePlayerEngine(props)));
  expect(mockPlayers).toHaveLength(0);
  await act(async () => release());
  expect(mockPlayers).toHaveLength(0);
  await act(async () => jest.advanceTimersByTime(100));
  expect(props.artPlayerRef.current.option.url).toBe('https://test/video.mp4');
});
