import { Converter } from "opencc-js/t2cn";

const simplify = Converter({ from: "t", to: "cn" });

export function simplifiedChinese(text: string): string {
  return simplify(text);
}

/** Normalize only search keys; retain the source's original place names. */
export function boundarySearchKey(name: string): string {
  return simplify(name.normalize("NFKC")).trim().toLocaleLowerCase();
}
