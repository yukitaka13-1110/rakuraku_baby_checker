// LINE Messaging API の接続テスト用スクリプト
// 使い方: LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_USER_ID=xxx node test-line.mjs

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_USER_ID) {
  console.error("環境変数 LINE_CHANNEL_ACCESS_TOKEN と LINE_USER_ID を設定してください");
  console.error("");
  console.error("使い方:");
  console.error("  LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_USER_ID=xxx node test-line.mjs");
  process.exit(1);
}

const res = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
  },
  body: JSON.stringify({
    to: LINE_USER_ID,
    messages: [
      {
        type: "text",
        text: "✅ LINE通知テスト成功！\nAmazon在庫監視ツールからの通知はこのように届きます。",
      },
    ],
  }),
});

if (res.ok) {
  console.log("✅ テスト通知を送信しました！LINEを確認してください。");
} else {
  const body = await res.text();
  console.error(`❌ 送信失敗: ${res.status}`);
  console.error(body);
  console.error("");
  console.error("よくある原因:");
  console.error("- LINE_CHANNEL_ACCESS_TOKEN が間違っている");
  console.error("- LINE_USER_ID が間違っている");
  console.error("- 公式アカウントを友だち追加していない");
}
