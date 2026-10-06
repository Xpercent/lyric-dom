import { describe, expect, it } from "vitest";
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

  it("测量后还原假名显示并写出溢出变量", () => {
    const { root, built } = build();
    measureAndApplyWordMasks([built.measurements], 0.2);
    for (const rt of root.querySelectorAll<HTMLElement>("rt")) expect(rt.style.display).toBe("");
    const word = root.querySelector<HTMLElement>(".lp-ruby-word");
    expect(word?.style.getPropertyValue("--lp-ruby-overflow")).toBe("0.00px");
  });
});

/** 注音单词的模拟排版尺寸 */
interface RubySpec {
  /** 主歌词文字宽度 */
  text: number;
  /** 假名占位宽度 */
  ruby: number;
  /** 与前一个单词之间的空白宽度 */
  gap?: number;
}

const rectOf = (left: number, width: number): DOMRect =>
  ({
    x: left,
    y: 0,
    left,
    top: 0,
    right: left + width,
    bottom: 10,
    width,
    height: 10,
    toJSON: () => ({}),
  }) as DOMRect;

/**
 * 按当前回收变量模拟行内落位，让假名盒的实测位置随回收量变化
 * @param words - 按文档顺序排列的注音单词
 * @param specs - 每个单词的文字与假名宽度
 */
const simulateLine = (words: HTMLElement[], specs: RubySpec[]) => {
  const rects = new Map<HTMLElement, DOMRect>();
  const relayout = () => {
    let pen = 0;
    words.forEach((word, i) => {
      const spec = specs[i];
      pen += spec.gap ?? 0;
      const reclaim = Number.parseFloat(word.style.getPropertyValue("--lp-ruby-overflow")) || 0;
      const boxWidth = Math.max(spec.text, spec.ruby);
      const left = pen - reclaim / 2;
      const rts = [...word.querySelectorAll<HTMLElement>("rt")];
      const partWidth = spec.ruby / Math.max(rts.length, 1);
      rts.forEach((rt, k) => {
        rects.set(rt, rectOf(left + k * partWidth, partWidth));
      });
      pen = left + boxWidth - reclaim / 2;
    });
  };
  words.forEach((word, i) => {
    const spec = specs[i];
    const rts = [...word.querySelectorAll<HTMLElement>("rt")];
    Object.defineProperty(word, "clientWidth", {
      get: () =>
        rts.some((rt) => rt.style.display === "none") ? spec.text : Math.max(spec.text, spec.ruby),
    });
    Object.defineProperty(word, "clientHeight", { get: () => 10 });
    for (const rt of rts)
      rt.getBoundingClientRect = () => {
        relayout();
        return rects.get(rt) ?? rectOf(0, 0);
      };
  });
};

const render = (words: LyricWord[]) => {
  const root = document.createElement("div");
  root.className = "lp-main";
  const built = buildWordSpans(words, root, {
    enableEmphasizeEffect: false,
    emphasizeMinDuration: 1000,
    showRuby: true,
    showWordRoman: false,
  });
  return { root, built };
};

const reclaimsOf = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(":scope > span.lp-ruby-word")].map((word) =>
    word.style.getPropertyValue("--lp-ruby-overflow"),
  );

const rubyWordsOf = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>(":scope > span.lp-ruby-word"),
];

describe("注音碰撞自适应排版", () => {
  it("相邻假名相撞时取消回收，退回注音撑开的间距", () => {
    const { root, built } = render([
      rubyWord("物", ["もの"], 0, 400),
      rubyWord("語", ["がたり"], 400, 800),
    ]);
    simulateLine(rubyWordsOf(root), [
      { text: 20, ruby: 40 },
      { text: 20, ruby: 60 },
    ]);
    measureAndApplyWordMasks([built.measurements], 0.2);
    expect(reclaimsOf(root)).toEqual(["0.00px", "0.00px"]);
  });

  it("假名被空白隔开时保持紧凑回收", () => {
    const { root, built } = render([
      rubyWord("司", ["つかさど"], 0, 400),
      rubyWord("空", ["そら"], 400, 800),
    ]);
    simulateLine(rubyWordsOf(root), [
      { text: 20, ruby: 50, gap: 0 },
      { text: 20, ruby: 50, gap: 60 },
    ]);
    measureAndApplyWordMasks([built.measurements], 0.2);
    expect(reclaimsOf(root)).toEqual(["30.00px", "30.00px"]);
  });

  it("相撞时连窄注音的相邻词一并撑开", () => {
    const { root, built } = render([
      rubyWord("司", ["つかさど"], 0, 400),
      rubyWord("田", ["でん"], 400, 800),
    ]);
    simulateLine(rubyWordsOf(root), [
      { text: 20, ruby: 50 },
      { text: 20, ruby: 30 },
    ]);
    measureAndApplyWordMasks([built.measurements], 0.2);
    expect(reclaimsOf(root)).toEqual(["0.00px", "0.00px"]);
  });

  it("撑开之后不再制造新的碰撞", () => {
    const { root, built } = render([
      rubyWord("物語", ["ものがたり"], 0, 400),
      rubyWord("司", ["つかさど"], 400, 800),
      rubyWord("る", ["る"], 800, 1000),
    ]);
    simulateLine(rubyWordsOf(root), [
      { text: 40, ruby: 90 },
      { text: 20, ruby: 60 },
      { text: 20, ruby: 20 },
    ]);
    measureAndApplyWordMasks([built.measurements], 0.2);
    expect(reclaimsOf(root)).toEqual(["0.00px", "0.00px", "0.00px"]);
  });
});
