export async function onRequestGet(context) {
  const { env } = context;
  try {
    const backendUrl = await env.RV_KV.get('backendUrl');
    const bgGif = env.BG_GIF || null;
    return Response.json({ backendUrl: backendUrl || null, bgGif });
  } catch {
    return Response.json({ backendUrl: null, bgGif: null });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const { backendUrl, currentBackend, secret } = await request.json();
  
  // 1. 必须验证当前后端的 secret（防止未授权修改）
  if (!currentBackend || !secret) {
    return Response.json({ error: '需要当前后端地址和密钥' }, { status: 401 });
  }
  
  // 2. 检查当前后端是否有 secret
  let currentHasSecret = false;
  try {
    const statusRes = await fetch(`${currentBackend}/root/`);
    if (statusRes.ok) {
      const data = await statusRes.json();
      currentHasSecret = data.has_secret;
    }
  } catch {
    // 当前后端不可达，拒绝修改
    return Response.json({ error: '无法连接当前后端进行验证' }, { status: 502 });
  }
  
  // 3. 如果当前后端有 secret，必须验证
  if (currentHasSecret) {
    try {
      const authRes = await fetch(`${currentBackend}/root/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });
      if (!authRes.ok) {
        return Response.json({ error: '当前后端密钥验证失败' }, { status: 401 });
      }
    } catch {
      return Response.json({ error: '验证请求失败' }, { status: 502 });
    }
  } else {
    // 当前后端无 secret，拒绝修改（必须先设置密钥）
    return Response.json({ error: '当前后端未设置密钥，请先设置密钥' }, { status: 403 });
  }
  
  // 4. 验证目标后端可达
  try {
    const targetRes = await fetch(`${backendUrl}/root/`);
    if (!targetRes.ok) throw new Error('无法连接');
  } catch {
    return Response.json({ error: '无法连接目标后端' }, { status: 502 });
  }
  
  // 5. 保存配置到 KV
  await env.RV_KV.put('backendUrl', backendUrl);
  return Response.json({ success: true });
}