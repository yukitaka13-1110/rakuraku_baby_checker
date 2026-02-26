import { chromium } from "playwright";
import fs from "fs";

// ============================================================
// 設定
// ============================================================
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const TARGET_URL =
  "https://www.amazon.co.jp/baby-reg/welcomebox?ref_=br_dsk_hp_bene_wb";
const AUTH_STATE_PATH = "auth-state.json";

const LOOP_DURATION_MS = 15 * 60 * 1000; // 15分
const CHECK_INTERVAL_MS = 10 * 1000; // 10秒

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
// 在庫をチェックする（ループ用: スクリーンショットは上書き保存）
// ============================================================
async function checkStock(page) {
  console.log("ページにアクセス中...");

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log(`ページタイトル: ${title}`);

  // スクリーンショットは毎回同じファイルに上書き（最後の1枚だけ残す）
  await page.screenshot({ path: "screenshot_loop.png", fullPage: true });

  // 1. ページが正しいか確認
  const targetTextCount = await page.getByText('出産準備お試しBox').count();

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
      soldOutFound = true;
    } else {
      console.log("「売り切れました」は見つかりませんでした");
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
  const instantButton = page.getByText("今すぐカートに入れる", { exact: true });
  if ((await instantButton.count()) > 0) {
    console.log("「今すぐカートに入れる」ボタンをクリックします...");
    await instantButton.first().click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    console.log("カートに入れました");
    return;
  }

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
  console.log("カートページにアクセス中...");
  await page.goto("https://www.amazon.co.jp/gp/cart/view.html", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  console.log(`ページタイトル: ${await page.title()}`);

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

  const placeOrderButton = page.getByText("注文を確定する", { exact: true });
  if ((await placeOrderButton.count()) > 0) {
    console.log("「注文を確定する」ボタンをクリックします...");
    await placeOrderButton.first().click();

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    console.log(`注文確定後のページタイトル: ${await page.title()}`);

    const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    await page.screenshot({ path: `screenshot_order_${timestamp}.png`, fullPage: true });
    console.log("注文完了のスクリーンショットを保存しました");

    return { success: true, detail: "注文を確定しました" };
  } else {
    throw new Error("「注文を確定する」ボタンが見つかりませんでした");
  }
}

// ============================================================
// メイン処理（ループ版）
// ============================================================
async function main() {
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    console.error(`認証ファイルが見つかりません: ${AUTH_STATE_PATH}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    console.log("認証情報を読み込み中...");
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      locale: "ja-JP",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    console.log("ログイン状態を復元しました");

    const page = await context.newPage();

    const startTime = Date.now();
    let checkCount = 0;

    console.log(`=== ループチェック開始（最大${LOOP_DURATION_MS / 1000 / 60}分間、${CHECK_INTERVAL_MS / 1000}秒間隔） ===`);

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= LOOP_DURATION_MS) {
        console.log(`\n--- ${LOOP_DURATION_MS / 1000 / 60}分経過。ループを終了します ---`);
        break;
      }

      checkCount++;
      const elapsedSec = Math.floor(elapsed / 1000);
      console.log(`\n--- チェック #${checkCount}（経過: ${elapsedSec}秒） ---`);

      const checkStartTime = Date.now();
      try {
        const result = await checkStock(page);
        console.log(`在庫状況: ${result.inStock ? "あり" : "なし"}`);

        if (result.inStock) {
          console.log("在庫を検出しました！注文処理を開始します...");

          await sendLineNotification(
            `🎉 商品が入荷しました！\n\n` +
            `今すぐ確認 → ${TARGET_URL}\n\n` +
            `${result.detail}\n` +
            `（${checkCount}回目のチェックで検出、経過${elapsedSec}秒）`
          );

          try {
            await addToCart(page);
            const orderResult = await placeOrder(page);
            if (orderResult.success) {
              await sendLineNotification(
                `✅ 注文が完了しました！\n\n${orderResult.detail}`
              );
              console.log("注文成功。ループを終了します。");
              return;
            }
          } catch (orderError) {
            console.error("注文処理でエラーが発生しました:", orderError.message);
            await sendLineNotification(
              `⚠️ 在庫を検出しましたが、注文処理に失敗しました。\n\n${orderError.message}\n\n手動で確認してください → ${TARGET_URL}`
            );
            // 注文失敗でもループ終了（在庫は検出できたため）
            return;
          }
        }
      } catch (checkError) {
        console.error(`チェック #${checkCount} でエラー: ${checkError.message}`);
        // チェックエラーはスキップしてループ継続
      }

      // 次のチェックまで待機（処理時間を差し引いてインターバルを一定に保つ）
      const processingTime = Date.now() - checkStartTime;
      const remaining = LOOP_DURATION_MS - (Date.now() - startTime);
      if (remaining <= 0) break;
      const waitTime = Math.min(Math.max(CHECK_INTERVAL_MS - processingTime, 0), remaining);
      console.log(`処理時間: ${(processingTime / 1000).toFixed(1)}秒、次のチェックまで ${(waitTime / 1000).toFixed(1)} 秒待機...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    console.log(`\n=== ループチェック完了: 合計${checkCount}回チェック、在庫検出なし ===`);
  } catch (error) {
    console.error("エラーが発生しました:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
