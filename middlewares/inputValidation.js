import { z } from "zod";

export const validateFile = (req, res, next) => {
  // Simple check for file existence using Zod schema for structure if needed, 
  // but for express req.file it's easier to check directly or wrap.
  // We'll enforce that a file MUST be present for upload routes.
  
  const hasSingle = !!req.file;
  const hasMultiple = req.files && Array.isArray(req.files) && req.files.length > 0;

  if (!hasSingle && !hasMultiple) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "No file uploaded. Please select a PDF, Excel, or CSV file."
    });
  }

  // Optional: Check file size or type here if not handled by multer
  next();
};

export const validateBody = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      details: error.errors
    });
  }
};
