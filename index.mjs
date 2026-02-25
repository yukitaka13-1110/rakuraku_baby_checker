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

  // スクリーンショット保存
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const screenshotPath = `screenshot_${timestamp}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`スクリーンショットを保存しました: ${screenshotPath}`);

  // 1. ページが正しいか確認（「出産準備お試しBox」の存在確認）
  const targetTextCount = await page.getByText('出産準備お試しBox').count();
  console.log(`「出産準備お試しBox」の出現数: ${targetTextCount}`);

  if (targetTextCount === 0) {
    throw new Error('ページの構造が想定と異なります（「出産準備お試しBox」が見つかりません）');
  }

  // 2. 「売り切れました」表示を確認
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

  // 3. 在庫判定
  if (soldOutFound) {
    return {
      inStock: false,
      soldOutFound,
      detail: "「売り切れました」の表示を検出しました",
    };
  } else {
    return {
      inStock: true,
      soldOutFound,
      detail: "在庫あり",
    };
  }
}

// ============================================================
// カートに入れる
// ============================================================
async function addToCart(page) {
  // 「今すぐカートに入れる」を優先的に探す
  const instantButton = page.getByText("今すぐカートに入れる", { exact: true });
  if ((await instantButton.count()) > 0) {
    console.log("「今すぐカートに入れる」ボタンをクリックします...");
    await instantButton.first().click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    console.log("カートに入れました");
    return;
  }

  // なければ「カートに入れる」を探す
  const addButton = page.getByText("カートに入れる", { exact: true });
  if ((await addButton.count()) > 0) {
    console.log("「カートに入れる」ボタンをクリックします...");
    await addButton.first().click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    console.log("カートに入れました");
    return;
  }

  throw new Error("「今すぐカートに入れる」「カートに入れる」ボタンが見つかりませんでした");
}

// ============================================================
// カートから注文を確定する
// ============================================================
async function placeOrder(page) {
  // 1. カートページにアクセス
  console.log("カートページにアクセス中...");
  await page.goto("https://www.amazon.co.jp/gp/cart/view.html", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  console.log(`ページタイトル: ${await page.title()}`);

  // 2. 1回目「レジに進む」ボタンをクリック
  const checkoutButton = page.getByRole("button", { name: "レジに進む" });
  if ((await checkoutButton.count()) === 0) {
    const fallback = page.locator(
      'input[value="レジに進む"], [name="proceedToRetailCheckout"]'
    );
    if ((await fallback.count()) > 0) {
      console.log("「レジに進む」ボタンをクリックします（フォールバック）...");
      await fallback.first().click();
    } else {
      throw new Error("「レジに進む」ボタンが見つかりませんでした");
    }
  } else {
    console.log("「レジに進む」ボタンをクリックします...");
    await checkoutButton.click();
  }

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);
  console.log(`遷移後のページタイトル: ${await page.title()}`);

  // 3. 2回目「レジに進む」ボタンをクリック
  const checkoutButton2 = page.getByText("レジに進む", { exact: true });
  if ((await checkoutButton2.count()) > 0) {
    console.log("2回目:「レジに進む」ボタンをクリックします...");
    await checkoutButton2.first().click();

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    console.log(`2回目遷移後のページタイトル: ${await page.title()}`);
  } else {
    console.log("2回目の「レジに進む」は表示されていません。スキップします。");
  }

  // 4.「注文を確定する」ボタンをクリック
  const placeOrderButton = page.getByText("注文を確定する", { exact: true });
  if ((await placeOrderButton.count()) > 0) {
    console.log("「注文を確定する」ボタンをクリックします...");
    await placeOrderButton.first().click();

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    console.log(`注文確定後のページタイトル: ${await page.title()}`);

    // スクリーンショット保存
    const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    await page.screenshot({ path: `screenshot_order_${timestamp}.png`, fullPage: true });
    console.log("注文完了のスクリーンショットを保存しました");

    return { success: true, detail: "注文を確定しました" };
  } else {
    throw new Error("「注文を確定する」ボタンが見つかりませんでした");
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
      // 🎉 在庫あり → LINE通知
      await sendLineNotification(
        `🎉 商品が入荷しました！\n\n` +
        `今すぐ確認 → ${TARGET_URL}\n\n` +
        `${result.detail}`
      );

      // カートに入れてから注文処理を実行
      try {
        await addToCart(page);
        const orderResult = await placeOrder(page);
        if (orderResult.success) {
          await sendLineNotification(
            `✅ 注文が完了しました！\n\n${orderResult.detail}`
          );
        }
      } catch (orderError) {
        console.error("注文処理でエラーが発生しました:", orderError.message);
        await sendLineNotification(
          `⚠️ 在庫を検出しましたが、注文処理に失敗しました。\n\n${orderError.message}\n\n手動で確認してください → ${TARGET_URL}`
        );
      }
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
