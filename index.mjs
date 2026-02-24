import { chromium } from "playwright";

// ============================================================
// 環境変数から設定を読み込む
// ============================================================
const AMAZON_EMAIL = process.env.AMAZON_EMAIL;
const AMAZON_PASSWORD = process.env.AMAZON_PASSWORD;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// お試しBoxのURL
const TARGET_URL =
  "https://www.amazon.co.jp/baby-reg/welcomebox?ref_=br_dsk_hp_bene_wb";

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
// Amazon にログインする
// ============================================================
async function loginToAmazon(page) {
  console.log("Amazonにログイン中...");

  await page.goto("https://www.amazon.co.jp/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.co.jp%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=jpflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0", {
    waitUntil: "domcontentloaded",
  });

  // メールアドレス入力
  await page.waitForSelector("#ap_email_login", { timeout: 15000 });
  await page.fill("#ap_email_login", AMAZON_EMAIL);

  // 「次に進む」ボタンがある場合はクリック（2ステップログインの場合）
  const continueButton = await page.$('input[aria-labelledby="continue-announce"]');
  if (continueButton) {
    await continueButton.click();
    await page.waitForTimeout(2000);
  }

  // パスワード入力
  await page.waitForSelector("#ap_password", { timeout: 15000 });
  await page.fill("#ap_password", AMAZON_PASSWORD);

  // ログインボタンをクリック
  await page.click("#auth-signin-button");
  await page.waitForTimeout(3000);

  // ログイン成功の確認（トップページにリダイレクトされるか確認）
  const currentUrl = page.url();
  if (currentUrl.includes("/ap/signin") || currentUrl.includes("/ap/mfa")) {
    throw new Error(
      `ログインに失敗した可能性があります。URL: ${currentUrl}\n` +
      "2段階認証が有効になっていないか確認してください。"
    );
  }

  console.log("ログイン成功");
}

// ============================================================
// 在庫をチェックする
// ============================================================
async function checkStock(page) {
  console.log("お試しBoxページにアクセス中...");

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // ページの内容を取得して判定
  const pageContent = await page.content();
  const pageText = await page.innerText("body").catch(() => "");

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
  // 環境変数の検証
  const requiredEnvVars = {
    AMAZON_EMAIL,
    AMAZON_PASSWORD,
    LINE_CHANNEL_ACCESS_TOKEN,
  };

  for (const [name, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      console.error(`環境変数 ${name} が設定されていません`);
      process.exit(1);
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // ログイン
    await loginToAmazon(page);

    // 在庫チェック
    const result = await checkStock(page);

    console.log(`在庫状況: ${result.inStock ? "あり" : "なし"}`);
    console.log(`詳細: ${result.detail}`);

    if (result.inStock) {
      // 🎉 在庫あり → LINE通知！
      await sendLineNotification(
        `🎉 Amazon出産準備お試しBoxが入荷しました！\n\n` +
        `今すぐ確認 → ${TARGET_URL}\n\n` +
        `${result.detail}`
      );
    } else {
      // 在庫なしでも簡易メッセージを送る
      await sendLineNotification(
        `在庫チェック完了\n\n` +
        `在庫状況: なし\n` +
        `${result.detail}`
      );
      console.log("在庫なし。簡易メッセージを送信しました。");
    }
  } catch (error) {
    console.error("エラーが発生しました:", error.message);

    // エラー時もLINE通知（スクリプトが壊れたことに気づけるように）
    await sendLineNotification(
      `⚠️ Amazon在庫チェックでエラーが発生しました\n\n${error.message}`
    ).catch(() => {});

    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
