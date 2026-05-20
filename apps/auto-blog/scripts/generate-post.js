import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('エラー: GEMINI_API_KEY が設定されていません。');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ① Google Trends（日本）からトレンドキーワードを取得
async function getTrendingKeyword() {
  try {
    console.log('📈 Google Trendsからトレンドキーワードを取得中...');
    const res = await fetch('https://trends.google.com/trends/trendingsearches/daily/rss?geo=JP', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; money-attack-blog/1.0)' }
    });
    const xml = await res.text();

    // RSS <item><title> を抽出
    const matches = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>/g)];
    const terms = matches.map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()).filter(Boolean);

    if (terms.length > 0) {
      // 上位5件からランダム1件を選択
      const selected = terms[Math.floor(Math.random() * Math.min(5, terms.length))];
      console.log(`✅ トレンドキーワード: 「${selected}」`);
      return selected;
    }
  } catch (err) {
    console.log(`⚠️ トレンド取得失敗 (${err.message})。フォールバックテーマを使用します。`);
  }

  // フォールバック：お金・副業関連テーマ
  const fallbacks = [
    'AIで副業収入を増やす方法',
    '節約と投資で資産形成する方法',
    'フリーランスで稼ぐ最新テクニック',
    'ポイ活で副収入を得る裏ワザ',
    '在宅ワークで月10万円を目指す方法',
  ];
  const chosen = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  console.log(`📌 フォールバックテーマ: 「${chosen}」`);
  return chosen;
}

// ② Pexels APIから関連画像を取得して src/assets/ に保存
async function fetchAndSaveImage(keyword, assetsDir, dateStr, randomId) {
  if (!PEXELS_API_KEY) {
    console.log('⚠️ PEXELS_API_KEY が未設定のためデフォルト画像を使用します。');
    return '../../assets/blog-placeholder-about.jpg';
  }

  try {
    console.log('🖼️  Pexelsから画像を取得中...');

    // お金・仕事関連の検索語に変換（Pexelsは英語の方が精度が高い）
    const moneyRelated = ['money', 'business', 'finance', 'work', 'laptop', 'investment', 'success'];
    const englishQuery = moneyRelated[Math.floor(Math.random() * moneyRelated.length)];

    const pexelsRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(englishQuery)}&per_page=10&orientation=landscape`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!pexelsRes.ok) throw new Error(`Pexels API error: ${pexelsRes.status}`);

    const data = await pexelsRes.json();

    if (!data.photos || data.photos.length === 0) {
      throw new Error('画像が見つかりませんでした');
    }

    const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
    const imageUrl = photo.src.large2x || photo.src.large;
    const imageFileName = `auto-hero-${dateStr}-${randomId}.jpg`;
    const imagePath = path.join(assetsDir, imageFileName);

    // 画像をダウンロード
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`画像ダウンロード失敗: ${imgRes.status}`);
    const buffer = await imgRes.arrayBuffer();
    fs.writeFileSync(imagePath, Buffer.from(buffer));

    console.log(`✅ 画像保存完了: ${imageFileName}  (撮影者: ${photo.photographer})`);
    return `../../assets/${imageFileName}`;

  } catch (err) {
    console.log(`⚠️ 画像取得失敗 (${err.message})。デフォルト画像を使用します。`);
    return '../../assets/blog-placeholder-about.jpg';
  }
}

// ③ 記事生成メイン
async function generatePost() {
  console.log('🤖 AIによる記事生成を開始します...\n');

  const trendingKeyword = await getTrendingKeyword();

  const dateStr = new Date().toISOString().split('T')[0];
  const randomId = Math.random().toString(36).substring(2, 8);

  const outDir = path.resolve(process.cwd(), 'src/content/blog');
  const assetsDir = path.resolve(process.cwd(), 'src/assets');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const heroImage = await fetchAndSaveImage(trendingKeyword, assetsDir, dateStr, randomId);

  const safetyGuidelines = `
【安全・コンプライアンス基準（絶対厳守）】
1. 法令違反、またはそれを助長する内容は絶対に含めないこと
2. 宗教・政治・思想に関する偏った意見は含めないこと
3. 暴力・アダルト・差別表現・誹謗中傷は含めないこと
4. 特定の個人や団体を不当に攻撃・批判する内容は含めないこと
`;

  const prompt = `
あなたは「効率化マニアのAI・ロタ」というペルソナを持つ人気ブロガーです。
以下の【安全・コンプライアンス基準】を必ず守り、ブログ記事をMarkdown形式で1つ作成してください。

${safetyGuidelines}

【今日のテーマ】
「${trendingKeyword}」という今日の注目トレンドを絡めながら、
「お金・副業・節約・投資・AI活用・仕事効率化」のいずれかの角度から、
日本人の読者に役立つ実用的な日本語のブログ記事を書いてください。

【SEO対策（必ず守ること）】
- タイトルに「${trendingKeyword}」に関連するキーワードを含める
- 本文中にキーワードを自然な形で3〜5回使用する
- h2、h3見出しを使って構造化する
- 2000文字以上の十分な文量で書く

【出力フォーマット】
Markdownブロック(\`\`\`markdown)で囲まず、直接以下の形式で出力してください。

---
title: "記事のキャッチーなタイトル（40文字以内）"
description: "記事の要約（120文字程度）"
pubDate: "${new Date().toISOString()}"
heroImage: "${heroImage}"
---

# (ここから本文)
(フランクで少し毒舌だが役立つ口調で。ただし安全基準は絶対厳守。)
`;

  let response;
  let retries = 3;

  while (retries > 0) {
    try {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      break;
    } catch (error) {
      if (error.status === 503 && retries > 1) {
        console.log(`⏳ APIが混雑中（503）。10秒待機して再試行... (残り${retries - 1}回)`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        retries--;
      } else {
        throw error;
      }
    }
  }

  try {
    let markdownContent = response.text;

    // フロントマター開始から末尾を抽出
    const match = markdownContent.match(/---\n[\s\S]*/);
    if (match) markdownContent = match[0];

    // 末尾の ``` を除去
    markdownContent = markdownContent.replace(/\n```\s*$/, '').trim();

    const fileName = `${dateStr}-auto-post-${randomId}.md`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, markdownContent, 'utf-8');

    console.log(`\n✅ 記事の生成・保存が完了しました！`);
    console.log(`📄 ファイル: ${fileName}`);
    console.log(`🔑 テーマ: ${trendingKeyword}`);

  } catch (error) {
    console.error('❌ 記事の生成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

generatePost();
