import mongoose from "mongoose";

/**
 * Read-mostly view of the `whatsappchats` collection.
 *
 * The WhatsApp bot (ADLMWhatsAppBot) owns this collection and is the only
 * writer of tags and transcripts. This model exists so the admin board can read
 * it and make the few operational edits a human makes from the queue: taking
 * ownership, clearing an ops flag, moving a stage.
 *
 * `strict: false` is deliberate and load-bearing. Two services share this
 * collection and the bot's schema will move first; a strict schema here would
 * silently drop fields it had not been taught about yet. Anything the bot adds
 * still round-trips through this model untouched.
 *
 * `strictQuery: false` is not optional here, and the reason is a trap worth
 * spelling out. db.js sets `mongoose.set("strictQuery", true)` globally, which
 * strips query conditions on paths the schema does not declare. With a schema
 * that declares nothing, that strips *every* condition: `countDocuments({phone})`
 * silently becomes `countDocuments({})`. Nothing errors — the queue counts just
 * come back as the whole collection, and a findOneAndUpdate for one chat
 * quietly edits whichever document Mongo returns first.
 */
const WhatsAppChatSchema = new mongoose.Schema(
  {},
  { strict: false, strictQuery: false, timestamps: true }
);

export const WhatsAppChat =
  mongoose.models.WhatsAppChat ||
  mongoose.model("WhatsAppChat", WhatsAppChatSchema, "whatsappchats");
