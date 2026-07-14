const mongoose = require("mongoose");

const CattleSchema = new mongoose.Schema(
  {
    // unique cattleId supplied by frontend/user as a string
    _id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    breed: {
      type: String,
      trim: true,
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
    weight: {
      type: Number,
    },
    healthNotes: {
      type: String,
      trim: true,
    },
    farmName: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    Image: {
      type: String,
      trim: true,
    },
    collarId: {
      type: String,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.cattleId = ret._id;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model("Cattle", CattleSchema);
