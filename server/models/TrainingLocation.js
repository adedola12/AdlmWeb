import mongoose from "mongoose";

const TrainingLocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },

    trainingCostNGN: { type: Number, default: 0 },
    trainingCostUSD: { type: Number, default: 0 },

    bimInstallCostNGN: { type: Number, default: 0 },
    bimInstallCostUSD: { type: Number, default: 0 },

    durationDays: { type: Number, default: 1, min: 1 },

    // WHAT IT COSTS US TO GET THERE AND STAY THERE.
    //
    // trainingCostNGN above is what the CLIENT pays and does not move. These
    // are the other side: the rates util/trainingCost.js does its arithmetic
    // over, so a fee can be set against a real number.
    //
    // Rates, not prices: there is no flight API and no live hotel pricing here,
    // and inventing either would produce a total that looks authoritative and
    // is fiction. Somebody maintains these, and a rate left at 0 is reported as
    // missing rather than counted as free.
    travel: {
      // Empty on a city the team drives to — see byRoad.
      flightNGN: { type: Number, default: 0 },
      hotelPerNightNGN: { type: Number, default: 0 },
      feedingPerDayNGN: { type: Number, default: 0 },
      // One way. Used instead of flights on a road trip, and charged as a
      // return, every day of the training.
      localFareNGN: { type: Number, default: 0 },
      otherNGN: { type: Number, default: 0 },
      otherLabel: { type: String, trim: true, default: "" },
      // null lets the city decide (Lagos is a road trip); true or false is a
      // deliberate answer for anywhere else.
      byRoad: { type: Boolean, default: null },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TrainingLocation =
  mongoose.models.TrainingLocation ||
  mongoose.model("TrainingLocation", TrainingLocationSchema);
