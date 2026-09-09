import pkg from 'arabic-persian-reshaper';
import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const { ArabicShaper } = pkg;
const ar = (text) => ArabicShaper.convertArabic(text);

const W = 1200;
const H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

// ── 1. Background with Luxury Academic Atmosphere ───────────────────────────
// Base dark obsidian gradient
const bgGrad = ctx.createLinearGradient(0, 0, W, H);
bgGrad.addColorStop(0, '#0a120e');
bgGrad.addColorStop(0.5, '#0e1713');
bgGrad.addColorStop(1, '#070c09');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Golden brass ambient light (Top Right)
const goldGlow = ctx.createRadialGradient(920, 180, 20, 920, 180, 480);
goldGlow.addColorStop(0, 'rgba(212, 163, 89, 0.16)');
goldGlow.addColorStop(0.5, 'rgba(212, 163, 89, 0.05)');
goldGlow.addColorStop(1, 'rgba(212, 163, 89, 0)');
ctx.fillStyle = goldGlow;
ctx.fillRect(0, 0, W, H);

// Emerald jade ambient light (Center Left)
const jadeGlow = ctx.createRadialGradient(280, 320, 30, 280, 320, 440);
jadeGlow.addColorStop(0, 'rgba(46, 169, 140, 0.18)');
jadeGlow.addColorStop(0.5, 'rgba(46, 169, 140, 0.06)');
jadeGlow.addColorStop(1, 'rgba(46, 169, 140, 0)');
ctx.fillStyle = jadeGlow;
ctx.fillRect(0, 0, W, H);

// Subtle architectural micro-grid lines
ctx.strokeStyle = 'rgba(255, 255, 255, 0.022)';
ctx.lineWidth = 1;
for (let x = 0; x <= W; x += 50) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
}
for (let y = 0; y <= H; y += 50) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}

// Luxury Dual Border Frames
// Outer brass frame
ctx.strokeStyle = 'rgba(212, 163, 89, 0.3)';
ctx.lineWidth = 1.2;
roundRect(ctx, 22, 22, W - 44, H - 44, 16);
ctx.stroke();

// Inner jade hairline frame
ctx.strokeStyle = 'rgba(46, 169, 140, 0.2)';
ctx.lineWidth = 0.8;
roundRect(ctx, 30, 30, W - 60, H - 60, 12);
ctx.stroke();

// Corner architectural accents (top-left, top-right, bottom-left, bottom-right)
const corners = [
  [22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]
];
ctx.fillStyle = '#d4a359';
for (const [cx, cy] of corners) {
  ctx.fillRect(cx - 3, cy - 3, 6, 6);
}

// ── 2. Left Card: The Iconic 3D Brand Emblem & Key Metrics ───────────────────
const cardX = 64;
const cardY = 60;
const cardW = 410;
const cardH = 510;

// Card drop shadow & surface
ctx.save();
ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
ctx.shadowBlur = 30;
ctx.shadowOffsetY = 15;

const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
cardGrad.addColorStop(0, '#111b16');
cardGrad.addColorStop(1, '#090f0c');
ctx.fillStyle = cardGrad;
roundRect(ctx, cardX, cardY, cardW, cardH, 20);
ctx.fill();
ctx.restore();

// Card border
ctx.strokeStyle = 'rgba(212, 163, 89, 0.35)';
ctx.lineWidth = 1.2;
roundRect(ctx, cardX, cardY, cardW, cardH, 20);
ctx.stroke();

// Inside Card: Brand Emblem Shield Plate
const emblemPlateX = cardX + (cardW - 140) / 2;
const emblemPlateY = cardY + 36;
const emblemPlateSize = 140;

const plateGrad = ctx.createLinearGradient(emblemPlateX, emblemPlateY, emblemPlateX, emblemPlateY + emblemPlateSize);
plateGrad.addColorStop(0, '#18241e');
plateGrad.addColorStop(1, '#0e1713');
ctx.fillStyle = plateGrad;
roundRect(ctx, emblemPlateX, emblemPlateY, emblemPlateSize, emblemPlateSize, 24);
ctx.fill();

ctx.strokeStyle = 'rgba(212, 163, 89, 0.45)';
ctx.lineWidth = 1.5;
roundRect(ctx, emblemPlateX, emblemPlateY, emblemPlateSize, emblemPlateSize, 24);
ctx.stroke();

// Inner subtle ring
ctx.strokeStyle = 'rgba(46, 169, 140, 0.3)';
ctx.lineWidth = 0.8;
roundRect(ctx, emblemPlateX + 5, emblemPlateY + 5, emblemPlateSize - 10, emblemPlateSize - 10, 20);
ctx.stroke();

// Draw The 5 Architectural Pillars (SCHEDULE Brand Mark) inside Emblem Plate
// Scale down from 512 coordinate space to ~110px space
const markScale = 110 / 512;
const markOffsetX = emblemPlateX + (emblemPlateSize - (512 * markScale)) / 2;
const markOffsetY = emblemPlateY + (emblemPlateSize - (512 * markScale)) / 2;

const BARS = [
  { x: 371.2, y: 156, h: 120 },                  // Sunday
  { x: 302.4, y: 220, h: 96 },                   // Monday
  { x: 233.6, y: 132, h: 152 },                  // Tuesday
  { x: 164.8, y: 260, h: 112, decided: true },   // Wednesday (The Decided Golden Shift)
  { x: 96.0, y: 188, h: 128 },                   // Thursday
];
const barW = 44.8;
const barR = 22.4;

for (const bar of BARS) {
  const bx = markOffsetX + bar.x * markScale;
  const by = markOffsetY + bar.y * markScale;
  const bw = barW * markScale;
  const bh = bar.h * markScale;
  const br = barR * markScale;

  // Pillar fill
  if (bar.decided) {
    const goldPillar = ctx.createLinearGradient(bx, by, bx, by + bh);
    goldPillar.addColorStop(0, '#fadb9d');
    goldPillar.addColorStop(1, '#c79b5f');
    ctx.fillStyle = goldPillar;
  } else {
    const jadePillar = ctx.createLinearGradient(bx, by, bx, by + bh);
    jadePillar.addColorStop(0, '#64d2b8');
    jadePillar.addColorStop(1, '#248f76');
    ctx.fillStyle = jadePillar;
  }

  ctx.save();
  ctx.shadowColor = bar.decided ? 'rgba(212, 163, 89, 0.4)' : 'rgba(46, 169, 140, 0.3)';
  ctx.shadowBlur = 8;
  roundRect(ctx, bx, by, bw, bh, br);
  ctx.fill();
  ctx.restore();
}

// Brand Title below emblem in card
ctx.textAlign = 'center';
ctx.direction = 'ltr';
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 22px "Nimbus Sans", sans-serif';
ctx.fillText('SCHEDULE', cardX + cardW / 2, cardY + 215);

ctx.fillStyle = '#82a496';
ctx.font = '600 11px "Nimbus Sans", sans-serif';
ctx.fillText('ACADEMIC DECISION ENGINE', cardX + cardW / 2, cardY + 233);

// Card Dividers & Metrics
ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(cardX + 24, cardY + 250);
ctx.lineTo(cardX + cardW - 24, cardY + 250);
ctx.stroke();

// 3 Highlight Feature Rows inside card
const features = [
  { icon: '✓', text: '٠ تعارضات زمنية في القاعات والأقسام', color: '#2ea98c' },
  { icon: '⚡', text: 'كشف استباقي ذكي وحوكمة قطعية', color: '#d4a359' },
  { icon: '📄', text: 'قراءة جداول الـ PDF في ثوانٍ معدودة', color: '#5fbfa6' },
  { icon: '⚖️', text: 'حوكمة استعارة القاعات ونصاب الأساتذة', color: '#e2b474' }
];

let rowY = cardY + 280;
for (const feat of features) {
  // Mini badge background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  roundRect(ctx, cardX + 20, rowY - 18, cardW - 40, 42, 10);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 0.8;
  roundRect(ctx, cardX + 20, rowY - 18, cardW - 40, 42, 10);
  ctx.stroke();

  // Left icon badge
  ctx.fillStyle = feat.color;
  ctx.font = 'bold 16px "Nimbus Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText(feat.icon, cardX + 34, rowY + 9);

  // Right Arabic text
  ctx.fillStyle = '#e8eeea';
  ctx.font = '15px KacstOffice';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillText(ar(feat.text), cardX + cardW - 32, rowY + 9);

  rowY += 54;
}

// ── 3. Right Panel: Prestigious Executive Typography ─────────────────────────
const rightEdge = W - 74;

// Category Chip Tag
const chipW = 320;
const chipH = 36;
const chipX = rightEdge - chipW;
const chipY = 66;

ctx.fillStyle = 'rgba(212, 163, 89, 0.12)';
roundRect(ctx, chipX, chipY, chipW, chipH, 18);
ctx.fill();

ctx.strokeStyle = 'rgba(212, 163, 89, 0.4)';
ctx.lineWidth = 1;
roundRect(ctx, chipX, chipY, chipW, chipH, 18);
ctx.stroke();

ctx.direction = 'rtl';
ctx.textAlign = 'center';
ctx.fillStyle = '#d4a359';
ctx.font = '14px KacstOffice';
ctx.fillText(ar('✦ المنظومة الجامعية المعتمدة لإدارة الجداول'), chipX + chipW / 2, chipY + 23);

// Major Latin Wordmark + Arabic System Title
ctx.direction = 'ltr';
ctx.textAlign = 'right';
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 56px "Nimbus Sans", sans-serif';
ctx.fillText('SCHEDULE', rightEdge, 175);

// Little Pro badge next to SCHEDULE
const badgeW = 76;
const badgeH = 26;
const badgeX = rightEdge - 370;
const badgeY = 138;
ctx.fillStyle = 'rgba(46, 169, 140, 0.2)';
roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
ctx.fill();
ctx.strokeStyle = 'rgba(46, 169, 140, 0.5)';
ctx.lineWidth = 1;
roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
ctx.stroke();
ctx.direction = 'ltr';
ctx.textAlign = 'center';
ctx.fillStyle = '#5fbfa6';
ctx.font = 'bold 12px "Nimbus Sans", sans-serif';
ctx.fillText('PRO V4', badgeX + badgeW / 2, badgeY + 18);

// Polished Brass Accent Divider Rule
const ruleW = 200;
const ruleGrad = ctx.createLinearGradient(rightEdge - ruleW, 202, rightEdge, 202);
ruleGrad.addColorStop(0, 'rgba(212, 163, 89, 0)');
ruleGrad.addColorStop(0.3, 'rgba(212, 163, 89, 0.8)');
ruleGrad.addColorStop(1, '#d4a359');
ctx.fillStyle = ruleGrad;
ctx.fillRect(rightEdge - ruleW, 202, ruleW, 3.5);

// Arabic Main Headline
ctx.direction = 'rtl';
ctx.textAlign = 'right';
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 36px KacstTitle';
ctx.fillText(ar('الجدول لم يعد جدولاً.. صار قراراً'), rightEdge, 260);

// Arabic Subtitle (Gold / Warm Accent)
ctx.fillStyle = '#e0b577';
ctx.font = '22px KacstOffice';
ctx.fillText(ar('لم نبنِ برنامجاً.. بنينا طريقة عمل وحوكمة أكاديمية رصينة'), rightEdge, 310);

// Descriptive Body Paragraph (High contrast & clarity)
ctx.fillStyle = '#a6bab0';
ctx.font = '18px KacstBook';
ctx.fillText(ar('منظومة القرار الأكاديمي الشاملة للجامعات والكليات: كشف التعارضات'), rightEdge, 360);
ctx.fillText(ar('الاستباقي، توزيع القاعات وضبط الطاقة الاستيعابية بأعلى دقة.'), rightEdge, 395);

// Bottom Institutional Endorsement Card
const instCardW = 600;
const instCardH = 78;
const instCardX = rightEdge - instCardW;
const instCardY = 460;

ctx.fillStyle = '#0f1a15';
roundRect(ctx, instCardX, instCardY, instCardW, instCardH, 14);
ctx.fill();

ctx.strokeStyle = 'rgba(46, 169, 140, 0.35)';
ctx.lineWidth = 1.2;
roundRect(ctx, instCardX, instCardY, instCardW, instCardH, 14);
ctx.stroke();

// Subtle jade glow on right border of endorsement card
ctx.fillStyle = '#2ea98c';
ctx.fillRect(instCardX + instCardW - 5, instCardY + 14, 3, instCardH - 28);

ctx.direction = 'rtl';
ctx.textAlign = 'right';

// Line 1: College & Institution
ctx.fillStyle = '#5fbfa6';
ctx.font = '14px KacstOffice';
ctx.fillText(ar('كلية التربية الأساسية · الهيئة العامة للتعليم التطبيقي والتدريب'), instCardX + instCardW - 20, instCardY + 32);

// Line 2: The Two Respected Professors & Developers
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 16px KacstTitle';
ctx.fillText(ar('إعداد وتطوير: د. أحمد حسين الفيلكاوي  ·  د. عبدالعزيز دخيل العنزي'), instCardX + instCardW - 20, instCardY + 60);

// Write out to social card destinations
const buffer = canvas.toBuffer('image/png');

// 1. Cover wide for landing page
const target1 = path.join(process.cwd(), 'public/screenshots/cover-wide.png');
fs.writeFileSync(target1, buffer);
console.log('Updated:', target1, buffer.length, 'bytes');

// 2. Schedule social card v4 for root index.html
const target2 = path.join(process.cwd(), 'public/schedule-social-card-v4.png');
fs.writeFileSync(target2, buffer);
console.log('Updated:', target2, buffer.length, 'bytes');

// 3. Real live dashboard replacement (so no broken screenshot remains)
const target3 = path.join(process.cwd(), 'public/screenshots/real-live-dashboard.png');
fs.writeFileSync(target3, buffer);
console.log('Updated:', target3, buffer.length, 'bytes');
