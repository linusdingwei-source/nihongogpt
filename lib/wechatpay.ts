/**
 * 微信支付 Native 扫码
 * 环境变量：WECHAT_PAY_APP_ID, WECHAT_PAY_MCH_ID, WECHAT_PAY_PRIVATE_KEY (PEM), WECHAT_PAY_SERIAL_NO, WECHAT_PAY_API_V3_KEY
 */
let WxPay: any = null;

function getWxPay() {
  if (WxPay) return WxPay;
  try {
    WxPay = require('wechatpay-node-v3');
    return WxPay;
  } catch {
    return null;
  }
}

function createPayInstance(): InstanceType<any> | null {
  const appid = process.env.WECHAT_PAY_APP_ID;
  const mchid = process.env.WECHAT_PAY_MCH_ID;
  const privateKey = process.env.WECHAT_PAY_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const serialNo = process.env.WECHAT_PAY_SERIAL_NO;
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
  if (!appid || !mchid || !privateKey || !apiV3Key) return null;
  const Pay = getWxPay();
  if (!Pay) return null;
  // 微信要求商户证书：publicKey 为 apiclient_cert.pem 内容，用于请求签名；privateKey 为 apiclient_key.pem
  const publicKey = process.env.WECHAT_PAY_PUBLIC_CERT?.replace(/\\n/g, '\n') || privateKey;
  return new Pay({
    appid,
    mchid,
    publicKey: Buffer.from(publicKey, 'utf8'),
    privateKey: Buffer.from(privateKey, 'utf8'),
    key: apiV3Key,
    serial_no: serialNo || undefined,
  });
}

/**
 * Native 下单，返回 code_url（前端用此生成二维码供用户扫码）
 */
export async function createWechatNativeOrder(params: {
  outTradeNo: string;
  description: string;
  totalCents: number; // 金额，单位分
  notifyUrl: string;
}): Promise<{ code_url: string } | null> {
  const pay = createPayInstance();
  if (!pay) return null;
  const res = await pay.transactions_native({
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: params.notifyUrl,
    amount: { total: params.totalCents, currency: 'CNY' },
  });
  if (res?.status === 200 && res?.data?.code_url) {
    return { code_url: res.data.code_url };
  }
  return null;
}

/**
 * 验签并解密回调 body（Wechatpay-Signature 格式: serial="",nonce="",timestamp="",signature=""）
 */
export async function verifyAndDecryptWechatNotify(
  signatureHeader: string,
  body: string,
  apiV3Key: string
): Promise<{ out_trade_no: string; trade_state: string } | null> {
  const pay = createPayInstance();
  if (!pay) return null;
  const parts: Record<string, string> = {};
  signatureHeader.split(',').forEach((p) => {
    const [k, v] = p.trim().split('=');
    if (k && v) parts[k] = v.replace(/^"|"$/g, '');
  });
  const timestamp = parts.timestamp;
  const nonce = parts.nonce;
  const serial = parts.serial;
  const signature = parts.signature;
  if (!timestamp || !nonce || !serial || !signature) return null;
  try {
    const ok = await pay.verifySign({ timestamp, nonce, body, serial, signature, apiSecret: apiV3Key });
    if (!ok) return null;
  } catch {
    return null;
  }
  const bodyJson = JSON.parse(body);
  const resource = bodyJson?.resource;
  if (!resource?.ciphertext) return null;
  try {
    const decrypted = pay.decipher_gcm(
      resource.ciphertext,
      resource.associated_data || '',
      resource.nonce,
      apiV3Key
    );
    return decrypted as { out_trade_no: string; trade_state: string };
  } catch {
    return null;
  }
}
