import { useEffect, useState } from 'react';

interface RuntimeConfig {
  AI_COMMENTS_ENABLED?: boolean;
}

export function useEnableAIComments(): boolean {
  const [enableAIComments, setEnableAIComments] = useState(false);

  useEffect(() => {
    // 在客户端获取运行时配置
    if (typeof window !== 'undefined') {
      const runtimeConfig = (window as any).RUNTIME_CONFIG as RuntimeConfig;
      setEnableAIComments(Boolean(runtimeConfig?.AI_COMMENTS_ENABLED));
    }
  }, []);

  return enableAIComments;
}
