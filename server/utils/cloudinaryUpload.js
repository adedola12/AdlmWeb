// utils/cloudinaryUpload.js
import cloudinary from "./cloudinaryConfig.js";

export const uploadBufferToCloudinary = async (buffer, fileName) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: "image",
          public_id: fileName,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      )
      .end(buffer);
  });
};
