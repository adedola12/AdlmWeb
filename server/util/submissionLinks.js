// Fill in a download link for submissions kept in private storage. The link
// is signed at the moment the list is read and lasts an hour, so the screens
// that show fileUrl (the learner's course page, both grading queues) keep
// working unchanged and nothing private is ever public.
import { presignDownload } from "./fileStore.js";

export async function withFileLinks(rows, { expiresIn = 3600 } = {}) {
  return Promise.all(
    (rows || []).map(async (s) => {
      if (!s?.fileKey) return s;
      try {
        const url = await presignDownload({ key: s.fileKey, storage: s.storage, fileName: s.fileName, expiresIn });
        return { ...s, fileUrl: url };
      } catch {
        return s;
      }
    }),
  );
}
