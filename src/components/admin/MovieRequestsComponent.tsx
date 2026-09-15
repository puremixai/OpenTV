/* eslint-disable @typescript-eslint/no-explicit-any, no-console,react-hooks/exhaustive-deps */

'use client';

import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';
import { adminFetch as fetch } from '@/lib/admin-fetch';

import {
  AlertModal,
  buttonStyles,
  showError,
  showSuccess,
  useAlertModal,
  useLoadingState,
} from '@/components/admin/shared';
import ProxyImage from '@/components/ProxyImage';

export const MovieRequestsComponent = ({
  config,
  refreshConfig,
}: {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}) => {
  const { alertModal, showAlert, hideAlert } = useAlertModal();
  const { isLoading, withLoading } = useLoadingState();
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState<'pending' | 'fulfilled'>('pending');
  const [pendingCount, setPendingCount] = useState(0);
  const [fulfilledCount, setFulfilledCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // 求片功能设置
  const [enableMovieRequest, setEnableMovieRequest] = useState(
    config?.SiteConfig?.EnableMovieRequest ?? true
  );
  const [movieRequestCooldown, setMovieRequestCooldown] = useState(
    config?.SiteConfig?.MovieRequestCooldown ?? 3600
  );
  const [savingSettings, setSavingSettings] = useState(false);

  async function loadCounts() {
    try {
      const response = await fetch('/api/movie-requests');
      const data = await response.json();
      const allRequests = data.requests || [];
      setPendingCount(
        allRequests.filter((r: any) => r.status === 'pending').length
      );
      setFulfilledCount(
        allRequests.filter((r: any) => r.status === 'fulfilled').length
      );
    } catch (error) {
      console.error('加载求片数量失败:', error);
    }
  }

  async function loadRequests() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/movie-requests?status=${filter}&detail=true`
      );
      const data = await response.json();
      setRequests(data.requests || []);
    } catch (error) {
      console.error('加载求片列表失败:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
      void loadCounts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filter]);

  const handleFulfill = async (id: string) => {
    await withLoading(`fulfill_${id}`, async () => {
      try {
        const response = await fetch(`/api/movie-requests/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'fulfilled' }),
        });
        if (!response.ok) throw new Error('操作失败');
        showSuccess('已标记为已上架', showAlert);
        await loadRequests();
      } catch (err) {
        showError(err instanceof Error ? err.message : '操作失败', showAlert);
      }
    });
  };

  const handleDelete = async (id: string) => {
    await withLoading(`delete_${id}`, async () => {
      try {
        const response = await fetch(`/api/movie-requests/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('删除失败');
        showSuccess('删除成功', showAlert);
        await loadRequests();
      } catch (err) {
        showError(err instanceof Error ? err.message : '删除失败', showAlert);
      }
    });
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      if (!config) throw new Error('配置未加载');

      const updatedConfig = {
        SiteConfig: {
          EnableMovieRequest: enableMovieRequest,
          MovieRequestCooldown: movieRequestCooldown,
        },
      };

      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      if (!response.ok) throw new Error('保存失败');

      showSuccess('求片设置已保存', showAlert);
      await refreshConfig();
    } catch (err) {
      showError(err instanceof Error ? err.message : '保存失败', showAlert);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className='space-y-4'>
      {/* 求片功能设置 */}
      <div className='p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100 mb-4'>
          求片功能设置
        </h3>
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                启用求片功能
              </label>
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                关闭后用户将无法访问求片页面
              </p>
            </div>
            <label className='relative inline-flex items-center cursor-pointer'>
              <input
                type='checkbox'
                checked={enableMovieRequest}
                onChange={(e) => setEnableMovieRequest(e.target.checked)}
                className='sr-only peer'
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-hidden peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              求片冷却时间（秒）
            </label>
            <p className='text-xs text-gray-500 dark:text-gray-400 mb-2'>
              用户两次求片之间的最小间隔时间，默认3600秒（1小时）
            </p>
            <input
              type='number'
              min='0'
              value={movieRequestCooldown}
              onChange={(e) =>
                setMovieRequestCooldown(parseInt(e.target.value) || 0)
              }
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            />
            <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
              {movieRequestCooldown >= 3600
                ? `约 ${Math.floor(
                    movieRequestCooldown / 3600
                  )} 小时 ${Math.floor(
                    (movieRequestCooldown % 3600) / 60
                  )} 分钟`
                : movieRequestCooldown >= 60
                ? `约 ${Math.floor(movieRequestCooldown / 60)} 分钟`
                : `${movieRequestCooldown} 秒`}
            </p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className={buttonStyles.primary}
          >
            {savingSettings ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      {/* 求片列表 */}
      <div className='p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100 mb-4'>
          求片列表
        </h3>
        <div className='flex gap-2 mb-4'>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'pending'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            待处理 ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('fulfilled')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'fulfilled'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            已上架 ({fulfilledCount})
          </button>
        </div>

        {loading ? (
          <div className='flex justify-center py-8'>
            <div className='w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
          </div>
        ) : requests.length === 0 ? (
          <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
            暂无求片
          </div>
        ) : (
          <div className='space-y-3'>
            {requests.map((req) => (
              <div
                key={req.id}
                className='p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'
              >
                <div className='flex gap-4'>
                  {req.poster && (
                    <ProxyImage
                      originalSrc={req.poster}
                      alt={req.title}
                      className='w-16 h-24 object-cover rounded-sm'
                    />
                  )}
                  <div className='flex-1'>
                    <h3 className='font-medium text-gray-900 dark:text-gray-100'>
                      {req.title} {req.year && `(${req.year})`}
                    </h3>
                    <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
                      求片人数: {req.requestCount} 人
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-500 mt-1'>
                      {new Date(req.createdAt).toLocaleString('zh-CN')}
                    </p>
                    {req.requestedBy && (
                      <p className='text-xs text-gray-500 dark:text-gray-500 mt-1'>
                        求片用户: {req.requestedBy.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className='flex flex-col gap-2'>
                    {filter === 'pending' && (
                      <button
                        onClick={() => handleFulfill(req.id)}
                        disabled={isLoading(`fulfill_${req.id}`)}
                        className={buttonStyles.successSmall}
                      >
                        {isLoading(`fulfill_${req.id}`)
                          ? '处理中...'
                          : '标记已上架'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(req.id)}
                      disabled={isLoading(`delete_${req.id}`)}
                      className={buttonStyles.dangerSmall}
                    >
                      {isLoading(`delete_${req.id}`) ? '删除中...' : '删除'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={hideAlert}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        timer={alertModal.timer}
        showConfirm={alertModal.showConfirm}
      />
    </div>
  );
};
