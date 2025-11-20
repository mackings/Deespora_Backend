const express = require ("express");
const { Category, Listing } = require("../models/listingModel");
const ImageKit = require("imagekit");
const { error,success} = require("../utils/response");



// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// Helper function to upload image to ImageKit
const uploadToImageKit = async (fileBuffer, fileName, folder = "listings") => {
  try {
    const result = await imagekit.upload({
      file: fileBuffer,
      fileName: fileName,
      folder: folder,
      useUniqueFileName: true,
    });
    return result.url;
  } catch (error) {
    throw new Error(`Image upload failed: ${error.message}`);
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
      promoteOnHomepage,
      highlightInNewsletter,
      addTrendingBadge,
      promotionDuration,
      promotionStartDate,
      userId,
    } = req.body;

    // Filter files to get only images
    const imageFiles = req.files?.filter(file => file.fieldname === 'images') || [];

    if (!title) {
      console.log('Title missing! req.body:', req.body);
      return error(res, "Title is required", 400);
    }
    
    if (!category) {
      return error(res, "Category is required", 400);
    }

    if (!userId) {
      return error(res, "User ID is required", 400);
    }

    // Find category by name or ID
    let categoryDoc;
    
    // Check if category is a valid ObjectId (24 hex characters)
    if (/^[0-9a-fA-F]{24}$/.test(category)) {
      // It's an ID, find by ID
      categoryDoc = await Category.findById(category);
    } else {
      // It's a name, find by name (case-insensitive)
      categoryDoc = await Category.findOne({ 
        name: { $regex: new RegExp(`^${category}$`, 'i') } 
      });
    }

    if (!categoryDoc) {
      return error(res, "Invalid category. Category not found.", 404);
    }

    // Handle image uploads to ImageKit
    let uploadedImages = [];
    if (imageFiles && imageFiles.length > 0) {
      if (imageFiles.length > 6) {
        return error(res, "Maximum 6 images allowed", 400);
      }

      for (let i = 0; i < imageFiles.length; i++) {
        const imageUrl = await uploadToImageKit(
          imageFiles[i].buffer,
          `${title.replace(/\s+/g, "-")}-${Date.now()}-${i}`,
          "listings"
        );
        uploadedImages.push(imageUrl);
      }
    }

    const listing = await Listing.create({
      title,
      description,
      category: categoryDoc._id, // Use the category ID
      location,
      contactPhone,
      websiteUrl,
      eventDate,
      images: uploadedImages,
      createdBy: userId,
      status: true,
      promoted: promoteOnHomepage || highlightInNewsletter || addTrendingBadge || false,
      promotionDetails: {
        onHomepage: promoteOnHomepage === "true" || promoteOnHomepage === true,
        inNewsletter: highlightInNewsletter === "true" || highlightInNewsletter === true,
        trendingBadge: addTrendingBadge === "true" || addTrendingBadge === true,
        duration: promotionDuration || null,
        startDate: promotionStartDate || null,
      },
    });

    // Populate category for the response
    await listing.populate('category', 'name slug icon');

    return success(res, "Listing created successfully", {
      listing: {
        id: listing._id,
        title: listing.title,
        description: listing.description,
        category: {
          id: listing.category._id,
          name: listing.category.name,
          slug: listing.category.slug,
          icon: listing.category.icon,
        },
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
    console.error('Error creating listing:', e);
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

   // const userId = req.user.uid;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return error(res, "Listing not found", 404);
    }

    // if (String(listing.createdBy) !== userId) {
    //   return error(res, "Unauthorized to promote this listing", 403);
    // }

    listing.promoted = promoteOnHomepage || highlightInNewsletter || addTrendingBadge || false;
    listing.promotionDetails = {
      onHomepage: promoteOnHomepage === "true" || promoteOnHomepage === true,
      inNewsletter: highlightInNewsletter === "true" || highlightInNewsletter === true,
      trendingBadge: addTrendingBadge === "true" || addTrendingBadge === true,
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
    //const userId = req.user.uid;
    const files = req.files;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return error(res, "Listing not found", 404);
    }

    // if (String(listing.createdBy) !== userId) {
    //   return error(res, "Unauthorized to update this listing", 403);
    // }

    // Handle new image uploads
    if (files && files.length > 0) {
      if (files.length > 6) {
        return error(res, "Maximum 6 images allowed", 400);
      }

      let uploadedImages = [];
      for (let i = 0; i < files.length; i++) {
        const imageUrl = await uploadToImageKit(
          files[i].buffer,
          `${listing.title.replace(/\s+/g, "-")}-${Date.now()}-${i}`,
          "listings"
        );
        uploadedImages.push(imageUrl);
      }
      listing.images = uploadedImages;
    }

    const allowedUpdates = [
      "title",
      "description",
      "category",
      "location",
      "contactPhone",
      "websiteUrl",
      "eventDate",
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
   // const userId = req.user.uid;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return error(res, "Listing not found", 404);
    }

    // if (String(listing.createdBy) !== userId) {
    //   return error(res, "Unauthorized to delete this listing", 403);
    // }

    await listing.deleteOne();

    return success(res, "Listing deleted successfully", null);
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// ===============================
// CATEGORY CONTROLLERS
// ===============================

exports.createCategory = async (req, res) => {
  try {
    const { name, slug } = req.body;
    const file = req.file; // single file from multer

    if (!name) {
      return error(res, "Category name is required", 400);
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return error(res, "Category with this name already exists", 409);
    }

    // Handle icon upload to ImageKit
    let iconUrl = null;
    if (file) {
      iconUrl = await uploadToImageKit(
        file.buffer,
        `category-${name.replace(/\s+/g, "-")}-${Date.now()}`,
        "categories"
      );
    }

    const category = await Category.create({
      name,
      slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
      icon: iconUrl,
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
    const { name, slug, status } = req.body;
    const file = req.file;

    const category = await Category.findById(categoryId);
    if (!category) {
      return error(res, "Category not found", 404);
    }

    // Handle new icon upload
    if (file) {
      const iconUrl = await uploadToImageKit(
        file.buffer,
        `category-${name || category.name}-${Date.now()}`,
        "categories"
      );
      category.icon = iconUrl;
    }

    if (name) category.name = name;
    if (slug) category.slug = slug;
    if (status !== undefined) category.status = status === "true" || status === true;

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