// POST /me/media/sign  (for profile avatars)
router.post("/sign", async (req, res) => {
  try {
    const resource_type = String(
      req.body?.resource_type || "image"
    ).toLowerCase();

    // ✅ lock avatars to image uploads only
    if (resource_type !== "image") {
      return res.status(400).json({ error: "Only image uploads allowed" });
    }

    // ✅ lock folder to avatars only (prevent abuse)
    const folder = process.env.CLOUDINARY_AVATAR_FOLDER || "adlm/avatars";

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = { timestamp, folder };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.json({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      resource_type: "image",
    });
  } catch (e) {
    console.error("[me-media sign] error:", e);
    return res.status(500).json({ error: e.message || "Failed to sign" });
  }
});
