const mongoose = require("mongoose");

// ===============================
// CATEGORY MODEL
// ===============================

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    icon: {
      type: String,
      default: null,
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
categorySchema.index({ name: 1 });
categorySchema.index({ slug: 1 });
categorySchema.index({ status: 1 });

const Category = mongoose.model("Category", categorySchema);

// ===============================
// LISTING MODEL
// ===============================

const listingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    websiteUrl: {
      type: String,
      trim: true,
      default: "",
    },
    eventDate: {
      type: Date,
      default: null,
    },
    images: [
      {
        type: String,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    promoted: {
      type: Boolean,
      default: false,
    },
    promotionDetails: {
      onHomepage: {
        type: Boolean,
        default: false,
      },
      inNewsletter: {
        type: Boolean,
        default: false,
      },
      trendingBadge: {
        type: Boolean,
        default: false,
      },
      duration: {
        type: String,
        enum: ["3 Days", "7 Days", "14 Days", "30 Days", null],
        default: null,
      },
      startDate: {
        type: Date,
        default: null,
      },
      endDate: {
        type: Date,
        default: null,
      },
    },
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
listingSchema.index({ category: 1 });
listingSchema.index({ createdBy: 1 });
listingSchema.index({ status: 1 });
listingSchema.index({ promoted: 1 });
listingSchema.index({ createdAt: -1 });
listingSchema.index({ title: "text", description: "text" });

// Pre-save middleware to calculate promotion end date
listingSchema.pre("save", function (next) {
  if (this.isModified("promotionDetails.duration") || this.isModified("promotionDetails.startDate")) {
    if (this.promotionDetails.duration && this.promotionDetails.startDate) {
      const durationMap = {
        "3 Days": 3,
        "7 Days": 7,
        "14 Days": 14,
        "30 Days": 30,
      };

      const days = durationMap[this.promotionDetails.duration];
      if (days) {
        const endDate = new Date(this.promotionDetails.startDate);
        endDate.setDate(endDate.getDate() + days);
        this.promotionDetails.endDate = endDate;
      }
    }
  }
  next();
});

// Method to check if promotion is active
listingSchema.methods.isPromotionActive = function () {
  if (!this.promoted || !this.promotionDetails.startDate || !this.promotionDetails.endDate) {
    return false;
  }

  const now = new Date();
  return (
    now >= this.promotionDetails.startDate &&
    now <= this.promotionDetails.endDate
  );
};

// Method to increment views
listingSchema.methods.incrementViews = async function () {
  this.views += 1;
  await this.save();
};

// Static method to get promoted listings
listingSchema.statics.getPromotedListings = function (promotionType) {
  const query = {
    status: true,
    promoted: true,
  };

  const now = new Date();
  query["promotionDetails.startDate"] = { $lte: now };
  query["promotionDetails.endDate"] = { $gte: now };

  if (promotionType === "homepage") {
    query["promotionDetails.onHomepage"] = true;
  } else if (promotionType === "newsletter") {
    query["promotionDetails.inNewsletter"] = true;
  } else if (promotionType === "trending") {
    query["promotionDetails.trendingBadge"] = true;
  }

  return this.find(query)
    .populate("category", "name slug icon")
    .populate("createdBy", "firstName email")
    .sort({ "promotionDetails.startDate": -1 });
};

// Static method to expire old promotions
listingSchema.statics.expirePromotions = async function () {
  const now = new Date();
  
  const result = await this.updateMany(
    {
      promoted: true,
      "promotionDetails.endDate": { $lt: now },
    },
    {
      $set: {
        promoted: false,
        "promotionDetails.onHomepage": false,
        "promotionDetails.inNewsletter": false,
        "promotionDetails.trendingBadge": false,
      },
    }
  );

  return result;
};

const Listing = mongoose.model("Listing", listingSchema);

// ===============================
// EXPORTS
// ===============================

module.exports = {
  Category,
  Listing,
};