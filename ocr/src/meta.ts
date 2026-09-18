// 從 rec ONNX 的 metadata_props 讀內嵌字典，不必另放 txt。
// protobuf 只解我們要的 StringStringEntryProto，其他欄位略過。

import { readFileSync } from "node:fs";

function read_varint(buf: Buffer, pos: number): [number, number] {
  let result = 0n;
  let shift = 0n;
  let next = pos;
  let byte = 0;
  do {
    byte = buf[next] ?? 0;
    next += 1;
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
  } while (byte & 0x80);
  return [Number(result), next];
}

export function read_onnx_metadata(file_path: string): Record<string, string> {
  const buf = readFileSync(file_path);
  const meta: Record<string, string> = {};
  let pos = 0;
  while (pos < buf.length) {
    let tag = 0;
    [tag, pos] = read_varint(buf, pos);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      [, pos] = read_varint(buf, pos);
      continue;
    }
    if (wire !== 2) {
      throw new Error(`ONNX metadata 遇到不支援的 wire type ${wire}`);
    }
    let len = 0;
    [len, pos] = read_varint(buf, pos);
    if (field === 14) {
      const end = pos + len;
      let key = "";
      let value = "";
      let cursor = pos;
      while (cursor < end) {
        let inner = 0;
        [inner, cursor] = read_varint(buf, cursor);
        let inner_len = 0;
        [inner_len, cursor] = read_varint(buf, cursor);
        const text = buf.toString("utf8", cursor, cursor + inner_len);
        cursor += inner_len;
        if (inner >>> 3 === 1) {
          key = text;
        } else if (inner >>> 3 === 2) {
          value = text;
        }
      }
      meta[key] = value;
    }
    pos += len;
  }
  return meta;
}

/** CTC 標籤：blank + 字典 + 空白，與 PaddleOCR 排列一致。 */
export function charset_from_rec_model(file_path: string): string[] {
  const meta = read_onnx_metadata(file_path);
  if (!meta.character) {
    throw new Error("rec 模型沒有內嵌 character 字典");
  }
  return ["blank", ...meta.character.split("\n"), " "];
}
