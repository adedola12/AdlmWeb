// server/utils/cloudinaryUpload.js
import cloudinary from "./cloudinaryConfig.js";

/**
 * Upload a Buffer to Cloudinary using upload_stream.
 * @param {Buffer} buffer
 * @param {Object} opts
 *  - publicId?: string
 *  - folder?: string
 *  - resourceType?: "video" | "image" | "raw"
 *  - extra?: Cloudinary options
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
export function uploadBufferToCloudinary(
  buffer,
  {
    publicId,
    folder = process.env.CLOUDINARY_FOLDER || "adlm/previews",
    resourceType = "video", // IMPORTANT: "video", not "mp4"
    extra = {},
  } = {}
) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId, // let Cloudinary generate one if omitted
        resource_type: resourceType, // "video"
        ...extra,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}
