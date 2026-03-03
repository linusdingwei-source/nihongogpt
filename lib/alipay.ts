/**
 * 支付宝电脑网站支付（扫码/跳转收银台）
 * 环境变量：ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY（或证书路径）
 */
import { AlipaySdk } from 'alipay-sdk';

function getAlipayClient(): AlipaySdk | null {
  const appId = process.env.ALIPAY_APP_ID;
  const privateKey = process.env.ALIPAY_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY?.replace(/\\n/g, '\n');
  if (!appId || !privateKey || !alipayPublicKey) return null;
  return new AlipaySdk({
    appId,
    privateKey,
    alipayPublicKey,
    keyType: 'PKCS8',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  });
}

/**
 * 生成电脑网站支付跳转 URL（GET 方式，前端 window.location.href = url）
 */
export function getAlipayPagePayUrl(params: {
  outTradeNo: string;
  totalAmount: string; // 元，两位小数，如 "35.00"
  subject: string;
  returnUrl: string;
  notifyUrl: string;
  body?: string;
}): string | null {
  const client = getAlipayClient();
  if (!client) return null;
  const url = client.pageExecute('alipay.trade.page.pay', 'GET', {
    bizContent: {
      out_trade_no: params.outTradeNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: params.totalAmount,
      subject: params.subject,
      body: params.body || '',
    },
    returnUrl: params.returnUrl,
    notifyUrl: params.notifyUrl,
  });
  return url;
}

/**
 * 验证支付宝异步通知签名（notify 回调用）
 */
export function verifyAlipayNotifySign(postData: Record<string, string>): boolean {
  const client = getAlipayClient();
  if (!client) return false;
  return client.checkNotifySign(postData);
}

export { getAlipayClient };
