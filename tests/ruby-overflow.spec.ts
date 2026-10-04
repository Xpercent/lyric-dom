import { describe, expect, it } from "vitest";
import { type RubyReclaimInput, solveRubyReclaim } from "../src/engine/ruby-layout";
import { buildWordSpans, measureAndApplyWordMasks } from "../src/engine/word-builder";
import type { LyricWord } from "../src/types";

const rubyWord = (text: string, annotation: string[], start: number, end: number): LyricWord => ({
  word: text,
  startTime: start,
  endTime: end,
  ruby: annotation.map((word) => ({ word, startTime: start, endTime: end })),
});

const build = (showWordRoman = false) => {
  const root = document.createElement("div");
  root.className = "lp-main";
  const built = buildWordSpans(
    [
      rubyWord("光", ["ひかり"], 0, 400),
      { word: "と", startTime: 400, endTime: 600 },
      rubyWord("夜空", ["よ", "ぞら"], 600, 1200),
    ],
    root,
    {
      enableEmphasizeEffect: false,
      emphasizeMinDuration: 1000,
      showRuby: true,
      showWordRoman,
    },
  );
  return { root, built };
};

describe("词内注音排版", () => {
  it("只把溢出回收标记加在直接带注音的单词上", () => {
    const { root } = build();
    const spans = root.querySelectorAll(":scope > span");
    expect(spans[0].className).toBe("lp-ruby-word");
    expect(spans[1].className).toBe("");
    expect(root.querySelectorAll("ruby rt")).toHaveLength(3);
  });

  it("逐字音译下注音仍随文字层渲染，不参与溢出回收", () => {
    const { root } = build(true);
    expect(root.querySelector(".lp-word-text rt")?.textContent).toBe("ひかり");
    expect(root.querySelectorAll(".lp-ruby-word")).toHaveLength(0);
  });

  it("测量后还原假名显示并写出左右回收量", () => {
    const { root, built } = build();
    measureAndApplyWordMasks([built.measurements], 0.2);
    for (const rt of root.querySelectorAll<HTMLElement>("rt")) expect(rt.style.display).toBe("");
    const word = root.querySelector<HTMLElement>(".lp-ruby-word");
    expect(word?.style.getPropertyValue("--lp-ruby-reclaim-left")).toBe("0.00px");
    expect(word?.style.getPropertyValue("--lp-ruby-reclaim-right")).toBe("0.00px");
  });
});

/** 造一个 40px 基字、假名宽 annotationWidth 的注音单词几何数据 */
const ruby = (naturalLeft: number, annotationWidth: number, rowTop = 0): RubyReclaimInput => {
  const baseWidth = 40;
  const boxWidth = Math.max(baseWidth, annotationWidth);
  const annotationLeft = (boxWidth - annotationWidth) / 2;
  return {
    baseWidth,
    boxWidth,
    naturalLeft,
    rowTop,
    annotationLeft,
    annotationRight: annotationLeft + annotationWidth,
  };
};

/** 按回收量还原单词盒位置，返回各词假名的实际占位区间 */
const annotationSpans = (
  inputs: RubyReclaimInput[],
  reclaim: { reclaimLeft: number; reclaimRight: number }[],
) => {
  let reclaimedBefore = 0;
  return inputs.map((input, index) => {
    const boxLeft = input.naturalLeft - reclaimedBefore - reclaim[index].reclaimLeft;
    reclaimedBefore += reclaim[index].reclaimLeft + reclaim[index].reclaimRight;
    return {
      left: boxLeft + input.annotationLeft,
      right: boxLeft + input.annotationRight,
      rowTop: input.rowTop,
    };
  });
};

describe("注音回收求解", () => {
  const minGap = 2;

  it("假名互不相撞时全额回收", () => {
    // 光(ひかり) 与 命(いのち) 之间隔着无注音假名，零回收布局下假名相距 100px
    const inputs = [ruby(0, 60), ruby(200, 60)];
    const reclaim = solveRubyReclaim(inputs, minGap);
    expect(reclaim).toEqual([
      { reclaimLeft: 10, reclaimRight: 10 },
      { reclaimLeft: 10, reclaimRight: 10 },
    ]);
  });

  it("本词有额度时靠退让自己回收量让位", () => {
    // 考(かんが) 与 言(ことば) 相邻，两侧假名各宽 60px、基字 40px
    const inputs = [ruby(0, 60), ruby(60, 60)];
    const reclaim = solveRubyReclaim(inputs, minGap);
    const spans = annotationSpans(inputs, reclaim);
    expect(spans[1].left - spans[0].right).toBeCloseTo(minGap, 6);
    expect(reclaim[0].reclaimLeft).toBeCloseTo(10, 6);
    expect(reclaim[1].reclaimRight).toBeCloseTo(10, 6);
  });

  it("两侧额度都吃完时转为正外边距让出最小间距", () => {
    // 物(もの) 恰好等宽无额度，語(がたり) 只能自己让位
    const inputs = [ruby(0, 40), ruby(40, 60)];
    const reclaim = solveRubyReclaim(inputs, minGap);
    const spans = annotationSpans(inputs, reclaim);
    expect(spans[1].left - spans[0].right).toBeCloseTo(minGap, 6);
    expect(reclaim[0].reclaimLeft).toBe(0);
    expect(reclaim[1].reclaimLeft).toBeCloseTo(-minGap, 6);
  });

  it("回收量不超过溢出的一半，正向让位不超过最小间距", () => {
    const inputs = [ruby(0, 40), ruby(40, 60), ruby(100, 100), ruby(200, 40)];
    const reclaim = solveRubyReclaim(inputs, minGap);
    for (const item of reclaim) {
      expect(item.reclaimLeft).toBeLessThanOrEqual(30);
      expect(item.reclaimRight).toBeLessThanOrEqual(30);
      expect(item.reclaimLeft).toBeGreaterThanOrEqual(-minGap);
      expect(item.reclaimRight).toBeGreaterThanOrEqual(0);
    }
    const spans = annotationSpans(inputs, reclaim);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].left - spans[i - 1].right).toBeGreaterThanOrEqual(minGap - 1e-6);
    }
  });

  it("换行后不同视觉行的假名互不约束", () => {
    const inputs = [ruby(0, 60, 0), ruby(60, 60, 48)];
    const reclaim = solveRubyReclaim(inputs, minGap);
    expect(reclaim).toEqual([
      { reclaimLeft: 10, reclaimRight: 10 },
      { reclaimLeft: 10, reclaimRight: 10 },
    ]);
  });
});
