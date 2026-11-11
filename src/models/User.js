const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    // unique 5-digit numeric userId as a string: "12345"
    _id: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    gender: {
      type: String,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    nicNo: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    // Farm home location chosen by the user (portal Profile page)
    homeLocation: {
      type: new mongoose.Schema(
        {
          lat: { type: Number, required: true, min: -90, max: 90 },
          lon: { type: Number, required: true, min: -180, max: 180 },
          name: { type: String, trim: true, maxlength: 80 },
          updatedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.userId = ret._id;
        delete ret.password;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model("User", UserSchema);
