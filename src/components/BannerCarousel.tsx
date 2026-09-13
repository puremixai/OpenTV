'use client';

import {
  ChevronLeft,
  ChevronRight,
  Film,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getDoubanDetail } from '@/lib/douban.client';
import { logger } from '@/lib/logger';
import {
  type TMDBItem,
  getGenreNames,
  getTMDBImageUrl,
} from '@/lib/tmdb.client';

import ProxyImage from '@/components/ProxyImage';

interface BannerCarouselProps {
  autoPlayInterval?: number; // 自动播放间隔（毫秒）
  delayLoad?: boolean; // 是否延迟加载（等页面加载完毕后再加载）
}

type HomeBannerHeightScale = '1' | '1.5' | '2';

const getSavedBannerHeightScale = (): HomeBannerHeightScale => {
  if (typeof window === 'undefined') return '1';

  const saved = localStorage.getItem('homeBannerHeightScale');
  return saved === '1.5' || saved === '2' ? saved : '1';
};

// 扩展TMDBItem类型以支持TX数据源的额外字段
interface BannerItem extends TMDBItem {
  subtitle?: string; // TX数据源的子标题
  tags?: string[]; // TX数据源的标签
  trailer_url?: string | null; // 豆瓣预告片直链
  genres?: string[]; // 豆瓣数据源的类型标签
}

export default function BannerCarousel({
  autoPlayInterval = 5000,
  delayLoad = false,
}: BannerCarouselProps) {
  const router = useRouter();
  const [items, setItems] = useState<BannerItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [shouldLoad, setShouldLoad] = useState(!delayLoad); // 是否应该开始加载数据
  const [isPaused, setIsPaused] = useState(false);
  const [skipNextAutoPlay, setSkipNextAutoPlay] = useState(false); // 跳过下一次自动播放
  const [isYouTubeAccessible, setIsYouTubeAccessible] = useState(false); // YouTube连通性（默认false，检查后再决定）
  const [enableTrailers, setEnableTrailers] = useState(false); // 是否启用预告片（默认关闭）
  const [dataSource, setDataSource] = useState<string>(''); // 当前数据源
  const [trailersLoaded, setTrailersLoaded] = useState(false); // 预告片是否已加载
  const [isMuted, setIsMuted] = useState(true); // 视频是否静音（默认静音）
  const [bannerHeightScale, setBannerHeightScale] =
    useState<HomeBannerHeightScale>('1'); // 轮播图高度倍率
  const [rotationPaused, setRotationPaused] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [portraitArtwork, setPortraitArtwork] = useState<
    Record<string, boolean>
  >({});
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isManualChange = useRef(false); // 标记是否为手动切换

  // LocalStorage 缓存配置
  const LOCALSTORAGE_DURATION = 24 * 60 * 60 * 1000; // 1天

  // 根据数据源获取缓存key
  const getLocalStorageKey = (source: string) => {
    return `banner_trending_cache_${source}`;
  };

  // 跳转到播放页面
  const handlePlay = (title: string) => {
    router.push(`/play?title=${encodeURIComponent(title)}`);
  };

  // 切换音量
  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    // 直接更新当前视频元素的静音状态
    const currentVideo = videoRefs.current.get(currentIndex);
    if (currentVideo) {
      currentVideo.muted = newMutedState;
    }
  };

  // 获取图片原始URL（处理TX完整URL和TMDB路径）
  const getImageUrl = (path: string | null | undefined) => {
    if (!path) return '';
    // 如果是完整URL（TX数据源或豆瓣），直接返回原始地址
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    // 否则使用TMDB的URL拼接原始地址
    return getTMDBImageUrl(path, 'original');
  };

  // 获取视频URL（处理豆瓣视频代理）
  const getVideoUrl = (url: string | null) => {
    if (!url) return null;
    // 豆瓣视频直接使用服务器代理
    if (url.includes('doubanio.com')) {
      return `/api/video-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 读取本地设置
  useEffect(() => {
    const setting = localStorage.getItem('enableTrailers');
    if (setting !== null) {
      setEnableTrailers(setting === 'true');
    }

    setBannerHeightScale(getSavedBannerHeightScale());

    const handleHomeModulesUpdated = () => {
      setBannerHeightScale(getSavedBannerHeightScale());
    };

    window.addEventListener('homeModulesUpdated', handleHomeModulesUpdated);
    return () => {
      window.removeEventListener(
        'homeModulesUpdated',
        handleHomeModulesUpdated
      );
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  // 延迟加载：等待页面加载完毕后再开始加载轮播图数据
  useEffect(() => {
    if (!delayLoad) return;

    // 页面加载完毕后再开始加载
    if (document.readyState === 'complete') {
      setShouldLoad(true);
    } else {
      const handleLoad = () => {
        setShouldLoad(true);
      };
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, [delayLoad]);

  // 检测YouTube连通性 - 仅在启用预告片且数据源为TMDB时检测
  useEffect(() => {
    // 如果未启用预告片或数据源不是TMDB，不进行检测
    if (!enableTrailers || dataSource !== 'TMDB') {
      setIsYouTubeAccessible(false);
      return;
    }

    const checkYouTubeAccess = () => {
      const img = document.createElement('img');
      const timeout = setTimeout(() => {
        img.src = '';
        setIsYouTubeAccessible(false);
      }, 3000);

      img.onload = () => {
        clearTimeout(timeout);
        setIsYouTubeAccessible(true);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        setIsYouTubeAccessible(false);
      };

      // 添加随机查询参数避免缓存
      img.src = `https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg?t=${Date.now()}`;
    };

    checkYouTubeAccess();
  }, [enableTrailers, dataSource]);

  // 获取热门内容
  useEffect(() => {
    // 如果不应该加载，直接返回
    if (!shouldLoad) return;

    const fetchTrending = async () => {
      try {
        // 先尝试从所有可能的数据源缓存中读取，找到最新的缓存
        const sources = ['TMDB', 'TX', 'Douban'];
        let cachedData = null;
        let validSource = null;
        let cacheExpired = false;
        let latestTimestamp = 0;

        // 遍历所有数据源，找到最新的缓存
        for (const source of sources) {
          const cacheKey = getLocalStorageKey(source);
          const cached = localStorage.getItem(cacheKey);

          if (cached) {
            try {
              const { data, timestamp } = JSON.parse(cached);

              // 选择时间戳最新的缓存
              if (timestamp > latestTimestamp) {
                cachedData = data;
                validSource = source;
                latestTimestamp = timestamp;
                cacheExpired = Date.now() - timestamp > LOCALSTORAGE_DURATION;
              }
            } catch (e) {
              logger.error('解析缓存数据失败:', e);
            }
          }
        }

        // 乐观缓存：如果有缓存（无论是否过期），先显示缓存数据
        if (cachedData) {
          setItems(cachedData);
          setDataSource(validSource || ''); // 设置数据源
          setIsLoading(false);
          setTrailersLoaded(false); // 重置预告片加载状态
        }

        // 如果缓存过期或没有缓存，后台更新数据
        if (!cachedData || cacheExpired) {
          const response = await fetch('/api/tmdb/trending');
          const result = await response.json();

          if (result.code === 200 && result.list.length > 0) {
            const newDataSource = result.source || 'TMDB'; // 获取数据源标识
            const cacheKey = getLocalStorageKey(newDataSource);

            setItems(result.list);
            setDataSource(newDataSource); // 设置数据源
            setTrailersLoaded(false); // 重置预告片加载状态

            // 保存到 localStorage（使用数据源特定的key）
            try {
              localStorage.setItem(
                cacheKey,
                JSON.stringify({
                  data: result.list,
                  timestamp: Date.now(),
                })
              );
            } catch (e) {
              // localStorage 可能已满，忽略错误
              logger.error('保存到 localStorage 失败:', e);
            }
          }
        }
      } catch (error) {
        logger.error('获取热门内容失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrending();
  }, [shouldLoad]);

  // 前端获取豆瓣预告片
  useEffect(() => {
    // 只有在启用预告片、数据源是豆瓣、有数据且未加载预告片时才执行
    if (
      !enableTrailers ||
      dataSource !== 'Douban' ||
      items.length === 0 ||
      trailersLoaded
    ) {
      return;
    }

    const fetchDoubanTrailers = async () => {
      try {
        // 为每个项目获取预告片
        const itemsWithTrailers = await Promise.all(
          items.map(async (item) => {
            try {
              // 使用统一的豆瓣详情获取函数（会根据用户配置的代理设置自动选择请求方式）
              const detail = await getDoubanDetail(item.id.toString());

              // 获取预告片链接（取第一个）
              const trailerUrl =
                detail.trailers && detail.trailers.length > 0
                  ? detail.trailers[0].video_url
                  : null;

              return {
                ...item,
                trailer_url: trailerUrl,
              };
            } catch (error) {
              logger.error(`获取豆瓣电影 ${item.id} 预告片失败:`, error);
              return item;
            }
          })
        );

        setItems(itemsWithTrailers);
        setTrailersLoaded(true);
      } catch (error) {
        logger.error('获取豆瓣预告片失败:', error);
      }
    };

    fetchDoubanTrailers();
  }, [enableTrailers, dataSource, items.length, trailersLoaded]);

  // 切换轮播图时重置静音状态
  useEffect(() => {
    setIsMuted(true);
  }, [currentIndex]);

  // 控制视频播放/暂停和静音状态
  useEffect(() => {
    // 遍历所有视频元素
    videoRefs.current.forEach((video, index) => {
      if (index === currentIndex) {
        // 当前显示的视频：播放并设置静音状态
        video.muted = isMuted;
        video.play().catch(() => {
          // 忽略自动播放失败的错误
        });
      } else {
        // 非当前显示的视频：暂停
        video.pause();
      }
    });
  }, [currentIndex, isMuted]);

  // 自动播放
  useEffect(() => {
    if (
      items.length < 2 ||
      isPaused ||
      rotationPaused ||
      isFocusWithin ||
      reducedMotion ||
      !pageVisible
    )
      return;

    const timer = setInterval(() => {
      // 如果设置了跳过标志，跳过这一次自动播放
      if (skipNextAutoPlay) {
        setSkipNextAutoPlay(false);
        return;
      }

      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [
    items.length,
    isPaused,
    rotationPaused,
    isFocusWithin,
    reducedMotion,
    pageVisible,
    autoPlayInterval,
    skipNextAutoPlay,
  ]);

  const goToPrevious = useCallback(() => {
    isManualChange.current = true;
    setSkipNextAutoPlay(true);
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    setTimeout(() => {
      isManualChange.current = false;
    }, 100);
  }, [items.length]);

  const goToNext = useCallback(() => {
    isManualChange.current = true;
    setSkipNextAutoPlay(true);
    setCurrentIndex((prev) => (prev + 1) % items.length);
    setTimeout(() => {
      isManualChange.current = false;
    }, 100);
  }, [items.length]);

  const goToSlide = useCallback((index: number) => {
    isManualChange.current = true;
    setSkipNextAutoPlay(true);
    setCurrentIndex(index);
    setTimeout(() => {
      isManualChange.current = false;
    }, 100);
  }, []);

  // 触摸事件处理
  const handleTouchStart = (e: React.TouchEvent) => {
    // 防止在手动切换过程中触发
    if (isManualChange.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = 0; // 重置结束位置
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // 防止在手动切换过程中触发
    if (isManualChange.current) return;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    // 防止在手动切换过程中触发
    if (isManualChange.current) return;
    if (!touchStartX.current) return;

    // 如果有滑动，则执行滑动逻辑
    if (touchEndX.current !== 0) {
      const distance = touchStartX.current - touchEndX.current;
      const minSwipeDistance = 50; // 最小滑动距离

      if (Math.abs(distance) > minSwipeDistance) {
        if (distance > 0) {
          // 向左滑动，显示下一张
          goToNext();
        } else {
          // 向右滑动，显示上一张
          goToPrevious();
        }
      }
    }

    // 重置
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  if (isLoading || !shouldLoad) {
    return (
      <section
        className='cinema-hero cinema-hero-loading'
        data-height={bannerHeightScale}
        aria-label='正在加载精选推荐'
        aria-busy='true'
      >
        <div className='cinema-hero-loading-mark'>
          <Film size={34} strokeWidth={1} />
          <span>精彩，即将开场</span>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className='cinema-hero cinema-hero-empty'>
        <div className='cinema-hero-copy'>
          <p className='cinema-eyebrow'>你的私人影院</p>
          <h1>
            下一部好故事，
            <br />
            就在这里。
          </h1>
          <p className='cinema-synopsis'>
            搜索你想看的电影与剧集，开启今晚的观影时光。
          </p>
          <button
            className='cinema-primary'
            onClick={() => router.push('/search')}
          >
            <Play size={17} fill='currentColor' />
            探索影片
          </button>
        </div>
      </section>
    );
  }

  const currentItem = items[currentIndex] || items[0];
  const genres = currentItem.tags?.length
    ? currentItem.tags
    : currentItem.genres?.length
    ? currentItem.genres
    : getGenreNames(currentItem.genre_ids, 3);
  const showTrailer = enableTrailers && !reducedMotion && pageVisible;
  const renderingTrailer =
    showTrailer &&
    Boolean(
      currentItem.trailer_url || (currentItem.video_key && isYouTubeAccessible)
    );
  const showPoster =
    portraitArtwork[currentItem.id] ??
    currentItem.backdrop_path === currentItem.poster_path;

  return (
    <>
      <section
        className='cinema-hero'
        data-height={bannerHeightScale}
        data-poster={showPoster && !renderingTrailer}
        aria-roledescription='轮播图'
        aria-label='精选推荐'
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsFocusWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setIsFocusWithin(false);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className='cinema-hero-media' aria-hidden='true'>
          {items.map((item, index) => {
            const active = index === currentIndex;
            if (
              !active &&
              index !== (currentIndex + 1) % items.length &&
              index !== (currentIndex - 1 + items.length) % items.length
            )
              return null;
            return (
              <div
                key={item.id}
                className='cinema-hero-slide'
                data-active={active}
              >
                <ProxyImage
                  originalSrc={getImageUrl(
                    item.backdrop_path || item.poster_path
                  )}
                  alt=''
                  className='cinema-backdrop'
                  loading={active ? 'eager' : 'lazy'}
                  fetchPriority={active ? 'high' : 'low'}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    const portrait =
                      image.naturalWidth / image.naturalHeight < 1.35;
                    setPortraitArtwork((previous) =>
                      previous[item.id] === portrait
                        ? previous
                        : { ...previous, [item.id]: portrait }
                    );
                  }}
                />
                {active && item.trailer_url && showTrailer ? (
                  <video
                    ref={(element) => {
                      if (element) videoRefs.current.set(index, element);
                      else videoRefs.current.delete(index);
                    }}
                    src={getVideoUrl(item.trailer_url) || undefined}
                    className='cinema-backdrop cinema-trailer'
                    autoPlay
                    muted={isMuted}
                    loop
                    playsInline
                    preload='metadata'
                  />
                ) : active &&
                  item.video_key &&
                  isYouTubeAccessible &&
                  showTrailer ? (
                  <iframe
                    title={item.title + '预告片'}
                    src={
                      'https://www.youtube.com/embed/' +
                      item.video_key +
                      '?autoplay=1&mute=1&controls=0&loop=1&playlist=' +
                      item.video_key +
                      '&rel=0'
                    }
                    className='cinema-trailer-frame'
                    allow='autoplay; encrypted-media'
                    tabIndex={-1}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className='cinema-hero-shade' />
        {showPoster && !renderingTrailer && (
          <div className='cinema-hero-poster' aria-hidden='true'>
            <ProxyImage
              originalSrc={getImageUrl(
                currentItem.poster_path || currentItem.backdrop_path
              )}
              alt=''
              loading='eager'
            />
          </div>
        )}
        <div className='cinema-hero-copy'>
          <p className='cinema-eyebrow'>
            <span /> 今晚，值得一看
          </p>
          <h1 key={currentItem.id}>{currentItem.title}</h1>
          <div className='cinema-meta'>
            {currentItem.vote_average > 0 && (
              <span className='cinema-score'>
                {currentItem.vote_average.toFixed(1)} <span>评分</span>
              </span>
            )}
            {currentItem.release_date && (
              <span>{currentItem.release_date.split('-')[0]}</span>
            )}
            {genres?.slice(0, 3).map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          {(currentItem.subtitle || currentItem.overview) && (
            <p className='cinema-synopsis'>
              {currentItem.subtitle || currentItem.overview}
            </p>
          )}
          <div className='cinema-hero-actions'>
            <button
              className='cinema-primary'
              onClick={() => handlePlay(currentItem.title)}
            >
              <Play size={18} fill='currentColor' />
              立即观看
            </button>
            <button
              className='cinema-secondary'
              onClick={() =>
                router.push(
                  '/search?q=' + encodeURIComponent(currentItem.title)
                )
              }
            >
              搜索片源
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
        <div className='cinema-hero-pagination'>
          <div className='cinema-slide-position'>
            <span>{String(currentIndex + 1).padStart(2, '0')}</span>
            <span>/ {String(items.length).padStart(2, '0')}</span>
          </div>
          <div className='cinema-slide-dots'>
            {items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => goToSlide(index)}
                aria-label={'查看推荐：' + item.title}
                aria-pressed={index === currentIndex}
              >
                <span data-active={index === currentIndex} />
              </button>
            ))}
          </div>
          {items.length > 1 && (
            <div className='cinema-slide-controls'>
              <button onClick={goToPrevious} aria-label='上一部推荐'>
                <ChevronLeft size={18} />
              </button>
              <button onClick={goToNext} aria-label='下一部推荐'>
                <ChevronRight size={18} />
              </button>
              {!reducedMotion && (
                <button
                  onClick={() => setRotationPaused((value) => !value)}
                  aria-label={rotationPaused ? '继续自动轮播' : '暂停自动轮播'}
                  aria-pressed={rotationPaused}
                >
                  {rotationPaused ? <Play size={14} /> : <Pause size={14} />}
                </button>
              )}
            </div>
          )}
          {currentItem.trailer_url && showTrailer && (
            <button
              className='cinema-mute'
              onClick={toggleMute}
              aria-label={isMuted ? '开启预告片声音' : '关闭预告片声音'}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
        </div>
      </section>
      <nav
        className='cinema-feature-picker'
        aria-label='切换精选影片'
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsFocusWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setIsFocusWithin(false);
        }}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            className='cinema-feature-pick'
            onClick={() => goToSlide(index)}
            aria-label={`选择精选影片：${item.title}`}
            aria-pressed={index === currentIndex}
          >
            <ProxyImage
              originalSrc={getImageUrl(item.backdrop_path || item.poster_path)}
              alt=''
            />
            <span>
              <span className='cinema-feature-index'>
                {String(index + 1).padStart(2, '0')} /{' '}
                {index === currentIndex ? '正在推荐' : '精选影片'}
              </span>
              <strong>{item.title}</strong>
            </span>
          </button>
        ))}
      </nav>
    </>
  );
}
