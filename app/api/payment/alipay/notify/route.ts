import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addCredits } from '@/lib/credits';
import { verifyAlipayNotifySign } from '@/lib/alipay';

/**
 * 支付宝异步通知（需在支付宝开放平台配置 notify_url 指向此接口）
 * 验签通过且 trade_status=TRADE_SUCCESS 后加积分并更新订单，最后返回 "success"（不能有换行或其它字符）
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let postData: Record<string, string>;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      postData = Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
    } else {
      postData = (await request.json()) as Record<string, string>;
    }

    const tradeStatus = postData.trade_status;
    const outTradeNo = postData.out_trade_no;

    if (!outTradeNo) {
      return new NextResponse('fail', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    if (!verifyAlipayNotifySign(postData)) {
      console.error('[Alipay Notify] Invalid sign');
      return new NextResponse('fail', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
      return new NextResponse('success', { headers: { 'Content-Type': 'text/plain' } });
    }

    const order = await prisma.order.findUnique({
      where: { stripeId: outTradeNo, provider: 'alipay' },
    });

    if (!order) {
      console.error('[Alipay Notify] Order not found:', outTradeNo);
      return new NextResponse('success', { headers: { 'Content-Type': 'text/plain' } });
    }

    if (order.status === 'completed') {
      return new NextResponse('success', { headers: { 'Content-Type': 'text/plain' } });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'completed' },
    });
    await addCredits(order.userId, order.credits);

    console.log(`[Alipay Notify] Completed order ${order.id}, added ${order.credits} credits for user ${order.userId}`);
    return new NextResponse('success', { headers: { 'Content-Type': 'text/plain' } });
  } catch (e) {
    console.error('[Alipay Notify] Error:', e);
    return new NextResponse('fail', { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}
