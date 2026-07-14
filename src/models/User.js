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
