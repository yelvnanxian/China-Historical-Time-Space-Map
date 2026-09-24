import { Converter } from "opencc-js/t2cn";

const simplify = Converter({ from: "t", to: "cn" });

export function simplifiedChinese(text: string): string {
  // Phrase conversion can expose another traditional character (於潛 → 於潜).
  let result = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = simplify(result);
    if (next === result) break;
    result = next;
  }
  return result;
}

/** Normalize only search keys; retain the source's original place names. */
export function boundarySearchKey(name: string): string {
  return simplifiedChinese(name.normalize("NFKC")).trim().toLocaleLowerCase();
}
