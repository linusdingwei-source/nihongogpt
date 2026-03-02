import { NextResponse } from 'next/server';

/**
 * 健康检查接口，供 SAE/负载均衡 探测应用是否存活
 */
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
