import { MAX_BODY_SIZE_BYTES, MAX_BODY_SIZE_KB } from '../config.mjs';
import { ApiError } from './httpResponse.mjs';

export async function parseJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_BODY_SIZE_BYTES) {
      throw new ApiError(413, `요청 본문이 너무 커. 최대 ${MAX_BODY_SIZE_KB}KB 까지만 보낼 수 있어.`);
    }

    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, '요청 본문이 올바른 JSON 형식이 아니야.');
  }
}
