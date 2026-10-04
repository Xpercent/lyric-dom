/** 词内注音的宽度回收与防重叠排版 */

import type { WordMeasurement } from "../types";

/**
 * 注音回收求解的输入，全部为脱离 DOM 的纯几何量
 * 尺寸取零回收（浏览器原生 ruby）布局下的值，与上一次写出的回收量无关，求解因此幂等
 */
export interface RubyReclaimInput {
  /** 隐藏假名后的主文本宽度 */
  baseWidth: number;
  /** 浏览器为容纳假名撑开后的单词盒宽度 */
  boxWidth: number;
  /** 零回收布局下单词盒的左边缘 */
  naturalLeft: number;
  /** 零回收布局下单词盒所在视觉行的纵坐标 */
  rowTop: number;
  /** 假名相对单词盒左边缘的起点 */
  annotationLeft: number;
  /** 假名相对单词盒左边缘的终点 */
  annotationRight: number;
}

/** 单个注音单词的回收量，供负外边距消费，可为负（转为正外边距让位） */
export interface RubyReclaim {
  /** 左侧回收量 */
  reclaimLeft: number;
  /** 右侧回收量 */
  reclaimRight: number;
}

/** 注音单词的排版数据：DOM 引用加求解输入输出 */
interface RubyItem extends RubyReclaimInput, RubyReclaim {
  /** 单词 span 元素 */
  element: HTMLSpanElement;
  /** 单词内的假名元素 */
  annotations: HTMLElement[];
}

/** 相邻假名的最小间距占主字号的比例 */
const annotationGapRatio = 0.05;

/** 左侧回收量的 CSS 变量名 */
const reclaimLeftVar = "--lp-ruby-reclaim-left";

/** 右侧回收量的 CSS 变量名 */
const reclaimRightVar = "--lp-ruby-reclaim-right";

/**
 * 读回已写出的回收量，未写过时按零处理
 * @param element - 单词 span 元素
 * @param name - CSS 变量名
 * @returns 回收量像素值
 */
const readReclaim = (element: HTMLSpanElement, name: string): number => {
  return Number.parseFloat(element.style.getPropertyValue(name)) || 0;
};

/**
 * 分配回收量：先按左右均分全额回收，撞上相邻假名时退让
 *
 * 回收左侧只移动本词，回收右侧会连带后序所有词左移，故退让优先吃本词的左侧额度，
 * 不够再吃前词的右侧额度；两侧都吃完仍相撞时转为正外边距让出最小间距。
 * 回收只会让行变窄，可能使后序单词提前换行落到同一行而漏判相撞，
 * 故按 rowTop 分行重置相撞链，跨行互不约束。
 * @param inputs - 按文档顺序排列的注音单词几何数据
 * @param minGap - 相邻假名的最小间距
 * @returns 与输入等长的回收量数组
 */
export const solveRubyReclaim = (inputs: RubyReclaimInput[], minGap: number): RubyReclaim[] => {
  const result: RubyReclaim[] = inputs.map(() => ({ reclaimLeft: 0, reclaimRight: 0 }));
  /** 本词之前所有词已回收的行内宽度 */
  let reclaimedBefore = 0;
  let prevIndex = -1;
  let prevRowTop = Number.NaN;
  let prevAnnotationRight = Number.NEGATIVE_INFINITY;

  inputs.forEach((input, index) => {
    const reclaim = result[index];
    const overflow = Math.max(0, input.boxWidth - input.baseWidth);
    reclaim.reclaimLeft = overflow / 2;
    reclaim.reclaimRight = overflow / 2;

    if (input.rowTop !== prevRowTop) {
      prevRowTop = input.rowTop;
      prevIndex = -1;
      prevAnnotationRight = Number.NEGATIVE_INFINITY;
    }

    let boxLeft = input.naturalLeft - reclaimedBefore - reclaim.reclaimLeft;
    let deficit = prevAnnotationRight + minGap - (boxLeft + input.annotationLeft);
    if (deficit > 0) {
      const fromSelf = Math.min(deficit, reclaim.reclaimLeft);
      reclaim.reclaimLeft -= fromSelf;
      boxLeft += fromSelf;
      deficit -= fromSelf;
      if (prevIndex >= 0 && deficit > 0) {
        const prev = result[prevIndex];
        const fromPrev = Math.min(deficit, prev.reclaimRight);
        prev.reclaimRight -= fromPrev;
        reclaimedBefore -= fromPrev;
        boxLeft += fromPrev;
        deficit -= fromPrev;
      }
      if (deficit > 0) {
        reclaim.reclaimLeft -= deficit;
        boxLeft += deficit;
      }
    }

    prevAnnotationRight = boxLeft + input.annotationRight;
    reclaimedBefore += reclaim.reclaimLeft + reclaim.reclaimRight;
    prevIndex = index;
  });

  return result;
};

/**
 * 收集一行内按 DOM 顺序排列的注音单词
 * @param measurements - 该行的单词测量数据
 * @returns 注音单词排版数据
 */
const collectRubyItems = (measurements: WordMeasurement[]): RubyItem[] => {
  const items: RubyItem[] = [];
  for (const measurement of measurements) {
    const element = measurement.element;
    if (!element.classList.contains("lp-ruby-word")) continue;
    const annotations = Array.from(element.querySelectorAll<HTMLElement>("rt"));
    if (annotations.length === 0) continue;
    items.push({
      element,
      annotations,
      baseWidth: 0,
      boxWidth: 0,
      naturalLeft: 0,
      rowTop: 0,
      annotationLeft: 0,
      annotationRight: 0,
      reclaimLeft: 0,
      reclaimRight: 0,
    });
  }
  return items;
};

/**
 * 写出回收量，供 CSS 负外边距消费
 * @param items - 注音单词排版数据
 */
const writeReclaimVars = (items: RubyItem[]) => {
  for (const item of items) {
    item.element.style.setProperty(reclaimLeftVar, `${item.reclaimLeft.toFixed(2)}px`);
    item.element.style.setProperty(reclaimRightVar, `${item.reclaimRight.toFixed(2)}px`);
  }
};

/**
 * 量出主文本宽度、单词盒位置与假名范围
 * 读写分批以合并回流：隐藏假名量一次主文本宽度，还原后再量一次单词盒与假名。
 * 零回收基准位置由当前布局反推——把已写出的回收量加回去，省掉一次清场重写
 * @param lines - 每行的注音单词排版数据
 */
const measureRubyItems = (lines: RubyItem[][]) => {
  const items = lines.flat();
  for (const item of items)
    for (const rt of item.annotations) rt.style.setProperty("display", "none");
  // 回流一次：主文本宽度，外边距不参与 clientWidth，故与已写出的回收量无关
  for (const item of items) item.baseWidth = item.element.getBoundingClientRect().width;
  for (const item of items) for (const rt of item.annotations) rt.style.removeProperty("display");
  // 回流一次：单词盒、假名范围与零回收基准位置
  for (const line of lines) {
    /** 本词之前所有注音词已写出的回收量之和 */
    let appliedBefore = 0;
    for (const item of line) {
      const box = item.element.getBoundingClientRect();
      const appliedLeft = readReclaim(item.element, reclaimLeftVar);
      const appliedRight = readReclaim(item.element, reclaimRightVar);
      item.boxWidth = box.width;
      item.rowTop = Math.round(box.top);
      item.naturalLeft = box.left + appliedBefore + appliedLeft;
      appliedBefore += appliedLeft + appliedRight;
      item.annotationLeft = Number.POSITIVE_INFINITY;
      item.annotationRight = Number.NEGATIVE_INFINITY;
      for (const rt of item.annotations) {
        const rect = rt.getBoundingClientRect();
        item.annotationLeft = Math.min(item.annotationLeft, rect.left - box.left);
        item.annotationRight = Math.max(item.annotationRight, rect.right - box.left);
      }
    }
  }
};

/**
 * 回收注音挤占的行内宽度，并保证相邻注音互不相撞
 * 只调整单词盒在行内的位置，同一单词内多个 ruby 的排布仍由浏览器决定
 * @param wordMeasurements - 每行的单词测量数据
 */
export const layoutRubyWords = (wordMeasurements: WordMeasurement[][]) => {
  const lines: RubyItem[][] = [];
  for (const measurements of wordMeasurements) {
    const items = collectRubyItems(measurements);
    if (items.length > 0) lines.push(items);
  }
  if (lines.length === 0) return;

  measureRubyItems(lines);

  for (const line of lines) {
    const fontSize = Number.parseFloat(getComputedStyle(line[0].element).fontSize) || 0;
    const reclaim = solveRubyReclaim(line, fontSize * annotationGapRatio);
    line.forEach((item, index) => {
      Object.assign(item, reclaim[index]);
    });
  }
  writeReclaimVars(lines.flat());
};
