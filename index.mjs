import { chromium } from "playwright";
import fs from "fs";

// ============================================================
// 環境変数から設定を読み込む
// ============================================================
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// 監視対象のURL
const TARGET_URL =
  "https://www.amazon.co.jp/baby-reg/welcomebox?ref_=br_dsk_hp_bene_wb";

// 認証ファイルのパス
const AUTH_STATE_PATH = "auth-state.json";

// ============================================================
// LINE Messaging API でプッシュ通知を送る
// ============================================================
async function sendLineNotification(message) {
  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`LINE通知の送信に失敗しました: ${res.status} ${body}`);
  } else {
    console.log("LINE通知を送信しました");
  }
}


// ============================================================
// 在庫をチェックする
// ============================================================
async function checkStock(page) {
  console.log("ページにアクセス中...");

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // デバッグ用：ページタイトルを出力
  const title = await page.title();
  console.log(`ページタイトル: ${title}`);

  // a-alert-heading に「売り切れました」があるか確認
  const alertHeading = await page.$(".a-alert-heading");
  let soldOutFound = false;
  if (alertHeading) {
    const alertText = await alertHeading.innerText();
    console.log(`a-alert-heading のテキスト: ${alertText}`);
    if (alertText.includes("売り切れました")) {
      console.log("✓ 「売り切れました」が見つかりました");
      soldOutFound = true;
    } else {
      console.log("✗ 「売り切れました」は見つかりませんでした");
    }
  } else {
    console.log("a-alert-heading 要素が見つかりませんでした");
  }

  // --- 在庫あり判定 ---
  // 「カートに入れる」「今すぐもらう」ボタンがあれば在庫あり
  const addToCartButton = await page.$(
    [
      'input[name="submit.addToCart"]',
      "#add-to-cart-button",
      'input[value*="カートに入れる"]',
      'button:has-text("カートに入れる")',
      'a:has-text("今すぐカートに入れる")',
      'a:has-text("今すぐもらう")',
    ].join(", ")
  );

  // --- 在庫切れ判定 ---
  const isOutOfStock = soldOutFound;

  if (addToCartButton || !isOutOfStock) {
    return {
      inStock: true,
      soldOutFound,
      detail: `カートボタン: ${addToCartButton ? 'あり' : 'なし'}, 売り切れ表示: ${soldOutFound ? 'あり' : 'なし'}`
    };
  } else {
    return {
      inStock: false,
      soldOutFound,
      detail: "「売り切れました」の表示を検出しました",
    };
  }
}

// ============================================================
// メイン処理
// ============================================================
async function main() {
  // 認証ファイルの存在確認
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    console.error(`認証ファイルが見つかりません: ${AUTH_STATE_PATH}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // 保存した認証状態を読み込んでコンテキストを作成
    console.log("認証情報を読み込み中...");
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      locale: "ja-JP",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    console.log("✅ ログイン状態を復元しました（ログイン処理スキップ）");

    const page = await context.newPage();

    // 在庫チェック（ログイン済み状態）
    const result = await checkStock(page);

    console.log(`在庫状況: ${result.inStock ? "あり" : "なし"}`);
    console.log(`詳細: ${result.detail}`);

    if (result.inStock) {
      // 🎉 在庫あり → LINE通知！
      await sendLineNotification(
        `🎉 商品が入荷しました！\n\n` +
        `今すぐ確認 → ${TARGET_URL}\n\n` +
        `${result.detail}`
      );
    } else {
      console.log("在庫なし。");
    }
  } catch (error) {
    console.error("エラーが発生しました:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
