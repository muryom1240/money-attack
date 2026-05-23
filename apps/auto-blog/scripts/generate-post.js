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

// ① Google Trends + Google News から今日のホットなテーマを取得
async function getTrendingContext() {
  let trendKeyword = null;
  let newsHeadlines = [];

  // --- Google Trends Japan ---
  try {
    console.log('📈 Google Trendsからトレンドキーワードを取得中...');
    const res = await fetch('https://trends.google.com/trends/trendingsearches/daily/rss?geo=JP', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; money-attack-blog/1.0)' }
    });
    const xml = await res.text();
    const matches = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>/g)];
    const terms = matches.map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()).filter(Boolean);
    if (terms.length > 0) {
      trendKeyword = terms[Math.floor(Math.random() * Math.min(5, terms.length))];
      console.log(`✅ Trendsキーワード: 「${trendKeyword}」`);
    }
  } catch (err) {
    console.log(`⚠️ Trends取得失敗: ${err.message}`);
  }

  // --- Google News Japan (RSS) ---
  try {
    console.log('📰 Google Newsからニュース見出しを取得中...');
    const newsRes = await fetch(
      'https://news.google.com/rss/search?q=%E3%81%8A%E9%87%91+%E5%89%AF%E6%A5%AD+%E7%AF%80%E7%B4%84&hl=ja&gl=JP&ceid=JP:ja',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; money-attack-blog/1.0)' } }
    );
    const newsXml = await newsRes.text();
    const titleMatches = [...newsXml.matchAll(/<title>(.*?)<\/title>/g)];
    newsHeadlines = titleMatches
      .map(m => m[1].replace(/<!\[CDATA\[|\]\]>|&amp;|&lt;|&gt;/g, '').trim())
      .filter(t => t.length > 5 && !t.includes('Google'))
      .slice(0, 5);
    if (newsHeadlines.length > 0) {
      console.log(`✅ ニュース見出し取得: ${newsHeadlines.length}件`);
    }
  } catch (err) {
    console.log(`⚠️ News取得失敗: ${err.message}`);
  }

  // フォールバック
  if (!trendKeyword) {
    const fallbacks = [
      'AI副業', 'ポイ活2026', 'NISA投資', 'フリーランス節税',
      '在宅ワーク', '節約術', '物価高対策', 'ふるさと納税',
    ];
    trendKeyword = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    console.log(`📌 フォールバック使用: 「${trendKeyword}」`);
  }

  return { trendKeyword, newsHeadlines };
}

// ② 記事フォーマットをランダム選択（成功ブログで使われる定番パターン）
function getArticleFormat() {
  const formats = [
    {
      name: 'howto',
      titleHint: '〇〇する方法・やり方',
      structureGuide: `
【記事構成（How-to形式）】
1. 冒頭：「なぜこれをやるべきか？」読者の課題・悩みを提示（300文字）
2. h2: 「〇〇とは？知らないと損する基礎知識」
3. h2: 「ステップ別解説：〇〇の具体的なやり方」
   - h3: ステップ1〜4（各200文字以上）
4. h2: 「よくある失敗とその対処法」
5. h2: 「Amazonおすすめアイテム・書籍」← アフィリエイトここに自然に挿入
6. h2: 「よくある質問（FAQ）」← Q&A形式で3〜5問（Googleの強調スニペット対策）
7. まとめ：200文字以上`,
    },
    {
      name: 'ranking',
      titleHint: '〇〇おすすめランキング・比較',
      structureGuide: `
【記事構成（ランキング・比較形式）】
1. 冒頭：選び方のポイントを先に提示（300文字）
2. h2: 「選ぶ際の3つのポイント」
3. h2: 「ランキング1位〜5位の詳細解説」
   - h3: 各1位〜5位（理由・特徴・おすすめ度）
4. h2: 「Amazonで買える関連商品・書籍」← アフィリエイトここに挿入
5. h2: 「よくある質問（FAQ）」← Q&A形式で3〜5問
6. まとめ`,
    },
    {
      name: 'experience',
      titleHint: '実際にやってみた・体験談',
      structureGuide: `
【記事構成（体験・実例形式）】
1. 冒頭：衝撃的な結果や数字を先出し（例：「月3万円節約できた！」）（300文字）
2. h2: 「そもそもなぜ〇〇を始めたのか？」
3. h2: 「実際にやってみた手順・方法」（h3で細分化）
4. h2: 「実際の結果・メリット・デメリット」
5. h2: 「参考になった書籍・ツール」← アフィリエイトここに挿入
6. h2: 「よくある質問（FAQ）」
7. まとめ`,
    },
    {
      name: 'news_analysis',
      titleHint: '最新ニュースと〇〇への影響・対策',
      structureGuide: `
【記事構成（ニュース解説形式）】
1. 冒頭：今話題のニュースを切り口に問題提起（300文字）
2. h2: 「そのニュースが意味すること（わかりやすく解説）」
3. h2: 「私たちの生活・お金への具体的な影響」
4. h2: 「今すぐできる対策・行動3ステップ」
5. h2: 「深く学びたい人向け：おすすめ本・ツール」← アフィリエイトここに挿入
6. h2: 「よくある質問（FAQ）」
7. まとめ`,
    },
  ];
  return formats[Math.floor(Math.random() * formats.length)];
}

// ③ Pexels APIから関連画像を取得して src/assets/ に保存
async function fetchAndSaveImage(keyword, assetsDir, dateStr, randomId) {
  if (!PEXELS_API_KEY) {
    console.log('⚠️ PEXELS_API_KEY が未設定のためデフォルト画像を使用します。');
    return '../../assets/blog-placeholder-about.jpg';
  }

  try {
    console.log('🖼️  Pexelsから画像を取得中...');
    const queries = ['money', 'business', 'finance', 'investment', 'laptop work', 'success'];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const pexelsRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    if (!pexelsRes.ok) throw new Error(`Pexels API error: ${pexelsRes.status}`);

    const data = await pexelsRes.json();
    if (!data.photos || data.photos.length === 0) throw new Error('画像が見つかりませんでした');

    const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
    const imageUrl = photo.src.large2x || photo.src.large;
    const imageFileName = `auto-hero-${dateStr}-${randomId}.jpg`;
    const imagePath = path.join(assetsDir, imageFileName);

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`画像ダウンロード失敗: ${imgRes.status}`);
    const buffer = await imgRes.arrayBuffer();
    fs.writeFileSync(imagePath, Buffer.from(buffer));

    console.log(`✅ 画像保存完了: ${imageFileName} (by ${photo.photographer})`);
    return `../../assets/${imageFileName}`;

  } catch (err) {
    console.log(`⚠️ 画像取得失敗 (${err.message})。デフォルト画像を使用します。`);
    return '../../assets/blog-placeholder-about.jpg';
  }
}

// ④ 記事生成メイン
async function generatePost() {
  console.log('🤖 AIによる記事生成を開始します...\n');

  const { trendKeyword, newsHeadlines } = await getTrendingContext();
  const format = getArticleFormat();

  const dateStr = new Date().toISOString().split('T')[0];
  const randomId = Math.random().toString(36).substring(2, 8);

  const outDir = path.resolve(process.cwd(), 'src/content/blog');
  const assetsDir = path.resolve(process.cwd(), 'src/assets');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const heroImage = await fetchAndSaveImage(trendKeyword, assetsDir, dateStr, randomId);

  const newsContext = newsHeadlines.length > 0
    ? `\n【今日の関連ニュース（必要であれば記事に絡める）】\n${newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : '';

  const prompt = `
あなたは日本で月間50万PVを誇る「お金・副業・節約」の人気ブログ「Money Attack」の著者「ロタ」です。
フランクで少し毒舌だが本音で語るキャラクター。読者を「アンタ」と呼ぶ。

以下のルールを全て守り、SEOで上位表示を狙える高品質なブログ記事を1本、Markdown形式で書いてください。

【安全・コンプライアンス基準（絶対厳守）】
1. 法令違反・詐欺・違法薬物など違法な内容は含めないこと
2. 宗教・政治・思想の偏った意見は含めないこと
3. 暴力・アダルト・差別・誹謗中傷は含めないこと
4. 投資は「自己責任」を必ず明記すること

【今日のテーマ】
メインキーワード：「${trendKeyword}」
今日の記事フォーマット：${format.name}形式（${format.titleHint}タイプ）
${newsContext}

→ 上記を絡めて「お金・副業・節約・投資・AI活用・仕事効率化」のいずれかの角度で書くこと。

【SEO必須要件】
- タイトルは40文字以内で「${trendKeyword}」を自然に含める
- descriptionは120文字程度（クリックしたくなる内容）
- メインキーワードを本文中に5〜8回、自然に含める
- LSIキーワード（関連語）も積極的に使う
- 本文は**2500文字以上**（短すぎるとSEO評価が下がる）
- 最初の100文字以内に検索意図に応える文を入れる

${format.structureGuide}

【Amazonアフィリエイトリンク（必ず1〜3個挿入）】
テーマに関連する実用的な商品・書籍を紹介する際、以下の形式で挿入：
[商品の説明文](https://www.amazon.co.jp/s?k=検索ワード&tag=artwldesign-22)

例：
- 「[NISA入門の決定版としておすすめ](https://www.amazon.co.jp/s?k=NISA+入門+本&tag=artwldesign-22)」
- 「[副業×AI活用の最新書籍はこれ一択](https://www.amazon.co.jp/s?k=副業+AI+2024&tag=artwldesign-22)」
自然な文脈で「マジでおすすめ👇」「読んで損なし」などの誘導文を入れること。

【出力フォーマット（厳守）】
Markdownブロック(\`\`\`markdown)で囲まず、以下の形式で直接出力：

---
title: "キャッチーなタイトル（40文字以内）"
description: "記事の要約（120文字程度、クリックしたくなる文）"
pubDate: "${new Date().toISOString()}"
heroImage: "${heroImage}"
---

# タイトル

（本文：2500文字以上、構成に従って書く）
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
        console.log(`⏳ APIが混雑中（503）。15秒待機して再試行... (残り${retries - 1}回)`);
        await new Promise(resolve => setTimeout(resolve, 15000));
        retries--;
      } else {
        throw error;
      }
    }
  }

  try {
    let markdownContent = response.text;

    const match = markdownContent.match(/---\n[\s\S]*/);
    if (match) markdownContent = match[0];
    markdownContent = markdownContent.replace(/\n```\s*$/, '').trim();

    const fileName = `${dateStr}-auto-post-${randomId}.md`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, markdownContent, 'utf-8');

    console.log(`\n✅ 記事生成・保存完了！`);
    console.log(`📄 ファイル: ${fileName}`);
    console.log(`🔑 キーワード: ${trendKeyword}`);
    console.log(`📝 フォーマット: ${format.name}`);

  } catch (error) {
    console.error('❌ 記事の生成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

generatePost();
