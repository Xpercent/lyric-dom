/** 单词 span 构建与掩码测量 */

import type { LyricLine, LyricSpan, LyricWord, WordAnimTarget, WordMeasurement } from "../types";
import { chunkAndSplitLyricWords, needsSpaceBetween } from "../utils/split-words";
import { shouldChunkEmphasize } from "./emphasize";

export type { WordAnimTarget, WordMeasurement };

/** buildWordSpans 返回结果 */
export interface BuildResult {
  measurements: WordMeasurement[];
  animTargets: WordAnimTarget[];
}

/** 单词构建选项 */
export interface WordBuildOptions {
  /** 是否启用强调效果 */
  enableEmphasizeEffect: boolean;
  /** 触发强调效果的最小持续时间（毫秒） */
  emphasizeMinDuration: number;
  /** 是否显示词内注音 */
  showRuby: boolean;
  /** 是否显示逐字音译 */
  showWordRoman?: boolean;
}

/**
 * 构建单词 span 元素并添加到主容器
 * @param words - 歌词单词数组
 * @param mainDiv - 挂载目标容器
 * @param options - 单词构建选项
 * @returns 测量数据与动画目标
 */
export const buildWordSpans = (
  words: LyricWord[],
  mainDiv: HTMLDivElement,
  options: WordBuildOptions,
): BuildResult => {
  const {
    enableEmphasizeEffect: enableEmphasize,
    emphasizeMinDuration,
    showRuby,
    showWordRoman = false,
  } = options;
  const chunks = chunkAndSplitLyricWords(words);
  const measurements: WordMeasurement[] = [];
  const animTargets: WordAnimTarget[] = [];

  const hasWhitespaceInfo = chunks.some((chunk) => {
    if (Array.isArray(chunk)) {
      return chunk.some((word) => word.word !== word.word.trim());
    }
    return chunk.word !== chunk.word.trim();
  });

  const nonEmptyChunks: (LyricWord | LyricWord[])[] = chunks.filter((c) =>
    Array.isArray(c) ? c.some((w) => w.word.trim()) : c.word.trim(),
  );
  const lastChunk = nonEmptyChunks[nonEmptyChunks.length - 1];

  if (!hasWhitespaceInfo) {
    let previousText = "";
    for (const chunk of chunks) {
      const atoms = Array.isArray(chunk) ? chunk : [chunk];
      const isEmp =
        enableEmphasize && atoms.length > 0 && shouldChunkEmphasize(atoms, emphasizeMinDuration);
      const isLast = chunk === lastChunk;

      const firstText = atoms[0]?.word.trim();
      if (firstText && needsSpaceBetween(previousText, firstText)) {
        mainDiv.appendChild(document.createTextNode(" "));
      }

      if (isEmp) {
        buildEmphasizedChunk(atoms, mainDiv, measurements, animTargets, isLast, showWordRoman);
      } else {
        for (const atom of atoms) {
          const text = atom.word.trim();
          if (!text) continue;
          appendWordSpan(atom, mainDiv, measurements, animTargets, showRuby, showWordRoman);
        }
      }
      const lastAtom = atoms[atoms.length - 1];
      if (lastAtom) previousText = lastAtom.word.trim();
    }
    return { measurements, animTargets };
  }

  // 正常路径（歌词文本中包含显式空格）
  let previousText = "";

  for (const chunk of chunks) {
    if (Array.isArray(chunk)) {
      const mergedText = chunk.map((word) => word.word).join("");
      const isEmp = enableEmphasize && shouldChunkEmphasize(chunk, emphasizeMinDuration);
      const isLast = chunk === lastChunk;

      if (mergedText.trimStart() !== mergedText) {
        mainDiv.appendChild(document.createTextNode(" "));
      } else if (needsSpaceBetween(previousText, mergedText)) {
        mainDiv.appendChild(document.createTextNode(" "));
      }

      if (isEmp) {
        buildEmphasizedChunk(chunk, mainDiv, measurements, animTargets, isLast, showWordRoman);
      } else {
        for (let wIdx = 0; wIdx < chunk.length; wIdx++) {
          const word = chunk[wIdx];
          appendWordSpan(word, mainDiv, measurements, animTargets, showRuby, showWordRoman);
        }
      }

      if (mergedText.trimEnd() !== mergedText) {
        mainDiv.appendChild(document.createTextNode(" "));
        previousText = "";
      } else {
        previousText = mergedText;
      }
    } else if (!chunk.word.trim()) {
      mainDiv.appendChild(document.createTextNode(" "));
      previousText = "";
    } else {
      const text = chunk.word;
      const isEmp = enableEmphasize && shouldChunkEmphasize([chunk], emphasizeMinDuration);
      const isLast = chunk === lastChunk;

      if (text.trimStart() !== text) {
        mainDiv.appendChild(document.createTextNode(" "));
      } else if (needsSpaceBetween(previousText, text)) {
        mainDiv.appendChild(document.createTextNode(" "));
      }

      if (isEmp) {
        buildEmphasizedChunk([chunk], mainDiv, measurements, animTargets, isLast, showWordRoman);
      } else {
        appendWordSpan(chunk, mainDiv, measurements, animTargets, showRuby, showWordRoman);
      }

      if (text.trimEnd() !== text) {
        mainDiv.appendChild(document.createTextNode(" "));
        previousText = "";
      } else {
        previousText = text.trim();
      }
    }
  }
  return { measurements, animTargets };
};

/**
 * 创建普通单词 span（含 ruby 注音与逐字音译）并挂载
 * @param word - 单词数据
 * @param mainDiv - 挂载目标容器
 * @param measurements - 测量数据输出数组
 * @param animTargets - 动画目标输出数组
 * @param showRuby - 是否渲染注音
 * @param showWordRoman - 是否渲染逐字音译
 */
const appendWordSpan = (
  word: LyricWord,
  mainDiv: HTMLDivElement,
  measurements: WordMeasurement[],
  animTargets: WordAnimTarget[],
  showRuby: boolean,
  showWordRoman: boolean,
) => {
  const span = document.createElement("span");
  const ruby = showRuby ? word.ruby : undefined;

  if (showWordRoman) {
    span.className = "lp-word-roman";

    const textEl = document.createElement("span");
    textEl.className = "lp-word-text";
    if (ruby?.length) {
      buildRubyContent(textEl, word.word, ruby);
    } else {
      textEl.textContent = word.word;
    }
    span.appendChild(textEl);

    const romanEl = document.createElement("span");
    romanEl.className = "lp-roman-word";
    const romanText = word.romanWord?.trim();
    romanEl.textContent = romanText && romanText.length > 0 ? romanText : "\u00A0";
    span.appendChild(romanEl);
  } else {
    if (ruby?.length) {
      buildRubyContent(span, word.word, ruby);
      span.classList.add("lp-ruby-word");
    } else {
      span.textContent = word.word;
    }
  }

  mainDiv.appendChild(span);
  measurements.push({ element: span, word, width: 0, fadeWidth: 0 });
  animTargets.push({
    element: span,
    word,
    isEmphasize: false,
    charElements: [],
    isLastWord: false,
  });
};

/**
 * 构建注音内容
 * ruby 片段数与词字符数一致时逐字配对，否则整词标注
 * @param span - 注音挂载的单词 span
 * @param text - 单词文本
 * @param ruby - 注音片段列表
 */
const buildRubyContent = (span: HTMLSpanElement, text: string, ruby: LyricSpan[]) => {
  const chars = Array.from(text);
  const validRuby = ruby.filter((r) => r.word.trim());
  if (validRuby.length === chars.length) {
    for (let i = 0; i < chars.length; i++) {
      const rubyEl = document.createElement("ruby");
      rubyEl.textContent = chars[i];
      const rt = document.createElement("rt");
      rt.textContent = validRuby[i].word;
      rubyEl.appendChild(rt);
      span.appendChild(rubyEl);
    }
  } else {
    const rubyEl = document.createElement("ruby");
    rubyEl.textContent = text;
    const rt = document.createElement("rt");
    rt.textContent = validRuby.map((r) => r.word).join("");
    rubyEl.appendChild(rt);
    span.appendChild(rubyEl);
  }
};

/**
 * 构建强调单词 chunk
 * @param atoms - 合并前的同组单词
 * @param mainDiv - 挂载目标容器
 * @param measurements - 测量数据输出数组
 * @param animTargets - 动画目标输出数组
 * @param isLastWord - 是否为行末单词
 * @param showWordRoman - 是否渲染逐字音译
 */
const buildEmphasizedChunk = (
  atoms: LyricWord[],
  mainDiv: HTMLDivElement,
  measurements: WordMeasurement[],
  animTargets: WordAnimTarget[],
  isLastWord: boolean,
  showWordRoman: boolean,
) => {
  const mergedWord: LyricWord = {
    word: atoms.map((a) => a.word).join(""),
    startTime: Math.min(...atoms.map((a) => a.startTime)),
    endTime: Math.max(...atoms.map((a) => a.endTime)),
  };
  const trimmed = mergedWord.word.trim();

  const wrapper = document.createElement("span");
  wrapper.className = "lp-emp-wrapper";

  const charElements: HTMLElement[] = [];
  if (showWordRoman) {
    wrapper.classList.add("lp-word-roman");

    const charsContainer = document.createElement("span");
    charsContainer.className = "lp-emp-chars";
    for (const char of trimmed) {
      const charSpan = document.createElement("span");
      charSpan.className = "lp-emp-char";
      charSpan.textContent = char;
      charsContainer.appendChild(charSpan);
      charElements.push(charSpan);
    }
    wrapper.appendChild(charsContainer);

    const romanEl = document.createElement("span");
    romanEl.className = "lp-roman-word";
    const romanParts = atoms.map((a) => a.romanWord?.trim()).filter(Boolean);
    const romanText = romanParts.length > 0 ? romanParts.join(" ") : "";
    romanEl.textContent = romanText.length > 0 ? romanText : "\u00A0";
    wrapper.appendChild(romanEl);
  } else {
    for (const char of trimmed) {
      const charSpan = document.createElement("span");
      charSpan.className = "lp-emp-char";
      charSpan.textContent = char;
      wrapper.appendChild(charSpan);
      charElements.push(charSpan);
    }
  }

  mainDiv.appendChild(wrapper);
  measurements.push({ element: wrapper, word: mergedWord, width: 0, fadeWidth: 0 });
  animTargets.push({
    element: wrapper,
    word: mergedWord,
    isEmphasize: true,
    charElements,
    isLastWord,
  });
};

/** 相邻注音假名之间保留的最小间距（像素），实测间距小于该值即判定为碰撞 */
const RUBY_MIN_GAP = 0.5;

/**
 * 碰撞判定的最大轮次
 * 每轮量一次几何，撑开注音后可能引发重新换行，多留轮次以保证最终收敛
 */
const RUBY_COLLISION_MAX_PASSES = 3;

/** 注音单词的排版状态 */
interface RubyWord {
  /** 单词 span 元素 */
  element: HTMLSpanElement;
  /** 词内的假名元素 */
  annotations: HTMLElement[];
  /** 假名挤占主歌词的行内宽度 */
  overflow: number;
  /** 是否已取消回收，退回注音撑开间距的自然排版 */
  expanded: boolean;
}

/** 注音假名在页面中的占位区间 */
interface RubyBand {
  rubyWord: RubyWord;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 写出注音回收量，负外边距由 CSS 按该变量均摊到两侧
 * @param rubyWord - 注音单词
 */
const applyRubyReclaim = (rubyWord: RubyWord) => {
  const overflow = rubyWord.expanded ? 0 : rubyWord.overflow;
  rubyWord.element.style.setProperty("--lp-ruby-overflow", `${Math.max(0, overflow).toFixed(2)}px`);
};

/**
 * 合并词内所有假名的实测占位区间
 * @param rubyWord - 注音单词
 * @returns 占位区间；量不到有效尺寸（如元素未挂载）时返回 undefined
 */
const readRubyBand = (rubyWord: RubyWord): RubyBand | undefined => {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rt of rubyWord.annotations) {
    const rect = rt.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (left >= right || top >= bottom) return undefined;
  return { rubyWord, left, right, top, bottom };
};

/**
 * 判断两块注音占位是否相交：横向交叠且纵向同处一行
 * @param a - 靠左的占位区间
 * @param b - 靠右的占位区间
 */
const isRubyCollision = (a: RubyBand, b: RubyBand) =>
  a.left < b.right - RUBY_MIN_GAP &&
  b.left < a.right - RUBY_MIN_GAP &&
  a.top < b.bottom &&
  b.top < a.bottom;

/**
 * 收集一行内发生碰撞的注音单词
 * @param bands - 按左边界排序后的占位区间
 */
const collectRubyCollisions = (bands: RubyBand[]) => {
  const collided = new Set<RubyWord>();
  for (let i = 0; i < bands.length; i++) {
    const current = bands[i];
    for (let j = i + 1; j < bands.length && bands[j].left < current.right - RUBY_MIN_GAP; j++) {
      if (isRubyCollision(current, bands[j])) {
        collided.add(current.rubyWord);
        collided.add(bands[j].rubyWord);
      }
    }
  }
  return collided;
};

/**
 * 按实测几何校正注音碰撞
 * 撑开只会把同行后续内容推远、不会制造新的碰撞，因此逐轮量测即可收敛
 * @param lines - 每行的注音单词
 */
const resolveRubyCollisions = (lines: RubyWord[][]) => {
  for (let pass = 0; pass < RUBY_COLLISION_MAX_PASSES; pass++) {
    const collided = new Set<RubyWord>();
    for (const words of lines) {
      if (words.length < 2) continue;
      const bands: RubyBand[] = [];
      for (const word of words) {
        const band = readRubyBand(word);
        if (band) bands.push(band);
      }
      bands.sort((a, b) => a.left - b.left);
      for (const word of collectRubyCollisions(bands)) collided.add(word);
    }

    let changed = false;
    for (const word of collided) {
      if (word.expanded || word.overflow <= 0) continue;
      word.expanded = true;
      applyRubyReclaim(word);
      changed = true;
    }
    if (!changed) return;
  }
};

/**
 * 量出词内注音撑开单词盒的溢出宽度，写入 --lp-ruby-overflow 供负外边距回收
 * 隐藏假名量一次、还原后再量一次，两次差值即假名挤占主歌词的行内宽度
 * 回收会让宽注音溢出到相邻字上，故再按实测几何判定碰撞并撑开相撞的单词
 * @param wordMeasurements - 每行的单词测量数据
 */
const measureRubyOverflow = (wordMeasurements: WordMeasurement[][]) => {
  const lines: RubyWord[][] = [];
  for (let i = 0; i < wordMeasurements.length; i++) {
    const lineMeasurements = wordMeasurements[i];
    if (!lineMeasurements) continue;
    const words: RubyWord[] = [];
    for (const m of lineMeasurements) {
      if (!m.element.classList.contains("lp-ruby-word")) continue;
      words.push({
        element: m.element,
        annotations: Array.from(m.element.querySelectorAll<HTMLElement>("rt")),
        overflow: 0,
        expanded: false,
      });
    }
    if (words.length > 0) lines.push(words);
  }
  if (lines.length === 0) return;

  const annotations = lines.flatMap((words) => words.flatMap((word) => word.annotations));
  const allWords = lines.flat();
  for (const rt of annotations) rt.style.setProperty("display", "none");
  const textWidths = allWords.map((word) => word.element.clientWidth);
  for (const rt of annotations) rt.style.removeProperty("display");
  const boxWidths = allWords.map((word) => word.element.clientWidth);

  // 先批量写入回收量，再统一按实测几何判定碰撞，避免读写交替引发多次回流
  allWords.forEach((word, i) => {
    word.overflow = Math.max(0, boxWidths[i] - textWidths[i]);
    applyRubyReclaim(word);
  });

  resolveRubyCollisions(lines);
};

/**
 * 测量所有单词的宽度并设置 CSS 掩码
 * 采用读写分离策略：第一遍批量读取所有 DOM 尺寸（触发一次回流），
 * 第二遍批量写入所有 CSS mask 样式（零回流），避免逐词读写交替导致的 N 次强制回流
 * @param wordMeasurements - 每行的单词测量数据
 * @param fadeRatio - 渐变区域宽度比例
 * @param lines - 歌词行数组，提供行起始时间
 */
export const measureAndApplyWordMasks = (
  wordMeasurements: WordMeasurement[][],
  fadeRatio: number,
  lines?: LyricLine[],
) => {
  measureRubyOverflow(wordMeasurements);

  // 临时存储每个 measurement 的 padding，供第二遍使用
  const paddings: number[][] = new Array(wordMeasurements.length);

  // 批量读取 DOM 尺寸（合并回流）
  for (let i = 0; i < wordMeasurements.length; i++) {
    const lineMeasurements = wordMeasurements[i];
    if (!lineMeasurements) {
      paddings[i] = [];
      continue;
    }
    paddings[i] = new Array(lineMeasurements.length);
    for (let j = 0; j < lineMeasurements.length; j++) {
      const m = lineMeasurements[j];
      const el = m.element;
      const padding = el.classList.contains("lp-emp-wrapper")
        ? Number.parseFloat(getComputedStyle(el).paddingLeft) || 0
        : 0;
      paddings[i][j] = padding;
      m.width = (el.clientWidth || 1) - padding * 2;
      m.fadeWidth = ((el.clientHeight || 16) - padding * 2) * fadeRatio;
    }
  }

  // 批量写入 CSS mask 样式
  for (let i = 0; i < wordMeasurements.length; i++) {
    const lineMeasurements = wordMeasurements[i];
    const lineStart = lines?.[i]?.startTime ?? 0;
    if (!lineMeasurements) continue;
    for (let j = 0; j < lineMeasurements.length; j++) {
      const measurement = lineMeasurements[j];
      const padding = paddings[i][j];
      const elementWidth = measurement.width;
      const gradientWidth = measurement.fadeWidth;
      const totalAspect = 2 + gradientWidth / elementWidth;
      const gradientRatio = gradientWidth / elementWidth / totalAspect;
      const gradientStart = (1 - gradientRatio) / 2;
      const maskImage = `linear-gradient(to right,rgba(0,0,0,var(--ba)) ${gradientStart * 100}%,rgba(0,0,0,var(--da)) ${(gradientStart + gradientRatio) * 100}%)`;
      const maskPixelWidth = totalAspect * elementWidth;
      const maskSize = `${maskPixelWidth}px 100%`;
      const wordData = measurement.word;
      const totalMaskWidth = elementWidth + gradientWidth;
      const wordDuration = Math.abs(wordData.endTime - wordData.startTime) || 1;
      // preRoll：在 startTime 之前提前开始扫动，让相邻词亮区衔接而非硬切
      const preRoll = Math.min(80, wordDuration * 0.3);
      const adjustedStart = Math.min(
        wordData.startTime,
        Math.max(lineStart, wordData.startTime - preRoll),
      );
      const adjustedDuration = Math.max(1, wordData.endTime - adjustedStart);
      const startPos = padding - totalMaskWidth;
      const endPos = padding;
      const speed = totalMaskWidth / adjustedDuration;
      const maskPosition = Number.isFinite(speed)
        ? `clamp(${startPos}px,calc(${startPos}px + (var(--t,${lineStart}) - ${adjustedStart}) * ${speed}px),${endPos}px) 0px,left top`
        : `${startPos}px 0px,left top`;
      const style = measurement.element.style;
      style.setProperty("-webkit-mask-image", maskImage);
      style.setProperty("-webkit-mask-size", maskSize);
      style.setProperty("-webkit-mask-repeat", "no-repeat");
      style.setProperty("-webkit-mask-position", maskPosition);
      style.removeProperty("-webkit-mask-composite");
      style.setProperty("mask-image", maskImage);
      style.setProperty("mask-size", maskSize);
      style.setProperty("mask-repeat", "no-repeat");
      style.setProperty("mask-position", maskPosition);
      style.removeProperty("mask-composite");
    }
  }
};
