import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// .envファイルの読み込み
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('エラー: GEMINI_API_KEY が設定されていません。.envファイルを確認してください。');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function generatePost() {
  console.log('🤖 AIによる記事生成を開始します...');

  // ユーザー指定の安全ガイドライン（絶対遵守）
  const safetyGuidelines = `
【安全・コンプライアンス基準（絶対厳守）】
以下の内容は絶対に生成しないでください。違反した場合、重大な問題となります。
1. 法令違反、またはそれを助長する内容（著作権侵害、詐欺、違法薬物など）
2. 宗教、政治、思想に関する偏った意見や議論
3. センシティブな内容（暴力、アダルト、差別表現、誹謗中傷など）
4. 特定の個人や団体を不当に攻撃・批判する内容
`;

  // ペルソナと記事構成の指示
  const prompt = `
あなたは「効率化マニアのAI」というペルソナを持つ人気ブロガーです。
以下の【安全・コンプライアンス基準】を必ず守り、ブログ記事をMarkdown形式で1つ作成してください。

${safetyGuidelines}

【記事のテーマ】
2026年の最新トレンドから、仕事や日常の「無駄な作業を減らす自動化ツールやハック」について、架空ではない実在するツール（または一般的な概念）を1つピックアップして紹介してください。

【出力フォーマット】
以下のAstroのFrontmatterを含むMarkdown形式で出力してください。Markdownブロック(\`\`\`markdown)で囲まず、直接出力してください。

---
title: "記事のキャッチーなタイトル"
description: "記事の要約（100文字程度）"
pubDate: "${new Date().toISOString()}"
heroImage: "/blog-placeholder-about.jpg"
---

# (ここから本文)
(本文は、あなたのペルソナを活かしたフランクで少し毒舌、でも役立つ口調で記述してください。ただし絶対に安全基準は守ること。)
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    let markdownContent = response.text;
    
    // AIが「承知しました」などの余計なテキストを出力した場合に対処するため、
    // 最初の `---` （フロントマターの開始）から末尾までを抽出する
    const match = markdownContent.match(/---\n[\s\S]*/);
    if (match) {
      markdownContent = match[0];
    }
    
    // 末尾に ``` が残っている場合は除去
    markdownContent = markdownContent.replace(/\n```$/, '').trim();

    // ファイル名の生成 (slug)
    const dateStr = new Date().toISOString().split('T')[0];
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `${dateStr}-auto-post-${randomId}.md`;
    
    // 保存先パスの生成 (Astroの仕様に合わせて src/content/blog に保存)
    const outDir = path.resolve(process.cwd(), 'src/content/blog');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const filePath = path.join(outDir, fileName);

    fs.writeFileSync(filePath, markdownContent, 'utf-8');
    console.log(`✅ 記事の生成と保存に成功しました！\n保存先: ${filePath}`);

  } catch (error) {
    console.error('❌ 記事の生成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

generatePost();
