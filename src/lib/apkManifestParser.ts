export interface ParsedApkMetadata {
  validZipApk: boolean;
  packageId?: string;
  versionCode?: number;
  versionName?: string;
}

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;
const RES_XML_START_ELEMENT_TYPE = 0x0102;

const ATTR_ID_VERSION_CODE = 0x0101021b;
const ATTR_ID_VERSION_NAME = 0x0101021c;

function readVarLenUtf8(bytes: Uint8Array, pos: number): [number, number] {
  const first = bytes[pos] ?? 0;
  if ((first & 0x80) !== 0) {
    const second = bytes[pos + 1] ?? 0;
    return [((first & 0x7f) << 8) | second, pos + 2];
  }
  return [first, pos + 1];
}

function readVarLenUtf16(view: DataView, pos: number): [number, number] {
  const first = view.getUint16(pos, true);
  if ((first & 0x8000) !== 0) {
    const second = view.getUint16(pos + 2, true);
    return [((first & 0x7fff) << 16) | second, pos + 4];
  }
  return [first, pos + 2];
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream unavailable');
  }
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([copy]).stream().pipeThrough(ds);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function parseBinaryAndroidManifest(axml: Uint8Array): Partial<ParsedApkMetadata> {
  if (axml.byteLength < 8) return {};
  const view = new DataView(axml.buffer, axml.byteOffset, axml.byteLength);
  const rootType = view.getUint16(0, true);
  if (rootType !== RES_XML_TYPE) return {};

  const strings: string[] = [];
  const resourceIds: number[] = [];
  const textDecoderUtf8 = new TextDecoder('utf-8');
  const textDecoderUtf16 = new TextDecoder('utf-16le');

  let offset = view.getUint16(2, true);
  while (offset + 8 <= axml.byteLength) {
    const chunkType = view.getUint16(offset, true);
    const headerSize = view.getUint16(offset + 2, true);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkSize < 8 || offset + chunkSize > axml.byteLength) break;

    if (chunkType === RES_STRING_POOL_TYPE && chunkSize >= 28) {
      const stringCount = view.getUint32(offset + 8, true);
      const flags = view.getUint32(offset + 16, true);
      const stringsStart = view.getUint32(offset + 20, true);
      const isUtf8 = (flags & 0x0100) !== 0;
      const poolBase = offset + stringsStart;

      for (let i = 0; i < stringCount; i += 1) {
        const idxPos = offset + headerSize + i * 4;
        if (idxPos + 4 > offset + chunkSize) break;
        const strRel = view.getUint32(idxPos, true);
        let cursor = poolBase + strRel;
        if (cursor >= offset + chunkSize) {
          strings.push('');
          continue;
        }
        if (isUtf8) {
          const [, afterChars] = readVarLenUtf8(axml, cursor);
          const [byteLen, dataStart] = readVarLenUtf8(axml, afterChars);
          const end = Math.min(offset + chunkSize, dataStart + byteLen);
          strings.push(textDecoderUtf8.decode(axml.subarray(dataStart, end)));
        } else {
          const [charLen, dataStart] = readVarLenUtf16(view, cursor);
          const end = Math.min(offset + chunkSize, dataStart + charLen * 2);
          strings.push(textDecoderUtf16.decode(axml.subarray(dataStart, end)));
        }
      }
    } else if (chunkType === RES_XML_RESOURCE_MAP_TYPE) {
      const count = Math.floor((chunkSize - headerSize) / 4);
      for (let i = 0; i < count; i += 1) {
        resourceIds.push(view.getUint32(offset + headerSize + i * 4, true));
      }
    } else if (chunkType === RES_XML_START_ELEMENT_TYPE && offset + 36 <= axml.byteLength) {
      const nameIdx = view.getUint32(offset + 20, true);
      const elemName = strings[nameIdx] || '';
      if (elemName === 'manifest') {
        const attrStart = view.getUint16(offset + 24, true);
        const attrSize = view.getUint16(offset + 26, true) || 20;
        const attrCount = view.getUint16(offset + 28, true);
        const attrBase = offset + 16 + attrStart;

        let packageId: string | undefined;
        let versionCode: number | undefined;
        let versionName: string | undefined;

        for (let i = 0; i < attrCount; i += 1) {
          const pos = attrBase + i * attrSize;
          if (pos + 20 > offset + chunkSize) break;
          const attrNameIdx = view.getUint32(pos + 4, true);
          const rawValueIdx = view.getUint32(pos + 8, true);
          const dataType = axml[pos + 15];
          const data = view.getUint32(pos + 16, true);

          const attrName = strings[attrNameIdx] || '';
          const resId = resourceIds[attrNameIdx];

          const readStringAttr = (): string | undefined => {
            if (rawValueIdx !== 0xffffffff && strings[rawValueIdx] !== undefined) {
              return strings[rawValueIdx];
            }
            if (dataType === 0x03 && strings[data] !== undefined) {
              return strings[data];
            }
            return undefined;
          };

          if (attrName === 'package') {
            packageId = readStringAttr();
          } else if (resId === ATTR_ID_VERSION_CODE || attrName === 'versionCode') {
            if (dataType === 0x10 || dataType === 0x11) {
              versionCode = data;
            }
          } else if (resId === ATTR_ID_VERSION_NAME || attrName === 'versionName') {
            versionName = readStringAttr();
          }
        }

        return { packageId, versionCode, versionName };
      }
    }

    offset += chunkSize;
  }

  return {};
}

/**
 * קורא בקלילות את AndroidManifest.xml מתוך קובץ ה-APK בדפדפן (ללא טעינת כל הקובץ לזיכרון),
 * ומחלץ versionCode, versionName ו-packageId.
 */
export async function parseApkManifestMetadata(
  file: Blob & { name?: string }
): Promise<ParsedApkMetadata> {
  if (file.size < 64) {
    return { validZipApk: false };
  }

  const head = new DataView(await file.slice(0, 4).arrayBuffer());
  if (head.getUint32(0, true) !== LFH_SIG) {
    return { validZipApk: false };
  }

  const tailSize = Math.min(file.size, 65557);
  const tailOffset = file.size - tailSize;
  const tailBytes = new Uint8Array(await file.slice(tailOffset, file.size).arrayBuffer());
  const tailView = new DataView(tailBytes.buffer);

  let eocdPos = -1;
  for (let i = tailBytes.byteLength - 22; i >= 0; i -= 1) {
    if (tailView.getUint32(i, true) === EOCD_SIG) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) {
    return { validZipApk: false };
  }

  const cdSize = tailView.getUint32(eocdPos + 12, true);
  const cdOffset = tailView.getUint32(eocdPos + 16, true);
  if (cdOffset + cdSize > file.size) {
    return { validZipApk: false };
  }

  const cdBytes = new Uint8Array(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const cdView = new DataView(cdBytes.buffer);
  const nameDecoder = new TextDecoder('utf-8');

  let pos = 0;
  let manifestEntry: { method: number; compressedSize: number; localHeaderOffset: number } | null =
    null;

  while (pos + 46 <= cdBytes.byteLength) {
    if (cdView.getUint32(pos, true) !== CDH_SIG) break;
    const method = cdView.getUint16(pos + 10, true);
    const compressedSize = cdView.getUint32(pos + 20, true);
    const nameLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commentLen = cdView.getUint16(pos + 32, true);
    const localHeaderOffset = cdView.getUint32(pos + 42, true);

    const nameEnd = pos + 46 + nameLen;
    if (nameEnd <= cdBytes.byteLength) {
      const entryName = nameDecoder.decode(cdBytes.subarray(pos + 46, nameEnd));
      if (entryName === 'AndroidManifest.xml') {
        manifestEntry = { method, compressedSize, localHeaderOffset };
        break;
      }
    }
    pos = nameEnd + extraLen + commentLen;
  }

  if (!manifestEntry) {
    return { validZipApk: true };
  }

  const lfhBuf = await file
    .slice(manifestEntry.localHeaderOffset, manifestEntry.localHeaderOffset + 30)
    .arrayBuffer();
  const lfhView = new DataView(lfhBuf);
  if (lfhView.getUint32(0, true) !== LFH_SIG) {
    return { validZipApk: true };
  }

  const lfhNameLen = lfhView.getUint16(26, true);
  const lfhExtraLen = lfhView.getUint16(28, true);
  const dataStart = manifestEntry.localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
  const rawPayload = new Uint8Array(
    await file.slice(dataStart, dataStart + manifestEntry.compressedSize).arrayBuffer()
  );

  let axmlBytes: Uint8Array;
  if (manifestEntry.method === 0) {
    axmlBytes = rawPayload;
  } else if (manifestEntry.method === 8) {
    axmlBytes = await inflateRawBytes(rawPayload);
  } else {
    return { validZipApk: true };
  }

  const parsed = parseBinaryAndroidManifest(axmlBytes);
  if (!parsed.versionName && typeof file.name === 'string') {
    const m = file.name.match(/(\d+\.\d+\.\d+)/);
    if (m) parsed.versionName = m[1];
  }

  return {
    validZipApk: true,
    ...parsed,
  };
}
