import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addCredits } from '@/lib/credits';
import { verifyAndDecryptWechatNotify } from '@/lib/wechatpay';

/**
 * 微信支付异步通知（需在微信商户平台配置 notify_url 指向此接口）
 * 验签、解密后若 trade_state=SUCCESS 则加积分并更新订单，返回 { code: 'SUCCESS', message: '成功' }
 */
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('wechatpay-signature') || '';
    const body = await request.text();
    const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
    if (!apiV3Key) {
      return NextResponse.json({ code: 'FAIL', message: 'No API key' }, { status: 500 });
    }

    const decrypted = await verifyAndDecryptWechatNotify(signature, body, apiV3Key);
    if (!decrypted) {
      return NextResponse.json({ code: 'FAIL', message: 'Verify or decrypt failed' }, { status: 400 });
    }

    if (decrypted.trade_state !== 'SUCCESS') {
      return NextResponse.json({ code: 'SUCCESS', message: '成功' });
    }

    const order = await prisma.order.findUnique({
      where: { stripeId: decrypted.out_trade_no, provider: 'wechat' },
    });

    if (!order) {
      return NextResponse.json({ code: 'SUCCESS', message: '成功' });
    }

    if (order.status === 'completed') {
      return NextResponse.json({ code: 'SUCCESS', message: '成功' });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'completed' },
    });
    await addCredits(order.userId, order.credits);

    console.log(`[WeChat Notify] Completed order ${order.id}, added ${order.credits} credits for user ${order.userId}`);
    return NextResponse.json({ code: 'SUCCESS', message: '成功' });
  } catch (e) {
    console.error('[WeChat Notify] Error:', e);
    return NextResponse.json({ code: 'FAIL', message: 'Internal error' }, { status: 500 });
  }
}
