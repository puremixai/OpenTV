import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedUser } from '@/lib/session';
import { isTVModeEnabled } from '@/lib/tv-mode';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- Load the runtime adapter only on the server or share the CommonJS server singleton.
const { listTVRemoteDevices } = require('@/lib/tv-remote-hub');

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isTVModeEnabled()) {
    return NextResponse.json({ error: 'TV 模式未启用' }, { status: 404 });
  }

  const authInfo = await getAuthenticatedUser(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  return NextResponse.json({
    devices: listTVRemoteDevices(authInfo.username),
  });
}
