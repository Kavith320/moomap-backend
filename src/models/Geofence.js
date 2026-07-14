// src/models/Geofence.js
const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
  },
  { _id: false }
);

const singleGeofenceSchema = new mongoose.Schema(
  {
    name: { type: String },              // optional label for UI
    enabled: { type: Boolean, default: true },
    polygon: {
      type: [pointSchema],               // [{lat, lon}, ...]
      default: [],
    },
    cattleIds: {
      type: [String],                    // list of cattle IDs
      default: [],
    },
  },
  {
    _id: true,                           // each geofence has its own _id
    timestamps: true,                    // createdAt, updatedAt INSIDE geofence
  }
);

const userGeofenceSchema = new mongoose.Schema(
  {
    // one document per user
    userId: {
      type: String,
      required: true,
      unique: true,                      // each user only one geofence doc
    },
    geofences: {
      type: [singleGeofenceSchema],
      default: [],
    },
  },
  {
    timestamps: true,                    // createdAt, updatedAt for the whole doc
    collection: 'geofence',   
    versionKey: false                    // collection name = "geofence"
  }
);

module.exports = mongoose.model('Geofence', userGeofenceSchema);
