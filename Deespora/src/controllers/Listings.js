const express = require ("express");
const Category = require("../models/listingModel");
const Listing = require("../models/listingModel");
const ImageKit = require("imagekit");



// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// Helper function to upload image to ImageKit
const uploadToImageKit = async (file, fileName, folder = "listings") => {
  try {
    const result = await imagekit.upload({
      file: file, // base64 string or buffer or url
      fileName: fileName,
      folder: folder,
      useUniqueFileName: true,
    });
    return result.url;
  } catch (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }
};

// Helper function to delete image from ImageKit
const deleteFromImageKit = async (fileId) => {
  try {
    await imagekit.deleteFile(fileId);
  } catch (error) {
    console.error("Failed to delete image from ImageKit:", error.message);
  }
};

// ===============================
// LISTING CONTROLLERS
// ===============================

exports.createListing = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      location,
      contactPhone,
      websiteUrl,
      eventDate,
      images,
      promoteOnHomepage,
      highlightInNewsletter,
      addTrendingBadge,
      promotionDuration,
      promotionStartDate,
    } = req.body;

    const userId = req.user.uid;

    if (!title || !category) {
      return error(res, "Title and category are required", 400);
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return error(res, "Invalid category", 404);
    }

    // Handle image uploads to ImageKit
    let uploadedImages = [];
    if (images && images.length > 0) {
      if (images.length > 6) {
        return error(res, "Maximum 6 images allowed", 400);
      }

      for (let i = 0; i < images.length; i++) {
        const imageUrl = await uploadToImageKit(
          images[i],
          `${title.replace(/\s+/g, "-")}-${Date.now()}-${i}`,
          "listings"
        );
        uploadedImages.push(imageUrl);
      }
    }

    const listing = await Listing.create({
      title,
      description,
      category,
      location,
      contactPhone,
      websiteUrl,
      eventDate,
      images: uploadedImages,
      createdBy: userId,
      status: true,
      promoted: promoteOnHomepage || highlightInNewsletter || addTrendingBadge || false,
      promotionDetails: {
        onHomepage: promoteOnHomepage || false,
        inNewsletter: highlightInNewsletter || false,
        trendingBadge: addTrendingBadge || false,
        duration: promotionDuration || null,
        startDate: promotionStartDate || null,
      },
    });

    return success(res, "Listing created successfully", {
      listing: {
        id: listing._id,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        location: listing.location,
        contactPhone: listing.contactPhone,
        websiteUrl: listing.websiteUrl,
        eventDate: listing.eventDate,
        images: listing.images,
        promoted: listing.promoted,
        status: listing.status,
        createdAt: listing.createdAt,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.uploadListingImages = async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return error(res, "No images provided", 400);
    }

    if (files.length > 6) {
      return error(res, "Maximum 6 images allowed", 400);
    }

    const uploadedImages = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imageUrl = await uploadToImageKit(
        file.buffer,
        `listing-${Date.now()}-${i}`,
        "listings"
      );
      uploadedImages.push(imageUrl);
    }

    return success(res, "Images uploaded successfully", {
      images: uploadedImages,
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.promoteListing = async (req, res) => {
  try {
    const { listingId } = req.params;
    const {
      promoteOnHomepage,
      highlightInNewsletter,
      addTrendingBadge,
      promotionDuration,
      promotionStartDate,
    } = req.body;

    const userId = req.user.uid;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return error(res, "Listing not found", 404);
    }

    if (String(listing.createdBy) !== userId) {
      return error(res, "Unauthorized to promote this listing", 403);
    }

    listing.promoted = promoteOnHomepage || highlightInNewsletter || addTrendingBadge || false;
    listing.promotionDetails = {
      onHomepage: promoteOnHomepage || false,
      inNewsletter: highlightInNewsletter || false,
      trendingBadge: addTrendingBadge || false,
      duration: promotionDuration || null,
      startDate: promotionStartDate || null,
    };

    await listing.save();

    return success(res, "Listing promoted successfully", {
      listing: {
        id: listing._id,
        title: listing.title,
        promoted: listing.promoted,
        promotionDetails: listing.promotionDetails,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.getListings = async (req, res) => {
  try {
    const { category, status, promoted, search, page = 1, limit = 10 } = req.query;

    const query = {};

    if (category) query.category = category;
    if (status !== undefined) query.status = status === "true";
    if (promoted !== undefined) query.promoted = promoted === "true";
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const listings = await Listing.find(query)
      .populate("category", "name slug")
      .populate("createdBy", "firstName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Listing.countDocuments(query);

    return success(res, "Listings retrieved successfully", {
      listings: listings.map((l) => ({
        id: l._id,
        title: l.title,
        description: l.description,
        category: l.category,
        location: l.location,
        contactPhone: l.contactPhone,
        websiteUrl: l.websiteUrl,
        eventDate: l.eventDate,
        images: l.images,
        promoted: l.promoted,
        promotionDetails: l.promotionDetails,
        status: l.status,
        createdBy: l.createdBy,
        createdAt: l.createdAt,
      })),
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
        limit: Number(limit),
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.getListingById = async (req, res) => {
  try {
    const { listingId } = req.params;

    const listing = await Listing.findById(listingId)
      .populate("category", "name slug icon")
      .populate("createdBy", "firstName email");

    if (!listing) {
      return error(res, "Listing not found", 404);
    }

    return success(res, "Listing retrieved successfully", {
      listing: {
        id: listing._id,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        location: listing.location,
        contactPhone: listing.contactPhone,
        websiteUrl: listing.websiteUrl,
        eventDate: listing.eventDate,
        images: listing.images,
        promoted: listing.promoted,
        promotionDetails: listing.promotionDetails,
        status: listing.status,
        createdBy: listing.createdBy,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.updateListing = async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.user.uid;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return error(res, "Listing not found", 404);
    }

    if (String(listing.createdBy) !== userId) {
      return error(res, "Unauthorized to update this listing", 403);
    }

    const allowedUpdates = [
      "title",
      "description",
      "category",
      "location",
      "contactPhone",
      "websiteUrl",
      "eventDate",
      "images",
      "status",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    await listing.save();

    return success(res, "Listing updated successfully", {
      listing: {
        id: listing._id,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        location: listing.location,
        contactPhone: listing.contactPhone,
        websiteUrl: listing.websiteUrl,
        eventDate: listing.eventDate,
        images: listing.images,
        status: listing.status,
        updatedAt: listing.updatedAt,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.deleteListing = async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.user.uid;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return error(res, "Listing not found", 404);
    }

    if (String(listing.createdBy) !== userId) {
      return error(res, "Unauthorized to delete this listing", 403);
    }

    await listing.deleteOne();

    return success(res, "Listing deleted successfully", null);
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// ===============================
// CATEGORY CONTROLLERS
// ===============================

exports.uploadCategoryIcon = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return error(res, "No icon provided", 400);
    }

    const iconUrl = await uploadToImageKit(
      file.buffer,
      `category-icon-${Date.now()}`,
      "categories"
    );

    return success(res, "Icon uploaded successfully", {
      icon: iconUrl,
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, slug, icon } = req.body;

    if (!name) {
      return error(res, "Category name is required", 400);
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return error(res, "Category with this name already exists", 409);
    }

    const category = await Category.create({
      name,
      slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
      icon: icon || null,
      status: true,
    });

    return success(res, "Category created successfully", {
      category: {
        id: category._id,
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        status: category.status,
        createdAt: category.createdAt,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { status, search } = req.query;

    const query = {};

    if (status !== undefined) query.status = status === "true";
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const categories = await Category.find(query).sort({ name: 1 });

    return success(res, "Categories retrieved successfully", {
      categories: categories.map((c) => ({
        id: c._id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        status: c.status,
        createdAt: c.createdAt,
      })),
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return error(res, "Category not found", 404);
    }

    const listingCount = await Listing.countDocuments({ category: categoryId });

    return success(res, "Category retrieved successfully", {
      category: {
        id: category._id,
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        status: category.status,
        listingCount,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, slug, icon, status } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      return error(res, "Category not found", 404);
    }

    if (name) category.name = name;
    if (slug) category.slug = slug;
    if (icon !== undefined) category.icon = icon;
    if (status !== undefined) category.status = status;

    await category.save();

    return success(res, "Category updated successfully", {
      category: {
        id: category._id,
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        status: category.status,
        updatedAt: category.updatedAt,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return error(res, "Category not found", 404);
    }

    const listingCount = await Listing.countDocuments({ category: categoryId });
    if (listingCount > 0) {
      return error(
        res,
        "Cannot delete category with existing listings. Please reassign or delete listings first.",
        400
      );
    }

    await category.deleteOne();

    return success(res, "Category deleted successfully", null);
  } catch (e) {
    return error(res, e.message, 500);
  }
};